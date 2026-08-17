import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_NAME = "review-reminders";
const LEASE_SECONDS = 600;
const MAX_SITS_TO_COMPLETE = 200;
const MAX_REMINDERS_PER_RUN = 150;

// Reminder stages measured in days since the sit ended.
const REMINDER_STAGES = [1, 7, 12];
export const REVIEW_WINDOW_DAYS = 14;

const daysBetween = (fromIso: string, to: Date) => {
  const from = new Date(fromIso + "T00:00:00Z").getTime();
  const diff = to.getTime() - from;
  return Math.floor(diff / 86_400_000);
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Single-flight lock; also exits when the job is paused.
  const { data: leaseOk, error: leaseError } = await supabase.rpc("acquire_job_lease", {
    p_job_name: JOB_NAME,
    p_lease_seconds: LEASE_SECONDS,
  });

  if (leaseError) {
    console.error("Failed to acquire job lease:", leaseError);
    return new Response(JSON.stringify({ error: "lease_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!leaseOk) {
    console.log("Job is already running or paused; exiting.");
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary = { autoCompleted: 0, remindersSent: 0, errors: 0 };

  try {
    const today = new Date();
    const todayIso = today.toISOString().split("T")[0];

    // 1) Auto-complete sits whose end date has passed but were never marked completed.
    const { data: overdue, error: overdueError } = await supabase
      .from("sits")
      .select("id, sit_dates:sit_dates_id(end_date)")
      .in("status", ["confirmed", "in_progress"])
      .limit(MAX_SITS_TO_COMPLETE);

    if (overdueError) throw overdueError;

    const toComplete = (overdue ?? []).filter(
      (s: any) => s.sit_dates?.end_date && s.sit_dates.end_date < todayIso
    );

    for (const sit of toComplete) {
      const { error } = await supabase
        .from("sits")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", sit.id)
        .in("status", ["confirmed", "in_progress"]);
      if (error) {
        console.error("Failed to auto-complete sit", sit.id, error);
        summary.errors++;
      } else {
        summary.autoCompleted++;
      }
    }

    // 2) Reminders for completed sits still inside the review window.
    const { data: completedSits, error: completedError } = await supabase
      .from("sits")
      .select(
        "id, owner_user_id, sitter_user_id, listing:listing_id(title), sit_dates:sit_dates_id(end_date)"
      )
      .eq("status", "completed")
      .limit(500);

    if (completedError) throw completedError;

    for (const sit of completedSits ?? []) {
      if (summary.remindersSent >= MAX_REMINDERS_PER_RUN) break;

      const endDate = (sit as any).sit_dates?.end_date as string | undefined;
      if (!endDate) continue;

      const days = daysBetween(endDate, today);
      if (!REMINDER_STAGES.includes(days)) continue;

      const { data: reviews } = await supabase
        .from("reviews")
        .select("reviewer_user_id")
        .eq("sit_id", sit.id);

      const reviewers = new Set((reviews ?? []).map((r: any) => r.reviewer_user_id));

      const parties = [
        { userId: (sit as any).owner_user_id, revieweeId: (sit as any).sitter_user_id, role: "owner" },
        { userId: (sit as any).sitter_user_id, revieweeId: (sit as any).owner_user_id, role: "sitter" },
      ];

      for (const party of parties) {
        if (reviewers.has(party.userId)) continue;

        // Idempotent progress marking: the unique index blocks duplicate sends.
        const { error: claimError } = await supabase
          .from("review_reminders")
          .insert({ sit_id: sit.id, user_id: party.userId, stage: days });

        if (claimError) {
          // Duplicate = already reminded for this stage.
          if (!`${claimError.message}`.toLowerCase().includes("duplicate")) {
            console.error("Failed to claim reminder", sit.id, party.userId, claimError);
            summary.errors++;
          }
          continue;
        }

        const { data: otherProfile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", party.revieweeId)
          .maybeSingle();

        const otherName =
          [otherProfile?.first_name, otherProfile?.last_name].filter(Boolean).join(" ") ||
          (party.role === "owner" ? "your Nomad" : "your Pet Parent");

        const daysLeft = REVIEW_WINDOW_DAYS - days;

        try {
          const { error: notifyError } = await supabase.functions.invoke(
            "send-notification-email",
            {
              body: {
                type: "review_reminder",
                recipientUserId: party.userId,
                data: {
                  otherName,
                  listingTitle: (sit as any).listing?.title ?? "your recent sit",
                  daysLeft: String(daysLeft),
                  stage: String(days),
                },
              },
            }
          );
          if (notifyError) throw notifyError;
        } catch (err) {
          console.error("Reminder email failed", sit.id, party.userId, err);
          summary.errors++;
          continue;
        }

        await supabase.from("notifications").insert({
          user_id: party.userId,
          type: "review_reminder",
          title: "Leave a review",
          message: `You have ${daysLeft} day${daysLeft === 1 ? "" : "s"} left to review ${otherName}.`,
          data: { url: "/dashboard", sit_id: sit.id },
        });

        summary.remindersSent++;
      }
    }

    await supabase.rpc("release_job_lease", { p_job_name: JOB_NAME });

    console.log("review-reminders run complete", summary);
    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("review-reminders failed:", err);
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
