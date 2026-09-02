// Shared branded email layout for every NomadNest email.
// Edit this file to change branding (colors, logo, footer) across ALL emails.

export const APP_URL = "https://nomadnest.global";

export const BRAND = {
  coral: "#E8735A",
  dark: "#1A1A1A",
  cream: "#FAF7F2",
  body: "#4A4A4A",
  muted: "#888888",
  logoUrl: "https://nomadnest.global/logo-email.png",
};

export interface EmailContent {
  heading: string;
  /** Inner HTML for the body (paragraphs, lists, blockquotes). */
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface RenderOptions {
  /** Hidden preview text shown in inbox list views. */
  preview?: string;
  /** First sentence of the footer, e.g. why the user received this. */
  footerReason?: string;
}

export function renderBrandedEmail(
  content: EmailContent,
  opts: RenderOptions = {}
): string {
  const { heading, body, ctaLabel, ctaUrl } = content;
  const footerReason =
    opts.footerReason ??
    "You're receiving this because you have an account on NomadNest.";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    a { color: ${BRAND.coral}; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.cream};">
  ${opts.preview ? `<span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${opts.preview}</span>` : ""}
  <div style="background-color:${BRAND.cream};padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:14px;padding:40px 28px;box-shadow:0 2px 8px rgba(26,26,26,0.06);">
      <div style="text-align:center;margin-bottom:28px;">
        <img src="${BRAND.logoUrl}" alt="NomadNest" style="max-width:160px;" />
      </div>
      <h1 style="color:${BRAND.dark};font-size:24px;line-height:32px;font-weight:bold;margin:0 0 20px;text-align:center;">${heading}</h1>
      <div style="color:${BRAND.body};font-size:16px;line-height:26px;">
        ${body}
      </div>
      ${
        ctaLabel && ctaUrl
          ? `<div style="text-align:center;margin:32px 0 8px;">
        <a href="${ctaUrl}" style="background-color:${BRAND.coral};color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:inline-block;padding:14px 32px;border-radius:10px;">${ctaLabel}</a>
      </div>`
          : ""
      }
    </div>
    <div style="max-width:560px;margin:24px auto 0;text-align:center;">
      <p style="font-size:12px;color:${BRAND.muted};line-height:20px;margin:0;">
        ${footerReason}
        <a href="${APP_URL}/settings">Manage your email preferences</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

/** Shared Resend sender. Throws on failure so callers can log/react. */
export async function sendBrandedEmail(
  to: string,
  subject: string,
  html: string
): Promise<unknown> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured, skipping email to", to);
    return null;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
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
    const error = await response.text();
    throw new Error(`Resend failed [${response.status}]: ${error}`);
  }
  return response.json();
}
