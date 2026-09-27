import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { renderBrandedEmail, sendBrandedEmail } from "../_shared/branded-email.ts";
import { buildNotificationEmail } from "../_shared/email-templates.ts";
import { redact } from "../_shared/safe-log.ts";
import { rejectIfNotInternal } from "../_shared/internal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_NAME = "trust-strike-emails";
const LEASE_SECONDS = 300;

const FLAG_LABELS: Record<string, string> = {
  home_cleanliness: "Home Cleanliness",
  undisclosed_cameras: "Unmapped Security Cameras",
  pet_aggression: "Pet Behavioural Quirks",
  sitter_cleanliness: "Home Cleanliness",
  pet_neglect: "Pet Care Protocol",
  abandonment: "Timeline Reliability",
};

const label = (category: string) =>
  FLAG_LABELS[category] || category.replace(/_/g, " ");

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Cron only: public.request_internal_function sends the Vault secret.
  const rejected = rejectIfNotInternal(req, "trust-strike-emails");
  if (rejected) return rejected;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: leaseOk, error: leaseError } = await supabase.rpc("acquire_job_lease", {
    p_job_name: JOB_NAME,
    p_lease_seconds: LEASE_SECONDS,
  });

  if (leaseError) {
    console.error("Failed to acquire job lease:", redact(leaseError));
    return new Response(JSON.stringify({ error: "lease_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!leaseOk) {
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary = { sent: 0, errors: 0 };

  try {
    const { data: strikes, error } = await supabase
      .from("community_strikes")
      .select("id, subject_type, subject_user_id, category, flag_count")
      .gte("flag_count", 2)
      .is("strike_two_email_sent_at", null)
      .limit(100);

    if (error) throw error;

    for (const strike of strikes ?? []) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, first_name")
        .eq("id", strike.subject_user_id)
        .maybeSingle();

      if (!profile?.email) continue;

      // Listing flags belong to the Pet Parent; user flags belong to the Nomad
      const isHost = strike.subject_type === "listing";
      const firstName = profile.first_name || "there";
      const emailContent = buildNotificationEmail(
        isHost ? "community_strike_heads_up_host" : "community_strike_heads_up_nomad",
        { firstName, categoryLabel: label(strike.category) },
      );
      const html = renderBrandedEmail(emailContent, {
        preview: emailContent.preview,
        footerReason: emailContent.footerReason,
      });

      try {
        await sendBrandedEmail(profile.email, emailContent.subject, html);
        await supabase
          .from("community_strikes")
          .update({ strike_two_email_sent_at: new Date().toISOString() })
          .eq("id", strike.id);
        summary.sent++;
      } catch (e) {
        console.error("Failed to send strike-two email", strike.id, redact(e));
        summary.errors++;
      }
    }
  } catch (e) {
    console.error("trust-strike-emails failed", redact(e));
    summary.errors++;
  } finally {
    await supabase.rpc("release_job_lease", { p_job_name: JOB_NAME });
  }

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

serve(handler);
