import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationEmailRequest {
  type: "new_application" | "application_status" | "new_message" | "invite" | "review" | "id_verification_approved";
  recipientUserId: string;
  data: Record<string, string>;
}

const sendEmail = async (to: string, subject: string, html: string) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "NomadNest <noreply@nomadnest.global>",
      to: [to],
      subject,
      html,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to send email");
  }
  
  return response.json();
};

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

const getEmailContent = (type: string, data: Record<string, string>) => {
  switch (type) {
    case "new_application":
      return {
        subject: `New application for ${data.listingTitle}`,
        html: `
          <h2>You have a new application!</h2>
          <p><strong>${data.sitterName}</strong> has applied for your sit at <strong>${data.listingTitle}</strong>.</p>
          <p>Dates: ${data.startDate} - ${data.endDate}</p>
          <p><a href="${data.appUrl}/applications">View the application</a></p>
        `,
        pushTitle: "New Application!",
        pushBody: `${data.sitterName} applied for ${data.listingTitle}`,
        pushUrl: "/applications",
      };
    case "application_status":
      return {
        subject: `Your application has been ${data.status}`,
        html: `
          <h2>Application Update</h2>
          <p>Your application for <strong>${data.listingTitle}</strong> has been <strong>${data.status}</strong>.</p>
          ${data.status === "accepted" ? "<p>Congratulations! The owner will be in touch soon.</p>" : ""}
          <p><a href="${data.appUrl}/dashboard">View your dashboard</a></p>
        `,
        pushTitle: `Application ${data.status === "accepted" ? "Accepted!" : "Updated"}`,
        pushBody: `Your application for ${data.listingTitle} was ${data.status}`,
        pushUrl: "/dashboard",
      };
    case "new_message":
      return {
        subject: `New message from ${data.senderName}`,
        html: `
          <h2>You have a new message</h2>
          <p><strong>${data.senderName}</strong> sent you a message:</p>
          <blockquote style="border-left: 3px solid #ccc; padding-left: 12px; color: #555;">
            ${data.messagePreview}
          </blockquote>
          <p><a href="${data.appUrl}/inbox?conversation=${data.conversationId}">Reply now</a></p>
        `,
        pushTitle: `Message from ${data.senderName}`,
        pushBody: data.messagePreview.substring(0, 100),
        pushUrl: `/inbox?conversation=${data.conversationId}`,
      };
    case "invite":
      return {
        subject: `You've been invited to sit at ${data.listingTitle}`,
        html: `
          <h2>You've received an invitation!</h2>
          <p><strong>${data.ownerName}</strong> has invited you to sit at <strong>${data.listingTitle}</strong>.</p>
          <p>Dates: ${data.startDate} - ${data.endDate}</p>
          <p><a href="${data.appUrl}/dashboard">View the invitation</a></p>
        `,
        pushTitle: "New Invitation!",
        pushBody: `${data.ownerName} invited you to ${data.listingTitle}`,
        pushUrl: "/dashboard",
      };
    case "review":
      return {
        subject: "You've received a new review",
        html: `
          <h2>New Review</h2>
          <p><strong>${data.reviewerName}</strong> left you a ${data.rating}-star review.</p>
          ${data.text ? `<blockquote style="border-left: 3px solid #ccc; padding-left: 12px; color: #555;">${data.text}</blockquote>` : ""}
          <p><a href="${data.appUrl}/dashboard">View your profile</a></p>
        `,
        pushTitle: "New Review!",
        pushBody: `${data.reviewerName} left you a ${data.rating}-star review`,
        pushUrl: "/dashboard",
      };
    case "id_verification_approved":
      return {
        subject: "Your ID has been verified ✓",
        html: `
          <h2>You're verified! 🎉</h2>
          <p>Great news — your ID has been successfully verified.</p>
          <p>Your profile now displays the <strong>ID Verified</strong> badge, helping you build trust faster with the NomadNest community.</p>
          <p><a href="${data.appUrl}/dashboard">Go to your dashboard</a></p>
        `,
        pushTitle: "ID Verified ✓",
        pushBody: "Your ID has been verified. Your profile now shows the badge.",
        pushUrl: "/dashboard",
      };
    default:
      return {
        subject: "NomadNest Notification",
        html: `<p>You have a new notification on NomadNest.</p>`,
        pushTitle: "NomadNest",
        pushBody: "You have a new notification",
        pushUrl: "/dashboard",
      };
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

    const { type, recipientUserId, data }: NotificationEmailRequest = await req.json();

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
      review: "email_reviews",
    };

    const emailContent = getEmailContent(type, data);

    // Always send push notification (regardless of email preferences)
    await sendPushNotification(
      supabaseClient,
      recipientUserId,
      emailContent.pushTitle,
      emailContent.pushBody,
      emailContent.pushUrl,
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

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          a { color: #16a34a; }
          h2 { color: #16a34a; }
        </style>
      </head>
      <body>
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="https://nomadnest.global/logo-email.png" alt="NomadNest" style="max-width: 160px;" />
        </div>
        ${emailContent.html}
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #888;">
          You're receiving this because you have an account on NomadNest. 
          <a href="${data.appUrl}/settings">Manage your email preferences</a>
        </p>
      </body>
      </html>
    `;

    const emailResponse = await sendEmail(profile.email, emailContent.subject, fullHtml);

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
