import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { redact } from "../_shared/safe-log.ts";

// "Download my data" (UK/EU right of access and portability).
// Returns the caller's data as JSON (export_account_data) plus signed links,
// valid for 7 days, to the files they uploaded (export_account_files).
// Only ever the caller's own data; limited to 5 exports a day; logs contain
// the user id and counts only.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FEATURE = "data_export";
const DAILY_LIMIT = 5;
const LINK_SECONDS = 7 * 24 * 60 * 60;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify({ fn: "export-my-data", ...entry }));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "Please sign in again." }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userError || !user) return json({ error: "Please sign in again." }, 401);

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("feature", FEATURE)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      return json({ error: "You've downloaded your data several times today. Please try again tomorrow." }, 429);
    }

    const { data: exportData, error: exportError } = await admin.rpc("export_account_data", { p_user_id: user.id });
    if (exportError) throw new Error(`export failed: ${exportError.message}`);

    // Sit Stories of sits they were part of (owner or sitter).
    const { data: stories } = await admin
      .from("sit_stories")
      .select("id, sit_id, status, title, story, photo_paths, portfolio_status, portfolio_photo_paths, created_at, ready_at")
      .or(`owner_user_id.eq.${user.id},sitter_user_id.eq.${user.id}`);

    const { data: files, error: filesError } = await admin.rpc("export_account_files", { p_user_id: user.id });
    if (filesError) throw new Error(`files failed: ${filesError.message}`);

    const byBucket = new Map<string, string[]>();
    for (const f of (files ?? []) as { bucket_id: string; name: string }[]) {
      byBucket.set(f.bucket_id, [...(byBucket.get(f.bucket_id) ?? []), f.name]);
    }
    const links: { bucket: string; path: string; url: string }[] = [];
    for (const [bucket, names] of byBucket) {
      for (let i = 0; i < names.length; i += 100) {
        const { data: signed } = await admin.storage.from(bucket).createSignedUrls(names.slice(i, i + 100), LINK_SECONDS);
        for (const s of signed ?? []) {
          if (s.path && s.signedUrl) links.push({ bucket, path: s.path, url: s.signedUrl });
        }
      }
    }

    await admin.from("ai_usage").insert({ user_id: user.id, feature: FEATURE });
    log({ user: user.id, ok: true, files: links.length });

    return json({
      ...(exportData as Record<string, unknown>),
      sit_stories: stories ?? [],
      files: links,
      files_note: "Download links for your files are valid for 7 days.",
    });
  } catch (err) {
    log({ user: user.id, failed: redact(err) });
    return json({ error: "We couldn't prepare your data just now. Please try again in a moment." }, 500);
  }
});
