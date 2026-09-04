// All NomadNest email template content in one place.
// Edit this file to change the wording/subject of any email the app sends.

import { APP_URL } from "./branded-email.ts";

export interface BuiltEmail {
  subject: string;
  heading: string;
  /** Inner HTML body. */
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Hidden inbox preview text. */
  preview?: string;
  footerReason?: string;
  // Push / in-app notification fields (notification templates only).
  pushTitle?: string;
  pushBody?: string;
  pushUrl?: string;
}

const quote = (text: string) =>
  `<blockquote style="border-left:3px solid #E8735A;padding-left:12px;color:#555;margin:16px 0;">${text}</blockquote>`;

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

// ---------------------------------------------------------------------------
// Notification emails (sent by send-notification-email)
// ---------------------------------------------------------------------------

export type NotificationType =
  | "new_application"
  | "application_status"
  | "new_message"
  | "invite"
  | "review"
  | "review_reminder"
  | "sit_cancelled"
  | "id_verification_approved";

export function buildNotificationEmail(
  type: string,
  data: Record<string, string>
): BuiltEmail {
  switch (type) {
    case "new_application":
      return {
        subject: `New application for ${data.listingTitle}`,
        preview: `${data.sitterName} applied for your sit`,
        heading: "You have a new application!",
        body: `
          <p><strong>${data.sitterName}</strong> has applied for your sit at <strong>${data.listingTitle}</strong>.</p>
          <p>Dates: ${data.startDate} – ${data.endDate}</p>
        `,
        ctaLabel: "View the application",
        ctaUrl: `${data.appUrl}/applications`,
        pushTitle: "New Application!",
        pushBody: `${data.sitterName} applied for ${data.listingTitle}`,
        pushUrl: "/applications",
      };
    case "application_status":
      return {
        subject: `Your application has been ${data.status}`,
        preview: `Update on your application for ${data.listingTitle}`,
        heading: "Application update",
        body: `
          <p>Your application for <strong>${data.listingTitle}</strong> has been <strong>${data.status}</strong>.</p>
          ${data.status === "accepted" ? "<p>Congratulations! The Pet Parent will be in touch soon.</p>" : ""}
        `,
        ctaLabel: "View your dashboard",
        ctaUrl: `${data.appUrl}/dashboard`,
        pushTitle: `Application ${data.status === "accepted" ? "Accepted!" : "Updated"}`,
        pushBody: `Your application for ${data.listingTitle} was ${data.status}`,
        pushUrl: "/dashboard",
      };
    case "new_message":
      return {
        subject: `New message from ${data.senderName}`,
        preview: data.messagePreview?.substring(0, 90),
        heading: "You have a new message",
        body: `
          <p><strong>${data.senderName}</strong> sent you a message:</p>
          ${quote(data.messagePreview)}
        `,
        ctaLabel: "Reply now",
        ctaUrl: `${data.appUrl}/inbox?conversation=${data.conversationId}`,
        pushTitle: `Message from ${data.senderName}`,
        pushBody: data.messagePreview?.substring(0, 100),
        pushUrl: `/inbox?conversation=${data.conversationId}`,
      };
    case "invite":
      return {
        subject: `You've been invited to sit at ${data.listingTitle}`,
        preview: `${data.ownerName} invited you to a sit`,
        heading: "You've received an invitation!",
        body: `
          <p><strong>${data.ownerName}</strong> has invited you to sit at <strong>${data.listingTitle}</strong>.</p>
          <p>Dates: ${data.startDate} – ${data.endDate}</p>
        `,
        ctaLabel: "View the invitation",
        ctaUrl: `${data.appUrl}/dashboard`,
        pushTitle: "New Invitation!",
        pushBody: `${data.ownerName} invited you to ${data.listingTitle}`,
        pushUrl: "/dashboard",
      };
    case "review":
      return {
        subject: "You've received a new review",
        preview: `${data.reviewerName} left you a ${data.rating}-star review`,
        heading: "New review",
        body: `
          <p><strong>${data.reviewerName}</strong> left you a <strong>${data.rating}-star</strong> review.</p>
          ${data.text ? quote(data.text) : ""}
        `,
        ctaLabel: "View your profile",
        ctaUrl: `${data.appUrl}/dashboard`,
        pushTitle: "New Review!",
        pushBody: `${data.reviewerName} left you a ${data.rating}-star review`,
        pushUrl: "/dashboard",
      };
    case "review_reminder": {
      const days = Number(data.daysLeft);
      return {
        subject:
          days <= 2
            ? `Last chance to review ${data.otherName}`
            : `How was your sit with ${data.otherName}?`,
        preview: `You have ${data.daysLeft} day(s) left to leave your review`,
        heading: "Leave your review",
        body: `
          <p>Your sit at <strong>${data.listingTitle}</strong> has finished — please take a minute to review <strong>${data.otherName}</strong>.</p>
          <p>Reviews build trust across the whole NomadNest community, and you have <strong>${data.daysLeft} day${days === 1 ? "" : "s"}</strong> left to leave yours.</p>
        `,
        ctaLabel: "Write your review",
        ctaUrl: `${data.appUrl}/dashboard`,
        pushTitle: "Leave a review",
        pushBody: `You have ${data.daysLeft} day(s) left to review ${data.otherName}`,
        pushUrl: "/dashboard",
      };
    }
    case "sit_cancelled":
      return {
        subject: `Your sit at ${data.listingTitle} has been cancelled`,
        preview: `${data.cancelledByName || "The other party"} cancelled the sit`,
        heading: "A confirmed sit has been cancelled",
        body: `
          <p>Unfortunately the sit at <strong>${data.listingTitle}</strong> (${data.startDate} – ${data.endDate}) has been cancelled by <strong>${data.cancelledByName || "the other party"}</strong>.</p>
          ${data.reason ? quote(data.reason) : ""}
          <p>The dates are open again, so you can keep looking for your next match.</p>
        `,
        ctaLabel: "See the cancelled sit",
        ctaUrl: `${data.appUrl}${data.url || "/dashboard"}`,
        pushTitle: "Sit cancelled",
        pushBody: `${data.listingTitle} was cancelled${data.reason ? `: ${data.reason}` : ""}`,
        pushUrl: data.url || "/dashboard",

      };
    case "id_verification_approved":
      return {
        subject: "Your ID has been verified ✓",
        preview: "Your profile now shows the ID Verified badge",
        heading: "You're verified! 🎉",
        body: `
          <p>Great news — your ID has been successfully verified.</p>
          <p>Your profile now displays the <strong>ID Verified</strong> badge, helping you build trust faster with the NomadNest community.</p>
        `,
        ctaLabel: "Go to your dashboard",
        ctaUrl: `${data.appUrl}/dashboard`,
        pushTitle: "ID Verified ✓",
        pushBody: "Your ID has been verified. Your profile now shows the badge.",
        pushUrl: "/dashboard",
      };
    default:
      return {
        subject: "NomadNest Notification",
        preview: "You have a new notification on NomadNest",
        heading: "New notification",
        body: `<p>You have a new notification on NomadNest.</p>`,
        ctaLabel: "Open NomadNest",
        ctaUrl: `${data.appUrl}/dashboard`,
        pushTitle: "NomadNest",
        pushBody: "You have a new notification",
        pushUrl: "/dashboard",
      };
  }
}

