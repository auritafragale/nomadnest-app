import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import {
  renderBrandedEmail,
  sendBrandedEmail,
} from "../_shared/branded-email.ts";
import { buildNotificationEmail } from "../_shared/email-templates.ts";

// Creates the in-app notification row (unless skipInAppNotification) and sends
// the email. The push is sent by the AFTER INSERT trigger on notifications.
//
// CALLERS
// * Internal (service-role key, or x-internal-secret = INTERNAL_TRIGGER_SECRET,
//   used by DB triggers/functions via Vault and by cron edge functions):
//   any type, data trusted.
// * Members (their own JWT): only the types in MEMBER_RULES, and only when the
//   request names a specific application / sit / conversation / invite / listing
//   that genuinely links the caller to the recipient and changed recently.
//   Display names and listing titles are then taken from the database, not
//   from the request. id_verification_approved: admins only.
//
// Every rejection logs one JSON line with the reason, never silently.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const log = (entry: Record<string, unknown>) =>
  console.log(JSON.stringify({ fn: "send-notification-email", ...entry }));

/** Logs why a request was refused, then returns the response. */
const reject = (
  reason: string,
  status: number,
  context: Record<string, unknown> = {},
  publicMessage = "Notification not sent",
) => {
  log({ rejected: reason, status, ...context });
  return json({ error: publicMessage, reason }, status);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const safeEqual = (a: string, b: string) => {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

/** Only in-app relative paths ("/..."), never "//host" or "@host" tricks. */
// Also no quotes, angle brackets, backslashes or whitespace: the path ends up
// inside an href="..." in the email.
const SAFE_PATH_RE = /^\/(?!\/)[^\s"'<>\\]*$/;
const safePath = (url: unknown): string | undefined =>
  typeof url === "string" && url.length <= 500 && SAFE_PATH_RE.test(url) ? url : undefined;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const minutesAgo = (iso: string | null | undefined) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity;

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
      })
    : "";

const fullName = (p: { first_name?: string | null; last_name?: string | null } | null, fallback: string) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || fallback;

const trimText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ─── Member rules ────────────────────────────────────────────────────────────

type Ctx = {
  sb: SupabaseClient;
  uid: string;
  recipient: string;
  data: Record<string, string>;
};
/** ok: data overrides to apply; otherwise the reason it was refused. */
type Verdict = { ok: true; data: Record<string, string> } | { ok: false; reason: string };
const refuse = (reason: string): Verdict => ({ ok: false, reason });

const callerName = async (sb: SupabaseClient, uid: string, fallback: string) => {
  const { data } = await sb.from("profiles").select("first_name, last_name").eq("id", uid).maybeSingle();
  return fullName(data, fallback);
};

/** Sit with its listing title and dates. */
const loadSit = async (sb: SupabaseClient, sitId: string) => {
  const { data } = await sb
    .from("sits")
    .select("id, owner_user_id, sitter_user_id, status, cancelled_at, listing:listing_id(title), sit_dates:sit_dates_id(start_date, end_date)")
    .eq("id", sitId)
    .maybeSingle();
  return data as null | {
    id: string; owner_user_id: string; sitter_user_id: string; status: string; cancelled_at: string | null;
    listing: { title: string | null } | null;
    sit_dates: { start_date: string; end_date: string } | null;
  };
};

const MEMBER_RULES: Record<string, (ctx: Ctx) => Promise<Verdict>> = {
  // Sitter → owner: the caller's own new application on the recipient's listing.
  new_application: async ({ sb, uid, recipient, data }) => {
    if (!isUuid(data.application_id)) return refuse("missing application_id");
    const { data: app } = await sb
      .from("applications")
      .select("sitter_user_id, status, created_at, listing:listing_id(owner_user_id, title), sit_dates:sit_dates_id(start_date, end_date)")
      .eq("id", data.application_id)
      .maybeSingle();
    const a = app as null | {
      sitter_user_id: string; status: string; created_at: string;
      listing: { owner_user_id: string; title: string | null } | null;
      sit_dates: { start_date: string; end_date: string } | null;
    };
    if (!a || a.sitter_user_id !== uid) return refuse("application not the caller's");
    if (a.listing?.owner_user_id !== recipient) return refuse("recipient doesn't own the listing");
    if (a.status !== "applied") return refuse(`application status is ${a.status}`);
    if (minutesAgo(a.created_at) > 15) return refuse("application older than 15 minutes");
    return {
      ok: true,
      data: {
        listingTitle: a.listing?.title || "your listing",
        sitterName: await callerName(sb, uid, "A Nomad"),
        startDate: fmtDate(a.sit_dates?.start_date),
        endDate: fmtDate(a.sit_dates?.end_date),
      },
    };
  },

  // Sitter → owner: the caller's application, just withdrawn, on the recipient's listing.
  application_withdrawn: async ({ sb, uid, recipient, data }) => {
    if (!isUuid(data.application_id)) return refuse("missing application_id");
    const { data: app } = await sb
      .from("applications")
      .select("sitter_user_id, status, updated_at, listing:listing_id(owner_user_id, title)")
      .eq("id", data.application_id)
      .maybeSingle();
    const a = app as null | {
      sitter_user_id: string; status: string; updated_at: string;
      listing: { owner_user_id: string; title: string | null } | null;
    };
    if (!a || a.sitter_user_id !== uid) return refuse("application not the caller's");
    if (a.listing?.owner_user_id !== recipient) return refuse("recipient doesn't own the listing");
    if (a.status !== "withdrawn") return refuse(`application status is ${a.status}`);
    if (minutesAgo(a.updated_at) > 15) return refuse("withdrawal older than 15 minutes");
    return {
      ok: true,
      data: {
        listingTitle: a.listing?.title || "your listing",
        sitterName: await callerName(sb, uid, "A Nomad"),
      },
    };
  },

  // Either participant → the other: a sit cancelled in the last 15 minutes.
  sit_cancelled: async ({ sb, uid, recipient, data }) => {
    if (!isUuid(data.sit_id)) return refuse("missing sit_id");
    const sit = await loadSit(sb, data.sit_id);
    if (!sit) return refuse("sit not found");
    const other = sit.owner_user_id === uid ? sit.sitter_user_id : sit.sitter_user_id === uid ? sit.owner_user_id : null;
    if (!other) return refuse("caller isn't a participant");
    if (other !== recipient) return refuse("recipient isn't the other participant");
    if (sit.status !== "cancelled") return refuse(`sit status is ${sit.status}`);
    if (minutesAgo(sit.cancelled_at) > 15) return refuse("cancellation older than 15 minutes");
    return {
      ok: true,
      data: {
        listingTitle: sit.listing?.title || "a sit",
        cancelledByName: await callerName(sb, uid, "The other party"),
        startDate: fmtDate(sit.sit_dates?.start_date),
        endDate: fmtDate(sit.sit_dates?.end_date),
        reason: trimText(data.reason, 500),
      },
    };
  },

  // Participant → participant: the caller messaged in this conversation just now.
  new_message: async ({ sb, uid, recipient, data }) => {
    const conversationId = data.conversation_id || data.conversationId;
    if (!isUuid(conversationId)) return refuse("missing conversation_id");
    const { data: convo } = await sb
      .from("conversations")
      .select("owner_user_id, sitter_user_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!convo) return refuse("conversation not found");
    const pair = [convo.owner_user_id, convo.sitter_user_id];
    if (!pair.includes(uid) || !pair.includes(recipient) || uid === recipient) {
      return refuse("caller and recipient aren't this conversation's participants");
    }
    const since = new Date(Date.now() - 5 * 60000).toISOString();
    const { count } = await sb
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("sender_user_id", uid)
      .gte("created_at", since);
    if (!count) return refuse("no message from caller in the last 5 minutes");
    return {
      ok: true,
      data: {
        senderName: await callerName(sb, uid, "Someone"),
        messagePreview: trimText(data.messagePreview, 150),
        conversationId,
      },
    };
  },

  // Owner → sitter: an invite the caller just sent to the recipient.
  invite: async ({ sb, uid, recipient, data }) => {
    if (!isUuid(data.invite_id)) return refuse("missing invite_id");
    const { data: inv } = await sb
      .from("sitter_invites")
      .select("owner_user_id, sitter_user_id, created_at, listing:listing_id(title), sit_dates:sit_dates_id(start_date, end_date)")
      .eq("id", data.invite_id)
      .maybeSingle();
    const i = inv as null | {
      owner_user_id: string; sitter_user_id: string; created_at: string;
      listing: { title: string | null } | null;
      sit_dates: { start_date: string; end_date: string } | null;
    };
    if (!i || i.owner_user_id !== uid) return refuse("invite not from caller");
    if (i.sitter_user_id !== recipient) return refuse("invite not to recipient");
    if (minutesAgo(i.created_at) > 15) return refuse("invite older than 15 minutes");
    return {
      ok: true,
      data: {
        listingTitle: i.listing?.title || "my home",
        ownerName: await callerName(sb, uid, "A Pet Parent"),
        startDate: fmtDate(i.sit_dates?.start_date),
        endDate: fmtDate(i.sit_dates?.end_date),
      },
    };
  },

  // Owner → sitter with a live application on the caller's just-edited listing.
  listing_dates_changed: async ({ sb, uid, recipient, data }) => {
    if (!isUuid(data.listing_id)) return refuse("missing listing_id");
    const { data: listing } = await sb
      .from("listings")
      .select("owner_user_id, title, updated_at")
      .eq("id", data.listing_id)
      .maybeSingle();
    if (!listing || listing.owner_user_id !== uid) return refuse("listing not the caller's");
    if (minutesAgo(listing.updated_at) > 15) return refuse("listing not edited in the last 15 minutes");
    const { count } = await sb
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", data.listing_id)
      .eq("sitter_user_id", recipient)
      .in("status", ["applied", "shortlisted"]);
    if (!count) return refuse("recipient has no live application on the listing");
    return {
      ok: true,
      data: { listingTitle: listing.title || "a listing", dates: trimText(data.dates, 80) },
    };
  },

  // Sitter → owner: a check-in the caller just posted on their active sit.
  sit_checkin: async ({ sb, uid, recipient, data }) => {
    if (!isUuid(data.sit_id)) return refuse("missing sit_id");
    const sit = await loadSit(sb, data.sit_id);
    if (!sit || sit.sitter_user_id !== uid) return refuse("caller isn't the sit's sitter");
    if (sit.owner_user_id !== recipient) return refuse("recipient isn't the sit's owner");
    if (!["confirmed", "in_progress"].includes(sit.status)) return refuse(`sit status is ${sit.status}`);
    const since = new Date(Date.now() - 15 * 60000).toISOString();
    const { count } = await sb
      .from("sit_checkins")
      .select("id", { count: "exact", head: true })
      .eq("sit_id", data.sit_id)
      .eq("author_user_id", uid)
      .gte("created_at", since);
    if (!count) return refuse("no check-in from caller in the last 15 minutes");
    return {
      ok: true,
      data: {
        listingTitle: sit.listing?.title || "your sit",
        sitterName: await callerName(sb, uid, "Your Nomad"),
        checkinLabel: trimText(data.checkinLabel, 60),
        note: trimText(data.note, 500),
      },
    };
  },

  // Owner → sitter: the caller's pending reschedule proposal on this sit.
  sit_reschedule_proposed: async ({ sb, uid, recipient, data }) => {
    if (!isUuid(data.sit_id)) return refuse("missing sit_id");
    const sit = await loadSit(sb, data.sit_id);
    if (!sit || sit.owner_user_id !== uid) return refuse("caller isn't the sit's owner");
    if (sit.sitter_user_id !== recipient) return refuse("recipient isn't the sit's sitter");
    const { data: req } = await sb
      .from("sit_reschedule_requests")
      .select("proposed_start_date, proposed_end_date, note, created_at")
      .eq("sit_id", data.sit_id)
      .eq("requested_by", uid)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!req) return refuse("no pending proposal from caller");
    if (minutesAgo(req.created_at) > 15) return refuse("proposal older than 15 minutes");
    return {
      ok: true,
      data: {
        listingTitle: sit.listing?.title || "your sit",
        ownerName: await callerName(sb, uid, "Your Pet Parent"),
        proposedStartDate: fmtDate(req.proposed_start_date),
        proposedEndDate: fmtDate(req.proposed_end_date),
        note: trimText(req.note, 500),
      },
    };
  },

  // Sitter → owner: the caller just answered a proposal on this sit.
  sit_reschedule_accepted: (ctx) => rescheduleResponse(ctx, "accepted"),
  sit_reschedule_declined: (ctx) => rescheduleResponse(ctx, "declined"),

  // Reviewer → reviewee: a review the caller just left for this sit.
  review: async ({ sb, uid, recipient, data }) => {
    if (!isUuid(data.sit_id)) return refuse("missing sit_id");
    const { data: review } = await sb
      .from("reviews")
      .select("rating, text, created_at")
      .eq("sit_id", data.sit_id)
      .eq("reviewer_user_id", uid)
      .eq("reviewee_user_id", recipient)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!review) return refuse("no review by caller about recipient on this sit");
    if (minutesAgo(review.created_at) > 15) return refuse("review older than 15 minutes");
    return {
      ok: true,
      data: {
        reviewerName: await callerName(sb, uid, "Someone"),
        rating: String(review.rating),
        text: trimText(review.text, 500),
      },
    };
  },
};

