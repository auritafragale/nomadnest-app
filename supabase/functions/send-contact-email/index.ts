import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  renderBrandedEmail,
  sendBrandedEmail,
} from "../_shared/branded-email.ts";
import {
  buildContactConfirmationEmail,
  buildContactNotificationEmail,
} from "../_shared/email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContactEmailRequest {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
}

const categoryLabels: Record<string, string> = {
  general: "General Question",
  account: "Account Help",
  safety: "Safety Concern",
  bug: "Bug Report",
  feedback: "Feedback & Suggestions",
  partnership: "Partnership Inquiry",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, category, subject, message }: ContactEmailRequest = await req.json();

    console.log("Received contact form submission:", { name, email, category, subject: subject.slice(0, 50) });

    // Validate required fields
    if (!name || !email || !category || !subject || !message) {
      console.error("Missing required fields");
      return new Response(
        JSON.stringify({ error: "All fields are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const input = {
      name,
      email,
      categoryLabel: categoryLabels[category] || category,
      subject,
      message,
    };

    // Send notification email to support
    const notificationEmail = buildContactNotificationEmail(input);
    const supportEmailResponse = await sendBrandedEmail(
      "support@nomadnest.global",
      notificationEmail.subject,
      renderBrandedEmail(notificationEmail, { footerReason: notificationEmail.footerReason })
    );

    console.log("Support notification email sent:", supportEmailResponse);

    // Send confirmation email to user
    const confirmationEmail = buildContactConfirmationEmail(input);
    const userEmailResponse = await sendBrandedEmail(
      email,
      confirmationEmail.subject,
      renderBrandedEmail(confirmationEmail, {
        preview: confirmationEmail.preview,
        footerReason: confirmationEmail.footerReason,
      })
    );

    console.log("User confirmation email sent:", userEmailResponse);

    return new Response(
      JSON.stringify({ success: true, message: "Emails sent successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-contact-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