// ---------------------------------------------------------------------------
// Membership emails (sent by stripe-webhook)
// ---------------------------------------------------------------------------

export type MembershipEmailKind =
  | "activated"
  | "cancelled"
  | "payment_failed"
  | "renewal_reminder";

export interface MembershipEmailDetails {
  planName?: string;
  endDate?: string | null;
  amount?: string | null;
  /** Recipient first name (optional). */
  name?: string | null;
}

export function buildMembershipEmail(
  kind: MembershipEmailKind,
  details: MembershipEmailDetails
): BuiltEmail {
  const name = details.name ? `, ${details.name}` : "";
  const footerReason =
    "You're receiving this because you have a NomadNest membership.";

  switch (kind) {
    case "activated":
      return {
        subject: `Welcome aboard — your ${details.planName ?? "membership"} is active 🎉`,
        preview: "Your NomadNest membership is now active",
        heading: `You're in${name}!`,
        body: `
          <p>Your <strong>${details.planName ?? "NomadNest membership"}</strong> is now active.</p>
          ${details.endDate ? `<p>It renews on <strong>${fmtDate(details.endDate)}</strong>.</p>` : ""}
          <p>Time to make the most of it:</p>
          <p>
            <a href="${APP_URL}/browse-sits">Browse sits</a> &nbsp;·&nbsp;
            <a href="${APP_URL}/browse-sitters">Find Nomads</a> &nbsp;·&nbsp;
            <a href="${APP_URL}/perks">Member Perks</a>
          </p>
        `,
        ctaLabel: "Go to your dashboard",
        ctaUrl: `${APP_URL}/dashboard`,
        footerReason,
        pushTitle: "Membership active",
        pushBody: `Your ${details.planName ?? "membership"} is now active.`,
        pushUrl: "/membership",
      };
    case "cancelled":
      return {
        subject: "Your NomadNest membership has been cancelled",
        preview: "Your membership has been cancelled",
        heading: `Sorry to see you go${name}`,
        body: `
          <p>Your NomadNest membership has been cancelled and your access has ended.</p>
          <p>You can rejoin any time — your profile, reviews and messages are still here waiting for you.</p>
        `,
        ctaLabel: "Rejoin NomadNest",
        ctaUrl: `${APP_URL}/membership`,
        footerReason,
        pushTitle: "Membership cancelled",
        pushBody: "Your membership has been cancelled.",
        pushUrl: "/membership",
      };
    case "payment_failed":
      return {
        subject: "Action needed: your membership payment failed",
        preview: "Please update your payment method",
        heading: `Payment issue${name}`,
        body: `
          <p>We couldn't take payment for your NomadNest membership${details.amount ? ` (<strong>${details.amount}</strong>)` : ""}.</p>
          <p>Please update your payment method soon to keep your membership active — if payment keeps failing, your access will be paused.</p>
          <p style="font-size:14px;color:#888;">Go to Dashboard → Membership → Manage Subscription to update your card.</p>
        `,
        ctaLabel: "Update your payment method",
        ctaUrl: `${APP_URL}/dashboard`,
        footerReason,
        pushTitle: "Payment failed",
        pushBody: "Your membership payment failed — please update your card.",
        pushUrl: "/membership",
      };
    case "renewal_reminder":
      return {
        subject: "Your NomadNest membership renews soon",
        preview: "Your membership renews in the next few days",
        heading: `Heads up${name}`,
        body: `
          <p>Your NomadNest membership will renew in the next few days${details.endDate ? `, on <strong>${fmtDate(details.endDate)}</strong>` : ""}.</p>
          <p>No action needed if you'd like to stay — and thank you for being part of the community.</p>
        `,
        ctaLabel: "Manage your membership",
        ctaUrl: `${APP_URL}/dashboard`,
        footerReason,
        pushTitle: "Membership renewal coming up",
        pushBody: "Your membership renews in a few days.",
        pushUrl: "/membership",
      };
  }
}

