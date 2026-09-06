import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import webpush from "https://esm.sh/web-push@3.6.7";
import {
  renderBrandedEmail,
  sendBrandedEmail,
} from "../_shared/branded-email.ts";
import { buildNotificationEmail } from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationEmailRequest {
  type: "new_application" | "application_status" | "new_message" | "invite" | "review" | "review_reminder" | "sit_cancelled" | "sit_checkin" | "id_verification_approved";
  recipientUserId: string;
  data: Record<string, string>;
  /** When true, skip writing the in-app notifications row (already created by a DB trigger). */
  skipInAppNotification?: boolean;
}

const sendPushNotification = async (
  supabase: any,
  userId: string,
  title: string,
  body: string,
  url: string,
  type: string
) => {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.log('VAPID keys not configured, skipping push notification');
    return;
  }

  try {
    // Get user's push subscriptions
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching push subscriptions:', error);
      return;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found for user:', userId);
      return;
    }

    console.log(`Sending push to ${subscriptions.length} subscription(s) for user ${userId}`);

    // Configure web-push
    webpush.setVapidDetails(
      'mailto:hello@nomadnest.global',
      vapidPublicKey,
      vapidPrivateKey
    );

    const payload = JSON.stringify({
      title,
      body,
      url,
      tag: type,
    });

    // Send to all subscriptions
    const results = await Promise.allSettled(
      subscriptions.map(async (sub: any) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          console.log('Push sent to:', sub.endpoint.substring(0, 50));
          return { success: true };
        } catch (err: any) {
          console.error('Push failed:', err.message);
          // Remove invalid subscriptions
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id);
            console.log('Removed invalid subscription:', sub.id);
          }
          return { success: false };
        }
      })
    );

    const successCount = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as any).success
    ).length;
    console.log(`Push notifications: ${successCount}/${subscriptions.length} successful`);
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Require either a signed-in caller or a trusted internal (service-role)
    // caller such as the scheduled review-reminders job.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isInternalCaller = serviceKey.length > 0 && jwt === serviceKey;

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

    // Always send push notification (regardless of email preferences)
    await sendPushNotification(
      supabaseClient,
      recipientUserId,
      emailContent.pushTitle ?? emailContent.subject,
      emailContent.pushBody ?? "",
      emailContent.pushUrl ?? "/dashboard",
      type
    );

    // Check if email notifications are enabled
    const prefKey = prefMap[type];
    if (prefs && prefKey && !prefs[prefKey]) {
      console.log(`User has disabled ${type} email notifications`);
      return new Response(
        JSON.stringify({ message: "Email notifications disabled, push sent" }),
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
