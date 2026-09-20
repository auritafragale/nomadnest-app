import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { renderBrandedEmail, sendBrandedEmail } from "../_shared/branded-email.ts";
import { buildNotificationEmail } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_NAME = "reliability-strike-emails";
const LEASE_SECONDS = 300;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

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
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary = { sent: 0, errors: 0 };

  try {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, email, first_name")
      .eq("flagged_for_admin_review", true)
      .is("reliability_strike_email_sent_at", null)
      .limit(100);

    if (error) throw error;

    for (const profile of profiles ?? []) {
      if (!profile.email) continue;

      const firstName = profile.first_name || "there";
      const emailContent = buildNotificationEmail("reliability_strike", { firstName });
      const html = renderBrandedEmail(emailContent, {
        preview: emailContent.preview,
        footerReason: emailContent.footerReason,
      });

      try {
        await sendBrandedEmail(profile.email, emailContent.subject, html);
        await supabase
          .from("profiles")
          .update({ reliability_strike_email_sent_at: new Date().toISOString() })
          .eq("id", profile.id);
        summary.sent++;
      } catch (e) {
        console.error("Failed to send reliability-strike email", profile.id, e);
        summary.errors++;
      }
    }
  } catch (e) {
    console.error("reliability-strike-emails failed", e);
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
