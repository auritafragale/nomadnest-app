import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_NAME = "sit-checkin-reminders";
const LEASE_SECONDS = 600;
const REMINDER_HOUR = 18; // 6pm local
const FALLBACK_TZ = "UTC";

/**
 * Returns the current hour (0-23) in the given IANA timezone.
 */
function localHour(tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === "hour");
    if (!hourPart) return -1;
    // Intl can return "24" for midnight in some envs.
    const h = parseInt(hourPart.value, 10);
    return h === 24 ? 0 : h;
  } catch {
    return -1;
  }
}

/**
 * Returns the YYYY-MM-DD date string for "today" in the given timezone.
 */
function localDateString(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Single-flight lock; also exits when the job is paused.
  const { data: leaseOk, error: leaseError } = await supabase.rpc(
    "acquire_job_lease",
    { p_job_name: JOB_NAME, p_lease_seconds: LEASE_SECONDS },
  );

  if (leaseError) {
    console.error("Failed to acquire job lease:", leaseError);
    return new Response(JSON.stringify({ error: "lease_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!leaseOk) {
    console.log("Job already running or paused; exiting.");
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary = { remindersSent: 0, skipped: 0, errors: 0 };

  try {
    // Only consider sits that are currently happening.
    const { data: sits, error: sitsError } = await supabase
      .from("sits")
      .select(
        "id, sitter_user_id, owner_user_id, listing:listing_id(id, title, timezone)",
      )
      .in("status", ["confirmed", "in_progress"])
      .limit(500);

    if (sitsError) throw sitsError;

    for (const sit of sits ?? []) {
      const listing = (sit as any).listing;
      const tz = listing?.timezone || FALLBACK_TZ;
      const sitterId = (sit as any).sitter_user_id;
      const sitId = (sit as any).id;
      const listingTitle = listing?.title ?? "your sit";

      // Only send when it is 6pm in the home's timezone.
      if (localHour(tz) !== REMINDER_HOUR) {
        summary.skipped++;
        continue;
      }

      const todayStr = localDateString(tz);

      // Once-per-day guard: skip if we already sent a reminder for this sit today.
      const { data: existingReminder } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", sitterId)
        .eq("type", "sit_checkin_reminder")
        .gte("created_at", `${todayStr}T00:00:00Z`)
        .lte("created_at", `${todayStr}T23:59:59Z`)
        .limit(1);

      if (existingReminder && existingReminder.length > 0) {
        summary.skipped++;
        continue;
      }

      // Skip if the nomad already posted a check-in today.
      // Fetch the last 48h of check-ins and filter in JS by local date.
      const since = new Date(Date.now() - 48 * 3600_000).toISOString();
      const { data: recentCheckins } = await supabase
        .from("sit_checkins")
        .select("created_at")
        .eq("sit_id", sitId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20);

      const alreadyCheckedInToday = (recentCheckins ?? []).some((c: any) => {
        try {
          const checkinDate = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(c.created_at));
          return checkinDate === todayStr;
        } catch {
          return false;
        }
      });

      if (alreadyCheckedInToday) {
        summary.skipped++;
        continue;
      }

      // Build the chat conversation URL for the deep link.
      const { data: convo } = await supabase
        .from("conversations")
        .select("id")
        .eq("owner_user_id", (sit as any).owner_user_id)
        .eq("sitter_user_id", sitterId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const conversationId = convo?.id;
      const url = conversationId
        ? `/inbox?conversation=${conversationId}`
        : `/sits/${sitId}`;

      // Insert the in-app notification.
      const { error: notifError } = await supabase
        .from("notifications")
        .insert({
          user_id: sitterId,
          type: "sit_checkin_reminder",
          title: "Time for today's check-in",
          message: `Time for today's check-in for ${listingTitle} — tap to log Fed, Meds and Walk.`,
          data: { url, sit_id: sitId },
        });

      if (notifError) {
        console.error("Failed to insert reminder notification", sitId, notifError);
        summary.errors++;
        continue;
      }

      // Send push notification if the nomad has push enabled.
      try {
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .eq("user_id", sitterId);

        if (subs && subs.length > 0) {
          const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
          const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
          if (vapidPublic && vapidPrivate) {
            const { default: webpush } = await import(
              "https://esm.sh/web-push@3.6.7"
            );
            webpush.setVapidDetails(
              "mailto:hello@nomadnest.global",
              vapidPublic,
              vapidPrivate,
            );
            await Promise.allSettled(
              subs.map(async (sub: any) => {
                try {
                  await webpush.sendNotification(
                    {
                      endpoint: sub.endpoint,
                      keys: { p256dh: sub.p256dh, auth: sub.auth },
                    },
                    JSON.stringify({
                      title: "Time for today's check-in",
                      body: `Log Fed, Meds and Walk for ${listingTitle}.`,
                      url,
                      tag: `checkin-${sitId}`,
                    }),
                  );
                } catch (err: any) {
                  if (err?.statusCode === 404 || err?.statusCode === 410) {
                    await supabase
                      .from("push_subscriptions")
                      .delete()
                      .eq("endpoint", sub.endpoint);
                  }
                }
              }),
            );
          }
        }
      } catch (pushErr) {
        // Push failure is non-critical; the in-app notification already exists.
        console.warn("Push send failed for", sitterId, pushErr);
      }

      summary.remindersSent++;
    }

    await supabase.rpc("release_job_lease", { p_job_name: JOB_NAME });

    console.log("sit-checkin-reminders run complete", summary);
    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("sit-checkin-reminders failed:", err);
    await supabase
      .from("background_job_state")
      .update({ locked_until: null, last_error: `${err?.message ?? err}` })
      .eq("job_name", JOB_NAME);

    return new Response(JSON.stringify({ error: err?.message ?? "unknown_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
