import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { renderBrandedEmail, sendBrandedEmail } from "../_shared/branded-email.ts";

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

const buildBody = (firstName: string, category: string, isHost: boolean) => {
  const who = isHost ? "sitters" : "pet parents";
  const subject = isHost ? "your home" : "your recent sits";
  return `
    <p>Hi ${firstName},</p>
    <p>We hope you're well. As part of our commitment to keeping the NomadNest
    community transparent and safe for everyone, we wanted to reach out privately.</p>
    <p>Two independent ${who} have now shared feedback regarding
    <strong>${label(category)}</strong> after ${subject}. This feedback is completely
    private — it is not shown on your profile and no one else can see it.</p>
    <p>We're sharing it early so you have the chance to address it before it becomes
    something future members see. If a third independent report mentions the same
    thing, a short cautionary note about this topic will be shown to members
    considering a sit with you.</p>
    <p>The good news: this clears itself. If your next completed stay passes without
    the same feedback, everything is automatically reset and your good standing is
    fully restored.</p>
    <p>If you'd like to talk it through, just reply to this email — we're here to help.</p>
    <p>Warmly,<br/>The NomadNest Team</p>
  `;
};

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

      const isHost = strike.subject_type === "listing";
      const html = renderBrandedEmail(
        {
          heading: "An important update regarding your recent stay",
          body: buildBody(profile.first_name || "there", strike.category, isHost),
        },
        {
          preview: "Private feedback from the NomadNest community",
          footerReason:
            "You're receiving this private note because you're a NomadNest member.",
        },
      );

      try {
        await sendBrandedEmail(
          profile.email,
          "An important update regarding your recent stay on NomadNest",
          html,
        );
        await supabase
          .from("community_strikes")
          .update({ strike_two_email_sent_at: new Date().toISOString() })
          .eq("id", strike.id);
        summary.sent++;
      } catch (e) {
        console.error("Failed to send strike-two email", strike.id, e);
        summary.errors++;
      }
    }
  } catch (e) {
    console.error("trust-strike-emails failed", e);
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
