import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import {
  renderBrandedEmail,
  sendBrandedEmail,
} from "../_shared/branded-email.ts";
import { buildNotificationEmail } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

interface NotificationEmailRequest {
  type: "new_application" | "application_status" | "new_message" | "invite" | "review" | "review_reminder" | "sit_cancelled" | "sit_checkin" | "sit_started" | "id_verification_approved" | "arrival_vault_prompt";
  recipientUserId: string;
  data: Record<string, string>;
  /** When true, skip writing the in-app notifications row (already created by a DB trigger). */
  skipInAppNotification?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Require either a signed-in caller or a trusted internal caller: either
    // the raw service-role key, or (for a Postgres trigger, which shouldn't
    // hold that key) a shared secret matching this function's own
    // INTERNAL_TRIGGER_SECRET env var — the same secret those triggers
    // already send as the x-internal-secret header. Matches the pattern
    // used by notify-admin-reliability-strike: the vault schema isn't
    // exposed over PostgREST, so it can't be queried from here directly.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    let isInternalCaller = serviceKey.length > 0 && jwt === serviceKey;

    if (!isInternalCaller) {
      const internalSecretHeader = req.headers.get("x-internal-secret");
      const expectedInternalSecret = Deno.env.get("INTERNAL_TRIGGER_SECRET");
      if (internalSecretHeader && expectedInternalSecret && internalSecretHeader === expectedInternalSecret) {
        isInternalCaller = true;
      }
    }

    let callerUserId: string | null = null;
    if (!isInternalCaller) {
      const { data: caller, error: callerErr } = await supabaseClient.auth.getUser(jwt);
      if (callerErr || !caller?.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      callerUserId = caller.user.id;
    }

    const { type, recipientUserId, data, skipInAppNotification }: NotificationEmailRequest = await req.json();

    // Admin-only notification types must come from an admin account.
    if (type === "id_verification_approved" && !isInternalCaller) {
      const { data: callerProfile } = await supabaseClient
        .from("profiles")
        .select("is_admin")
        .eq("id", callerUserId)
        .maybeSingle();
      if (!callerProfile?.is_admin) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }


    console.log(`Processing ${type} notification for user ${recipientUserId}`);


    // Get user email and check notification preferences
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("email, first_name")
      .eq("id", recipientUserId)
      .single();

    if (profileError || !profile?.email) {
      console.error("Could not find user email:", profileError);
      return new Response(
        JSON.stringify({ error: "User email not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check notification preferences
    const { data: prefs } = await supabaseClient
      .from("notification_preferences")
      .select("*")
      .eq("user_id", recipientUserId)
      .maybeSingle();

    // Map notification type to preference key
    const prefMap: Record<string, string> = {
      new_application: "email_new_applications",
      application_status: "email_application_status",
      new_message: "email_messages",
      invite: "email_sit_updates",
      sit_cancelled: "email_sit_updates",
      sit_checkin: "email_sit_updates",
      sit_started: "email_sit_updates",
      review: "email_reviews",
      review_reminder: "email_reviews",
    };

    const emailContent = buildNotificationEmail(type, data);

    // Write the in-app notification first: the bell/notification list reads this
    // table, and clients are not allowed to insert rows for other members.
    // Skipped when a database trigger already created the row (e.g. sit_checkin).
    if (!skipInAppNotification) {
      const { error: notifError } = await supabaseClient.from("notifications").insert({
        user_id: recipientUserId,
        type,
        title: emailContent.pushTitle ?? emailContent.subject,
        message: emailContent.pushBody ?? "",
        data: { ...data, url: emailContent.pushUrl },
      });
      if (notifError) {
        console.error("Could not create in-app notification:", notifError);
      }
    }

    // Push is NOT sent here: every in-app notifications row triggers exactly one
    // push via the AFTER INSERT trigger on public.notifications, which calls
    // send-push-notification with the row's own title, message and url. That
    // covers rows created above and rows created elsewhere (skipInAppNotification).

    // Check if email notifications are enabled
    const prefKey = prefMap[type];
    if (prefs && prefKey && !prefs[prefKey]) {
      console.log(`User has disabled ${type} email notifications`);
      return new Response(
        JSON.stringify({ message: "Email notifications disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullHtml = renderBrandedEmail(emailContent, {
      preview: emailContent.preview,
    });

    const emailResponse = await sendBrandedEmail(profile.email, emailContent.subject, fullHtml);

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-notification-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
