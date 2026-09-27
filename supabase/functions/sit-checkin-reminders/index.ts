import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { redact } from "../_shared/safe-log.ts";
import { rejectIfNotInternal } from "../_shared/internal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_NAME = "sit-checkin-reminders";
const LEASE_SECONDS = 600;
// The 6pm local time and the owner's update frequency are applied in SQL
// (update_reminders_due / sit_update_due), shared with the sit page.

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Cron only: public.request_internal_function sends the Vault secret.
  const rejected = rejectIfNotInternal(req, "sit-checkin-reminders");
  if (rejected) return rejected;

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
    console.error("Failed to acquire job lease:", redact(leaseError));
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
    // Which sitters to remind now: public.update_reminders_due() applies the
    // owner's update frequency (sit_update_due: daily, every few days with a
    // closing update, weekly with a closing update, or only when needed), the
    // 6pm local time, "nothing sent today" and one reminder per sit per day.
    const { data: due, error: dueError } = await supabase.rpc("update_reminders_due");
    if (dueError) throw dueError;

    for (const row of (due ?? []) as {
      sit_id: string;
      sitter_user_id: string;
      owner_first_name: string;
      listing_title: string;
      style: string;
    }[]) {
      const daily = row.style === "daily";
      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: row.sitter_user_id,
        type: "sit_checkin_reminder",
        title: daily ? "Time for today's update" : `${row.owner_first_name} would love an update today`,
        message: daily
          ? `Share a photo and a few taps from ${row.listing_title}.`
          : `${row.owner_first_name} would love an update from ${row.listing_title} today.`,
        data: { url: `/sits/${row.sit_id}`, sit_id: row.sit_id },
      });
      if (notifError) {
        console.error("Failed to insert reminder notification", row.sit_id, redact(notifError));
        summary.errors++;
        continue;
      }
      // Push is sent by the AFTER INSERT trigger on public.notifications.
      summary.remindersSent++;
    }

    await supabase.rpc("release_job_lease", { p_job_name: JOB_NAME });

    console.log("sit-checkin-reminders run complete", summary);
    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("sit-checkin-reminders failed:", redact(err));
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
