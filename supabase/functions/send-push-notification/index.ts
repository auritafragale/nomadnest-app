import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

// Two ways in, and neither lets a member push to someone else:
//
// 1. USER MODE (the "send a test push" button): the caller's own JWT. The
//    recipient is always the caller — never a user id from the body.
//
// 2. INTERNAL MODE (the AFTER INSERT trigger on public.notifications): only
//    when the x-internal-secret header matches INTERNAL_TRIGGER_SECRET (the
//    trigger reads it from Vault). The body carries ONLY a notification_id; the
//    recipient, title, body and tap-through URL all come from that row. So even
//    this mode can't choose a recipient or send arbitrary text, only (re)send a
//    recent existing notification.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

// Internal-mode pushes are only sent for rows created in the last few minutes,
// so a captured request can't be replayed later to re-notify someone.
const MAX_NOTIFICATION_AGE_MS = 10 * 60 * 1000;

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Constant-time string comparison, so the secret can't be guessed by timing. */
const safeEqual = (a: string, b: string) => {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
};

/** Only in-app relative paths are allowed as tap-through targets. */
const safeUrl = (url: unknown) =>
  typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/dashboard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// deno-lint-ignore no-explicit-any
const sendToUser = async (supabase: any, userId: string, payload: PushPayload) => {
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error("VAPID keys not configured");
  }

  const { data: subscriptions, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (subError) throw subError;

  // No subscription = push is off on every device (or never enabled): skip.
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, total: 0 };
  }

  // Unread message count for the recipient, so sw.js can set the app badge.
  const { data: userConvos } = await supabase
    .from("conversations")
    .select("id")
    .or(`owner_user_id.eq.${userId},sitter_user_id.eq.${userId}`);
  const convIds = (userConvos || []).map((c: { id: string }) => c.id);
  let unreadCount = 1;
  if (convIds.length > 0) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", convIds)
      .neq("sender_user_id", userId)
      .is("read_at", null);
    unreadCount = count || 1;
  }

  webpush.setVapidDetails("mailto:hello@nomadnest.global", vapidPublicKey, vapidPrivateKey);
  const body = JSON.stringify({ ...payload, unreadCount });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        return true;
      } catch (error) {
        const err = error as { statusCode?: number; message?: string };
        console.error("Push failed for endpoint:", sub.endpoint.substring(0, 50), err.statusCode, err.message);
        // Subscription no longer valid on that device: remove it.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
        return false;
      }
    }),
  );

  const sent = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
  return { sent, total: subscriptions.length };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase credentials not configured");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));

    // ── Internal mode ────────────────────────────────────────────────────────
    const internalHeader = req.headers.get("x-internal-secret");
    if (internalHeader !== null) {
      const expected = Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
      if (!expected || !safeEqual(internalHeader, expected)) {
        return json({ error: "Unauthorized" }, 401);
      }

      const notificationId = body?.notification_id;
      if (typeof notificationId !== "string" || !UUID_RE.test(notificationId)) {
        return json({ error: "Invalid notification_id" }, 400);
      }

      const { data: row, error: rowError } = await supabase
        .from("notifications")
        .select("id, user_id, type, title, message, data, created_at")
        .eq("id", notificationId)
        .maybeSingle();
      if (rowError) throw rowError;
      if (!row) return json({ error: "Notification not found" }, 404);

      if (Date.now() - new Date(row.created_at).getTime() > MAX_NOTIFICATION_AGE_MS) {
        console.log("Skipping push for old notification", row.id);
        return json({ success: true, skipped: "too_old" });
      }

      const data = (row.data ?? {}) as Record<string, unknown>;
      const result = await sendToUser(supabase, row.user_id, {
        title: row.title || "NomadNest",
        body: row.message || "",
        url: safeUrl(data.url),
        tag: row.type || "nomadnest",
      });
      console.log(`Push for notification ${row.id} (${row.type}): ${result.sent}/${result.total}`);
      return json({ success: true, ...result });
    }

    // ── User mode: test push to yourself ────────────────────────────────────
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: caller, error: callerError } = await supabase.auth.getUser(jwt);
    if (callerError || !caller?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const payload = (body?.payload ?? {}) as Partial<PushPayload>;
    const result = await sendToUser(supabase, caller.user.id, {
      title: typeof payload.title === "string" ? payload.title.slice(0, 120) : "NomadNest",
      body: typeof payload.body === "string" ? payload.body.slice(0, 300) : "",
      url: safeUrl(payload.url),
      tag: typeof payload.tag === "string" ? payload.tag.slice(0, 60) : "nomadnest-test",
    });
    return json({ success: true, ...result });
  } catch (error) {
    console.error("Error in send-push-notification:", error instanceof Error ? error.message : error);
    return json({ error: "Could not send push notification" }, 500);
  }
});
