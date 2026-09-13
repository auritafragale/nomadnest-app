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

      // send-notification-email handles the in-app notification, push, and
      // email together — nothing else needs to be written manually here.
      const { error: notifyError } = await supabase.functions.invoke(
        "send-notification-email",
        {
          body: {
            type: "arrival_vault_prompt",
            recipientUserId: sitterId,
            data: { listingTitle, url },
          },
        },
      );

      if (notifyError) {
        console.error("Failed to send arrival vault prompt", sitId, notifyError);
        summary.errors++;
        continue;
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
