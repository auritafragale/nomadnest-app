import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { redact } from "../_shared/safe-log.ts";

// One-off, admin-only cleanup of old private photos that were stored in the
// PUBLIC listing-images bucket.
//   kind "checkin" (default): check-in photos ({uid}/checkins/...)
//     see migration 20260927050000
//   kind "chat": chat photos ({uid}/chat-photos/...), see 20260927070000
//
//   { confirm: false } (default) -> preview only, nothing changes
//   { confirm: true, expected_files: n } -> deletes exactly the previewed
//     files (only paths in that kind's folder, never listing photos) and then
//     clears the references (check-in photo_url and chat cards, or the old
//     photo messages).
// expected_files must match the current count, so the delete only runs on
// the list the admin reviewed.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "listing-images";

const KINDS = {
  checkin: {
    folderRe: /^[^/]+\/check-?ins?\//i,
    preview: "admin_checkin_photo_cleanup_preview",
    clear: "admin_clear_public_checkin_photo_refs",
  },
  chat: {
    folderRe: /^[^/]+\/chat-?photos?\//i,
    preview: "admin_chat_photo_cleanup_preview",
    clear: "admin_clear_public_chat_photo_messages",
  },
} as const;
type Kind = keyof typeof KINDS;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: userData } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Please sign in again." }, 401);
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    if (profile?.is_admin !== true) {
      console.log(JSON.stringify({ fn: "cleanup-checkin-photos", rejected: "not_admin", user: user.id }));
      return json({ error: "Admins only." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const kind: Kind = body?.kind === "chat" ? "chat" : "checkin";
    const cfg = KINDS[kind];

    const { data: previewData, error: previewError } = await supabase.rpc(cfg.preview);
    if (previewError) throw new Error(`preview failed: ${previewError.message}`);
    const preview = previewData as { files: { name: string; size: number | null; created_at: string }[] } & Record<string, unknown>;
    // Belt and braces: only ever delete paths in this kind's folder.
    const files = preview.files.filter((f) => cfg.folderRe.test(f.name));

    if (body?.confirm !== true) {
      return json({ mode: "preview", kind, ...preview, files });
    }
    if (body.expected_files !== files.length) {
      return json({ error: "The list changed since your preview. Please preview again." }, 409);
    }

    let deleted = 0;
    for (let i = 0; i < files.length; i += 100) {
      const batch = files.slice(i, i + 100).map((f) => f.name);
      const { data: removed, error: removeError } = await supabase.storage.from(BUCKET).remove(batch);
      if (removeError) throw new Error(`delete failed after ${deleted} files: ${removeError.message}`);
      deleted += removed?.length ?? 0;
    }

    const { data: cleared, error: clearError } = await supabase.rpc(cfg.clear);
    if (clearError) throw new Error(`clearing references failed: ${clearError.message}`);

    console.log(JSON.stringify({ fn: "cleanup-checkin-photos", ok: true, kind, admin: user.id, deleted, cleared }));
    return json({ mode: "done", kind, files_deleted: deleted, ...(cleared as Record<string, unknown>) });
  } catch (err) {
    console.error("cleanup-checkin-photos failed:", redact(err));
    return json({ error: err instanceof Error ? err.message : "Cleanup failed." }, 500);
  }
});
