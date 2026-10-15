import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { providerError } from "../_shared/safe-log.ts";
import { errorBody, getUserFailureReason, statusFor, type Reason } from "../_shared/http-status.ts";
import { submitApplicant } from "../_shared/onfido-rules.ts";

// Onfido identity checks for the signed-in member.
//   create: reuse or create the member's own applicant, return an SDK token.
//   submit: start a check on the member's OWN applicant only. A body naming a
//           different applicant is refused (403).
// Onfido's own error text is logged as a status only and never returned to
// the browser. Logs hold the caller's id, never names, emails or applicant ids.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONFIDO_API_URL = "https://api.onfido.com/v3.6";
const TAG = "[onfido-create-applicant]";

const fail = (reason: Reason, message: string) =>
  new Response(JSON.stringify(errorBody(reason, message)), {
    status: statusFor(reason),
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ok = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PROVIDER_MESSAGE = "We couldn't reach our ID check partner. Please try again in a few minutes.";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail("auth_missing_token", "Please sign in.");
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      const reason = getUserFailureReason(authError);
      return fail(reason, reason === "auth_unavailable" ? "Please try again in a moment." : "Please sign in again.");
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return fail("bad_input", "Invalid request.");
    }
    const mode = body.mode;

    if (mode === "create") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, onfido_applicant_id")
        .eq("id", user.id)
        .single();

      // Reuse the member's applicant if there is one.
      let applicantId = profile?.onfido_applicant_id as string | null | undefined;

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
          console.error(TAG, "applicant error for user", user.id, providerError(applicantRes.status, await applicantRes.text()));
          return fail("provider_failed", PROVIDER_MESSAGE);
        }
        const applicant = await applicantRes.json();
        applicantId = applicant.id;
        await supabase.from("profiles").update({ onfido_applicant_id: applicantId }).eq("id", user.id);
      }

      const tokenRes = await fetch(`${ONFIDO_API_URL}/sdk_token`, {
        method: "POST",
        headers: {
          Authorization: `Token token=${Deno.env.get("ONFIDO_API_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ applicant_id: applicantId, referrer: Deno.env.get("SITE_URL") || "*" }),
      });
      if (!tokenRes.ok) {
        console.error(TAG, "sdk_token error for user", user.id, providerError(tokenRes.status, await tokenRes.text()));
        return fail("provider_failed", PROVIDER_MESSAGE);
      }
      const tokenBody = await tokenRes.json();
      return ok({ sdk_token: tokenBody.token, applicant_id: applicantId });
    }

    if (mode === "submit") {
      const { data: profile } = await supabase.from("profiles").select("onfido_applicant_id").eq("id", user.id).single();

      // Always the caller's own applicant; a different one in the body is refused.
      const pick = submitApplicant(body.applicant_id, profile?.onfido_applicant_id as string | null | undefined);
      if (pick.ok === false) {
        if ("reason" in pick && pick.reason === "not_allowed") {
          console.warn(TAG, "refused a check for another applicant, caller", user.id);
          return fail("not_allowed", "You can only start your own ID check.");
        }
        return fail("bad_input", "Start your ID check again.");
      }

      const checkRes = await fetch(`${ONFIDO_API_URL}/checks`, {
        method: "POST",
        headers: {
          Authorization: `Token token=${Deno.env.get("ONFIDO_API_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ applicant_id: pick.applicantId, report_names: ["document", "facial_similarity_photo"] }),
      });
      if (!checkRes.ok) {
        console.error(TAG, "check error for user", user.id, providerError(checkRes.status, await checkRes.text()));
        return fail("provider_failed", PROVIDER_MESSAGE);
      }
      const check = await checkRes.json();
      await supabase.from("profiles").update({ onfido_check_id: check.id }).eq("id", user.id);
      return ok({ check_id: check.id });
    }

    return fail("bad_input", "Unknown request.");
  } catch (error) {
    console.error(TAG, "unexpected error", error instanceof Error ? error.name : "unknown");
    return fail("provider_failed", PROVIDER_MESSAGE);
  }
});