async function rescheduleResponse({ sb, uid, recipient, data }: Ctx, status: "accepted" | "declined"): Promise<Verdict> {
  if (!isUuid(data.sit_id)) return refuse("missing sit_id");
  const sit = await loadSit(sb, data.sit_id);
  if (!sit || sit.sitter_user_id !== uid) return refuse("caller isn't the sit's sitter");
  if (sit.owner_user_id !== recipient) return refuse("recipient isn't the sit's owner");
  const { data: req } = await sb
    .from("sit_reschedule_requests")
    .select("responded_at")
    .eq("sit_id", data.sit_id)
    .eq("status", status)
    .order("responded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!req) return refuse(`no ${status} proposal on this sit`);
  if (minutesAgo(req.responded_at) > 15) return refuse("response older than 15 minutes");
  return {
    ok: true,
    data: {
      listingTitle: sit.listing?.title || "your sit",
      sitterName: await callerName(sb, uid, "Your Nomad"),
    },
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return reject("method_not_allowed", 405, { method: req.method });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ── Who is calling? ──
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    let isInternalCaller = serviceKey.length > 0 && jwt.length > 0 && safeEqual(jwt, serviceKey);

    const internalSecretHeader = req.headers.get("x-internal-secret");
    if (!isInternalCaller && internalSecretHeader !== null) {
      const expected = Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
      if (!expected || !safeEqual(internalSecretHeader, expected)) {
        return reject("internal_secret_mismatch", 401);
      }
      isInternalCaller = true;
    }

    let callerUserId: string | null = null;
    if (!isInternalCaller) {
      if (!jwt) return reject("auth_missing_token", 401);
      const { data: caller, error: callerErr } = await supabaseClient.auth.getUser(jwt);
      if (callerErr || !caller?.user) {
        // e.g. session_not_found: signed out elsewhere, but the token still
        // works for database writes until it expires.
        return reject("auth_get_user_failed", 401, {
          detail: callerErr?.message ?? "no user",
          code: (callerErr as { code?: string } | null)?.code ?? null,
        }, "Your session has expired. Please sign in again.");
      }
      callerUserId = caller.user.id;
    }

    // ── What are they asking for? ──
    let payload: { type?: unknown; recipientUserId?: unknown; data?: unknown; skipInAppNotification?: unknown };
    try {
      payload = await req.json();
    } catch {
      return reject("bad_json", 400, { caller: callerUserId });
    }
    const type = typeof payload.type === "string" ? payload.type : "";
    const recipientUserId = payload.recipientUserId;
    const skipInAppNotification = payload.skipInAppNotification === true;
    if (!type) return reject("missing_type", 400, { caller: callerUserId });
    if (!isUuid(recipientUserId)) return reject("bad_recipient", 400, { type, caller: callerUserId });

    // Keep only string values, bounded.
    const rawData: Record<string, string> = {};
    if (payload.data && typeof payload.data === "object") {
      for (const [k, v] of Object.entries(payload.data as Record<string, unknown>)) {
        if (typeof v === "string") rawData[k] = v.slice(0, 2000);
        else if (typeof v === "number" || typeof v === "boolean") rawData[k] = String(v);
      }
    }
    const url = safePath(rawData.url);
    if (url) rawData.url = url;
    else delete rawData.url;

    // ── Member callers: per-type relationship check ──
    let data = rawData;
    if (!isInternalCaller) {
      if (type === "id_verification_approved") {
        const { data: callerProfile } = await supabaseClient
          .from("profiles")
          .select("is_admin")
          .eq("id", callerUserId)
          .maybeSingle();
        if (!callerProfile?.is_admin) {
          return reject("admin_only_type", 403, { type, caller: callerUserId });
        }
      } else {
        const rule = MEMBER_RULES[type];
        if (!rule) return reject("type_not_allowed_for_members", 403, { type, caller: callerUserId });
        const verdict = await rule({
          sb: supabaseClient,
          uid: callerUserId!,
          recipient: recipientUserId,
          data: rawData,
        });
        if (!verdict.ok) {
          return reject("relationship_check_failed", 403, {
            type, caller: callerUserId, recipient: recipientUserId, detail: verdict.reason,
          });
        }
        data = { ...(url ? { url } : {}), ...verdict.data };
      }
    }

    console.log(`Processing ${type} notification for user ${recipientUserId}`);

    // Get user email and check notification preferences
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("email, first_name")
      .eq("id", recipientUserId)
      .single();

    if (profileError || !profile?.email) {
      return reject("recipient_email_not_found", 404, {
        type, recipient: recipientUserId, detail: profileError?.message ?? null,
      });
    }

    const { data: prefs } = await supabaseClient
      .from("notification_preferences")
      .select("*")
      .eq("user_id", recipientUserId)
      .maybeSingle();

    // Map notification type to preference key
    const prefMap: Record<string, string> = {
      new_application: "email_new_applications",
      application_status: "email_application_status",
      new_message: "email_messages",
      invite: "email_sit_updates",
      sit_cancelled: "email_sit_updates",
      sit_checkin: "email_sit_updates",
      sit_started: "email_sit_updates",
      review: "email_reviews",
      review_reminder: "email_reviews",
    };

    // Plain text for the in-app row (and so the push); HTML-escaped copy for
    // the email, so text people wrote can't inject markup into it.
    const plainContent = buildNotificationEmail(type, data);
    const escapedData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, escapeHtml(v)]));
    if (data.url) escapedData.url = data.url; // already a safe relative path
    const emailContent = buildNotificationEmail(type, escapedData);

    // Write the in-app notification first: the bell/notification list reads this
    // table, and clients are not allowed to insert rows for other members.
    // Skipped when the row was already created elsewhere (e.g. a DB trigger).
    if (!skipInAppNotification) {
      const { error: notifError } = await supabaseClient.from("notifications").insert({
        user_id: recipientUserId,
        type,
        title: plainContent.pushTitle ?? plainContent.subject,
        message: plainContent.pushBody ?? "",
        data: { ...data, url: plainContent.pushUrl },
      });
      if (notifError) {
        console.error("Could not create in-app notification:", notifError);
      }
    }

    // Push is NOT sent here: every in-app notifications row triggers exactly one
    // push via the AFTER INSERT trigger on public.notifications.

    const prefKey = prefMap[type];
    if (prefs && prefKey && !prefs[prefKey]) {
      log({ skipped_email: "preference_off", type, recipient: recipientUserId });
      return json({ message: "Email notifications disabled" });
    }

    const fullHtml = renderBrandedEmail(emailContent, {
      preview: emailContent.preview,
    });

    const emailResponse = await sendBrandedEmail(profile.email, emailContent.subject, fullHtml);

    console.log("Email sent successfully:", emailResponse);

    return json(emailResponse as Record<string, unknown>);
  } catch (error) {
    console.error("Error in send-notification-email function:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
};

serve(handler);
