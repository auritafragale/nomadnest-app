import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { renderBrandedEmail, sendBrandedEmail } from "../_shared/branded-email.ts";
import { buildNotificationEmail } from "../_shared/email-templates.ts";
import { rejectIfNotInternal } from "../_shared/internal.ts";
import { redact } from "../_shared/safe-log.ts";

// "Message emails: Once a day". Run hourly by pg_cron (through
// public.request_internal_function). message_digest_due() returns the members
// on "Once a day" whose morning (about 8am in their time zone) it is, with
// their UNREAD messages since the last digest: a count and first names only,
// never message text. Messages already read in the app are never mentioned.
// Logs: counts only.

const MAX_PER_RUN = 300;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** "Marta", "Marta and Jonas", "Marta, Jonas and 2 others". */
const nameList = (names: string[]) => {
  const n = names.filter(Boolean);
  if (n.length <= 1) return n[0] ?? "a member";
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  if (n.length === 3) return `${n[0]}, ${n[1]} and ${n[2]}`;
  return `${n[0]}, ${n[1]} and ${n.length - 2} others`;
};

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rejected = rejectIfNotInternal(req, "message-email-digest");
  if (rejected) return rejected;

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  let sent = 0;
  let failed = 0;
  try {
    const { data: due, error } = await admin.rpc("message_digest_due", { p_force: false });
    if (error) throw new Error(`message_digest_due failed: ${error.code ?? ""}`);
    const rows = ((due ?? []) as { user_id: string; message_count: number; sender_names: string[] }[]).slice(0, MAX_PER_RUN);
    if (rows.length === 0) {
      console.log(JSON.stringify({ fn: "message-email-digest", due: 0 }));
      return new Response(JSON.stringify({ sent: 0 }), { headers: { "Content-Type": "application/json" } });
    }

    const { data: profiles } = await admin.from("profiles").select("id, email").in("id", rows.map((r) => r.user_id));
    const emailOf = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string | null]));
    const done: string[] = [];

    for (const r of rows) {
      const email = emailOf.get(r.user_id);
      if (!email || !r.message_count) continue;
      const data = { messageCount: String(r.message_count), senderNames: escapeHtml(nameList(r.sender_names ?? [])) };
      const content = buildNotificationEmail("message_digest", data);
      try {
        await sendBrandedEmail(email, content.subject, renderBrandedEmail(content, { preview: content.preview }));
        done.push(r.user_id);
        sent++;
      } catch (err) {
        failed++;
        console.error("message-email-digest send failed", redact(err));
      }
    }

    if (done.length) {
      const { error: markError } = await admin.rpc("mark_message_digest_sent", { p_user_ids: done });
      if (markError) console.error("mark_message_digest_sent failed", redact(markError));
    }
    console.log(JSON.stringify({ fn: "message-email-digest", due: rows.length, sent, failed }));
    return new Response(JSON.stringify({ sent, failed }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("message-email-digest failed:", redact(err));
    return new Response(JSON.stringify({ error: "failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