// ---------------------------------------------------------------------------
// Contact form emails (sent by send-contact-email)
// ---------------------------------------------------------------------------

export interface ContactEmailInput {
  name: string;
  email: string;
  categoryLabel: string;
  subject: string;
  message: string;
}

export function buildContactNotificationEmail(
  input: ContactEmailInput
): BuiltEmail {
  return {
    subject: `[${input.categoryLabel}] ${input.subject}`,
    heading: "New contact form submission",
    body: `
      <div style="background:#FAF7F2;padding:20px;border-radius:10px;margin:0 0 20px;">
        <p style="margin:8px 0;"><strong>From:</strong> ${input.name} (${input.email})</p>
        <p style="margin:8px 0;"><strong>Category:</strong> ${input.categoryLabel}</p>
        <p style="margin:8px 0;"><strong>Subject:</strong> ${input.subject}</p>
      </div>
      <p style="margin:0 0 8px;"><strong>Message:</strong></p>
      <div style="background:#fff;padding:16px;border:1px solid #eee;border-radius:10px;">
        <p style="white-space:pre-wrap;margin:0;">${input.message}</p>
      </div>
    `,
    footerReason:
      "You're receiving this because someone submitted the NomadNest contact form.",
  };
}

export function buildContactConfirmationEmail(
  input: ContactEmailInput
): BuiltEmail {
  return {
    subject: "We received your message!",
    preview: "We'll get back to you within 24–48 hours",
    heading: `Thank you for reaching out, ${input.name}!`,
    body: `
      <p>We've received your message and will get back to you within 24–48 hours.</p>
      <div style="background:#FAF7F2;padding:20px;border-radius:10px;margin:20px 0;">
        <p style="margin:8px 0;"><strong>Category:</strong> ${input.categoryLabel}</p>
        <p style="margin:8px 0;"><strong>Subject:</strong> ${input.subject}</p>
      </div>
      <p style="margin:0 0 8px;"><strong>Your message:</strong></p>
      <div style="background:#fff;padding:16px;border:1px solid #eee;border-radius:10px;">
        <p style="white-space:pre-wrap;margin:0;">${input.message}</p>
      </div>
      <p style="margin-top:24px;">Best regards,<br />The NomadNest Team</p>
    `,
    footerReason:
      "You're receiving this because you contacted NomadNest support.",
  };
}

// ---------------------------------------------------------------------------
// Auth emails (sent by send-auth-email via the auth hook)
// ---------------------------------------------------------------------------

