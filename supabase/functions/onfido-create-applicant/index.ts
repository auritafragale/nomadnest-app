import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONFIDO_API_URL = "https://api.onfido.com/v3.6";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    const { mode } = await req.json();

    if (mode === "create") {
      // Get user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, onfido_applicant_id")
        .eq("id", user.id)
        .single();

      // Reuse existing applicant if present
      let applicantId = profile?.onfido_applicant_id;

      if (!applicantId) {
        const applicantRes = await fetch(`${ONFIDO_API_URL}/applicants`, {
          method: "POST",
          headers: {
            Authorization: `Token token=${Deno.env.get("ONFIDO_API_TOKEN")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            first_name: profile?.first_name || "Unknown",
            last_name: profile?.last_name || "Unknown",
            email: profile?.email || user.email,
          }),
        });

        if (!applicantRes.ok) {
          const err = await applicantRes.text();
          throw new Error(`Onfido applicant creation failed: ${err}`);
        }

        const applicant = await applicantRes.json();
        applicantId = applicant.id;

        await supabase
          .from("profiles")
          .update({ onfido_applicant_id: applicantId })
          .eq("id", user.id);
      }

      // Generate SDK token
      const tokenRes = await fetch(`${ONFIDO_API_URL}/sdk_token`, {
        method: "POST",
        headers: {
          Authorization: `Token token=${Deno.env.get("ONFIDO_API_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicant_id: applicantId,
          referrer: Deno.env.get("SITE_URL") || "*",
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        throw new Error(`SDK token creation failed: ${err}`);
      }

      const { token } = await tokenRes.json();

      return new Response(
        JSON.stringify({ sdk_token: token, applicant_id: applicantId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "submit") {
      const { applicant_id } = await req.json().catch(() => ({}));

      const { data: profile } = await supabase
        .from("profiles")
        .select("onfido_applicant_id")
        .eq("id", user.id)
        .single();

      const aid = applicant_id || profile?.onfido_applicant_id;
      if (!aid) throw new Error("No applicant ID found");

      const checkRes = await fetch(`${ONFIDO_API_URL}/checks`, {
        method: "POST",
        headers: {
          Authorization: `Token token=${Deno.env.get("ONFIDO_API_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicant_id: aid,
          report_names: ["document", "facial_similarity_photo"],
        }),
      });

      if (!checkRes.ok) {
        const err = await checkRes.text();
        throw new Error(`Check creation failed: ${err}`);
      }

      const check = await checkRes.json();

      await supabase
        .from("profiles")
        .update({ onfido_check_id: check.id })
        .eq("id", user.id);

      return new Response(
        JSON.stringify({ check_id: check.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown mode: ${mode}`);
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
