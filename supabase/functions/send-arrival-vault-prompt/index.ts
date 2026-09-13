import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_NAME = "send-arrival-vault-prompt";
const LEASE_SECONDS = 600;

/** Returns yesterday's YYYY-MM-DD date string in UTC. */
function yesterdayDateString(): string {
  return new Date(Date.now() - 24 * 3600_000).toISOString().split("T")[0];
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

  const summary = { promptsSent: 0, skipped: 0, errors: 0 };

  try {
    const yesterday = yesterdayDateString();

    const { data: sits, error: sitsError } = await supabase
      .from("sits")
      .select(
        "id, sitter_user_id, listing:listing_id(title), sit_dates:sit_dates_id(start_date)",
      )
      .in("status", ["confirmed", "in_progress"])
      .is("arrival_prompt_sent_at", null)
      .limit(500);

    if (sitsError) throw sitsError;

    for (const sit of sits ?? []) {
      const sitId = (sit as any).id;
      const sitterId = (sit as any).sitter_user_id;
      const listingTitle = (sit as any).listing?.title ?? "your sit";
      const startDate = (sit as any).sit_dates?.start_date;

      if (startDate !== yesterday) {
        summary.skipped++;
        continue;
      }

      const url = `/sits/${sitId}/arrival-vault`;

      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: sitterId,
        type: "arrival_vault_prompt",
        title: "Start your Arrival Check-In",
        message: `Add a few photos of ${listingTitle} for your private Arrival Check-In — only visible to you unless you need to raise a concern later.`,
        data: { url, sit_id: sitId },
      });

      if (notifError) {
        console.error("Failed to insert arrival vault prompt notification", sitId, notifError);
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
                      title: "Start your Arrival Check-In",
                      body: `Add a few photos of ${listingTitle} — private, just for you.`,
                      url,
                      tag: `arrival-vault-${sitId}`,
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

      // Set once so this sit is never prompted again, regardless of outcome above.
      const { error: updateError } = await supabase
        .from("sits")
        .update({ arrival_prompt_sent_at: new Date().toISOString() })
        .eq("id", sitId);

      if (updateError) {
        console.error("Failed to mark arrival_prompt_sent_at", sitId, updateError);
        summary.errors++;
        continue;
      }

      summary.promptsSent++;
    }

    await supabase.rpc("release_job_lease", { p_job_name: JOB_NAME });

    console.log("send-arrival-vault-prompt run complete", summary);
    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-arrival-vault-prompt failed:", err);
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