export function buildAuthEmail(
  emailActionType: string,
  verifyUrl: string
): BuiltEmail {
  if (emailActionType === "recovery") {
    return {
      subject: "Reset your NomadNest password",
      preview: "Reset your NomadNest password",
      heading: "Reset your password",
      body: `
        <p>We received a request to reset the password for your NomadNest account. Click the button below to create a new password.</p>
        <p style="font-size:14px;color:#888;">This link expires in 24 hours. If you didn't request a password reset, you can safely ignore this email.</p>
      `,
      ctaLabel: "Reset password",
      ctaUrl: verifyUrl,
      footerReason:
        "You're receiving this because a password reset was requested for your NomadNest account.",
    };
  }
  return {
    subject: "NomadNest — action required",
    preview: "Confirm your action on NomadNest",
    heading: "One more step",
    body: `<p>Click the button below to complete your action.</p>`,
    ctaLabel: "Continue",
    ctaUrl: verifyUrl,
    footerReason:
      "You're receiving this because an action was requested on your NomadNest account.",
  };
}

// ---------------------------------------------------------------------------
// Preview registry — sample data for the admin email preview page
// ---------------------------------------------------------------------------

export interface PreviewTemplate {
  id: string;
  label: string;
  group: "Notifications" | "Membership" | "Contact" | "Auth";
  build: () => BuiltEmail;
}

const sample = {
  appUrl: APP_URL,
  sitterName: "Sofia Marchetti",
  ownerName: "James Whitfield",
  listingTitle: "Sunny Lisbon flat with Luna the cat",
  startDate: "12 Oct 2026",
  endDate: "26 Oct 2026",
  senderName: "James Whitfield",
  messagePreview:
    "Hi Sofia! Lovely to connect — Luna is very friendly and the flat is 5 minutes from the metro.",
  conversationId: "sample-conversation-id",
  reviewerName: "Sofia Marchetti",
  rating: "5",
  text: "James was a wonderful host — clear instructions, a spotless flat, and Luna is the sweetest cat.",
  otherName: "James Whitfield",
  daysLeft: "4",
  status: "accepted",
};

export function getPreviewTemplates(): PreviewTemplate[] {
  const contactInput: ContactEmailInput = {
    name: "Alex Rivera",
    email: "alex@example.com",
    categoryLabel: "General Question",
    subject: "How do I become a Nomad?",
    message:
      "Hi! I found you through the Facebook group and I'm wondering how the founding member code works.",
  };

  return [
    { id: "new_application", label: "New application (to Pet Parent)", group: "Notifications", build: () => buildNotificationEmail("new_application", sample) },
    { id: "application_status", label: "Application accepted (to Nomad)", group: "Notifications", build: () => buildNotificationEmail("application_status", sample) },
    { id: "new_message", label: "New message", group: "Notifications", build: () => buildNotificationEmail("new_message", sample) },
    { id: "invite", label: "Sit invitation (to Nomad)", group: "Notifications", build: () => buildNotificationEmail("invite", sample) },
    { id: "review", label: "New review", group: "Notifications", build: () => buildNotificationEmail("review", sample) },
    { id: "review_reminder", label: "Review reminder", group: "Notifications", build: () => buildNotificationEmail("review_reminder", sample) },
    { id: "sit_cancelled", label: "Sit cancelled", group: "Notifications", build: () => buildNotificationEmail("sit_cancelled", sample) },
    { id: "id_verification_approved", label: "ID verified", group: "Notifications", build: () => buildNotificationEmail("id_verification_approved", sample) },
    { id: "membership_activated", label: "Membership activated", group: "Membership", build: () => buildMembershipEmail("activated", { planName: "Combined Membership", endDate: "2027-09-02T00:00:00Z", name: "Alex" }) },
    { id: "membership_renewal_reminder", label: "Renewal reminder", group: "Membership", build: () => buildMembershipEmail("renewal_reminder", { endDate: "2027-09-02T00:00:00Z", name: "Alex" }) },
    { id: "membership_payment_failed", label: "Payment failed", group: "Membership", build: () => buildMembershipEmail("payment_failed", { amount: "£99.00", name: "Alex" }) },
    { id: "membership_cancelled", label: "Membership cancelled", group: "Membership", build: () => buildMembershipEmail("cancelled", { name: "Alex" }) },
    { id: "contact_notification", label: "Contact form (to support)", group: "Contact", build: () => buildContactNotificationEmail(contactInput) },
    { id: "contact_confirmation", label: "Contact confirmation (to sender)", group: "Contact", build: () => buildContactConfirmationEmail(contactInput) },
    { id: "auth_recovery", label: "Password reset", group: "Auth", build: () => buildAuthEmail("recovery", "https://example.com/verify?token=sample") },
    { id: "auth_generic", label: "Auth action (generic)", group: "Auth", build: () => buildAuthEmail("signup", "https://example.com/verify?token=sample") },
  ];
}
