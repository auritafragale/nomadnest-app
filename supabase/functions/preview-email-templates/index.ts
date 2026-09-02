import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import {
  renderBrandedEmail,
  sendBrandedEmail,
} from "../_shared/branded-email.ts";
import { getPreviewTemplates } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Require a signed-in admin.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: caller, error: callerErr } = await supabase.auth.getUser(jwt);
    if (callerErr || !caller?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, email")
      .eq("id", caller.user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return json({ error: "Forbidden" }, 403);
    }

    const templates = getPreviewTemplates();

    if (req.method === "GET") {
      return json({
        templates: templates.map((t) => {
          const email = t.build();
          return {
            id: t.id,
            label: t.label,
            group: t.group,
            subject: email.subject,
            html: renderBrandedEmail(email, {
              preview: email.preview,
              footerReason: email.footerReason,
            }),
          };
        }),
      });
    }

    if (req.method === "POST") {
      // Send a test copy of one template to the requesting admin's own email.
      const { id } = await req.json();
      const template = templates.find((t) => t.id === id);
      if (!template) {
        return json({ error: "Unknown template" }, 404);
      }
      const email = template.build();
      await sendBrandedEmail(
        profile.email,
        `[TEST] ${email.subject}`,
        renderBrandedEmail(email, {
          preview: email.preview,
          footerReason: email.footerReason,
        })
      );
      return json({ sent: true, to: profile.email });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error: any) {
    console.error("Error in preview-email-templates:", error);
    return json({ error: error.message }, 500);
  }
});
