import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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

    const categoryLabel = categoryLabels[category] || category;

    // Send notification email to support
    const supportEmailResponse = await resend.emails.send({
      from: "NomadNest Contact <noreply@nomadnest.global>",
      to: ["support@nomadnest.global"],
      subject: `[${categoryLabel}] ${subject}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Contact Form Submission</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>From:</strong> ${name} (${email})</p>
            <p style="margin: 8px 0;"><strong>Category:</strong> ${categoryLabel}</p>
            <p style="margin: 8px 0;"><strong>Subject:</strong> ${subject}</p>
          </div>
          <h3 style="color: #333;">Message:</h3>
          <div style="background: #fff; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <p style="white-space: pre-wrap; margin: 0;">${message}</p>
          </div>
        </div>
      `,
    });

    console.log("Support notification email sent:", supportEmailResponse);

    // Send confirmation email to user
    const userEmailResponse = await resend.emails.send({
      from: "NomadNest <noreply@nomadnest.global>",
      to: [email],
      subject: "We received your message!",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Thank you for reaching out, ${name}!</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            We've received your message and will get back to you within 24-48 hours.
          </p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>Category:</strong> ${categoryLabel}</p>
            <p style="margin: 8px 0;"><strong>Subject:</strong> ${subject}</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            Best regards,<br>
            The NomadNest Team
          </p>
        </div>
      `,
    });

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
