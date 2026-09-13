// All NomadNest email template content in one place.
// Edit this file to change the wording/subject of any email the app sends.

import { APP_URL, BRAND } from "./branded-email.ts";

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
  | "sit_checkin"
  | "id_verification_approved"
  | "sit_reschedule_proposed"
  | "sit_reschedule_accepted"
  | "sit_reschedule_declined"
  | "arrival_vault_prompt";

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
        ctaUrl: `${APP_URL}/applications`,
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
        ctaUrl: `${APP_URL}/dashboard`,
        pushTitle: `Application ${data.status === "accepted" ? "Accepted!" : "Updated"}`,
        pushBody: `Your application for ${data.listingTitle} was ${data.status}`,
        pushUrl: data.status === "accepted" ? "/dashboard?appTab=accepted" : "/dashboard",
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
        ctaUrl: `${APP_URL}/inbox?conversation=${data.conversationId}`,
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
        ctaUrl: `${APP_URL}/dashboard`,
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
        ctaUrl: `${APP_URL}/dashboard`,
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
          <p>Your sit at <strong>${data.listingTitle}</strong> has finished. Please take a minute to review <strong>${data.otherName}</strong>.</p>
          <p>Reviews build trust across the whole NomadNest community, and you have <strong>${data.daysLeft} day${days === 1 ? "" : "s"}</strong> left to leave yours.</p>
        `,
        ctaLabel: "Write your review",
        ctaUrl: `${APP_URL}/dashboard`,
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
        ctaUrl: `${APP_URL}${data.url || "/dashboard"}`,
        pushTitle: "Sit Cancelled",
        pushBody: `${data.listingTitle} was cancelled${data.reason ? `: ${data.reason}` : ""}`,
        pushUrl: data.url || "/dashboard",

      };
    case "sit_checkin":
      return {
        subject: `${data.checkinLabel}. ${data.listingTitle}`,
        preview: `${data.sitterName} posted a ${data.checkinLabel} update`,
        heading: `Daily check-in: ${data.checkinLabel}`,
        body: `
          <p><strong>${data.sitterName}</strong> checked in on your sit at <strong>${data.listingTitle}</strong>:</p>
          <p style="font-size:18px;"><strong>${data.checkinLabel} ✓</strong></p>
          ${data.note ? quote(data.note) : ""}
        `,
        ctaLabel: "View the care log",
        ctaUrl: `${APP_URL}${data.url || "/dashboard"}`,
        pushTitle: `${data.checkinLabel}. ${data.listingTitle}`,
        pushBody: data.note ? data.note : `Your Nomad posted a ${data.checkinLabel} update.`,
        pushUrl: data.url || "/dashboard",
      };
    case "id_verification_approved":
      return {
        subject: "Your ID has been verified ✓",
        preview: "Your profile now shows the ID Verified badge",
        heading: "You're verified! 🎉",
        body: `
          <p>Great news. Your ID has been successfully verified.</p>
          <p>Your profile now displays the <strong>ID Verified</strong> badge, helping you build trust faster with the NomadNest community.</p>
        `,
        ctaLabel: "Go to your dashboard",
        ctaUrl: `${APP_URL}/complete-profile`,
        pushTitle: "ID Verified ✓",
        pushBody: "Your ID has been verified. Your profile now shows the badge.",
        pushUrl: "/complete-profile",
      };
    case "sit_reschedule_proposed":
      return {
        subject: `New dates proposed for ${data.listingTitle}`,
        preview: `${data.ownerName || "Your Pet Parent"} proposed new dates for your sit`,
        heading: "New dates proposed",
        body: `
          <p><strong>${data.ownerName || "Your Pet Parent"}</strong> has proposed new dates for your sit at <strong>${data.listingTitle}</strong>.</p>
          <p>Proposed dates: ${data.proposedStartDate} – ${data.proposedEndDate}</p>
          ${data.note ? quote(data.note) : ""}
          <p>Review the new dates and accept or decline from your dashboard.</p>
        `,
        ctaLabel: "Review the proposed dates",
        ctaUrl: `${APP_URL}/dashboard`,
        pushTitle: "New dates proposed",
        pushBody: `${data.ownerName || "Your Pet Parent"} proposed new dates for ${data.listingTitle}`,
        pushUrl: "/dashboard",
      };
    case "sit_reschedule_accepted":
      return {
        subject: `Your proposed dates were accepted. ${data.listingTitle}`,
        preview: `${data.sitterName || "Your Nomad"} accepted the new dates`,
        heading: "New dates accepted",
        body: `
          <p><strong>${data.sitterName || "Your Nomad"}</strong> has accepted the new dates you proposed for <strong>${data.listingTitle}</strong>.</p>
          <p>The sit is now confirmed for the new dates.</p>
        `,
        ctaLabel: "View your dashboard",
        ctaUrl: `${APP_URL}/dashboard`,
        pushTitle: "New dates accepted",
        pushBody: `${data.sitterName || "Your Nomad"} accepted the new dates for ${data.listingTitle}`,
        pushUrl: "/dashboard",
      };
    case "sit_reschedule_declined":
      return {
        subject: `Your proposed dates were declined. ${data.listingTitle}`,
        preview: `${data.sitterName || "Your Nomad"} declined the new dates`,
        heading: "New dates declined",
        body: `
          <p><strong>${data.sitterName || "Your Nomad"}</strong> has declined the new dates you proposed for <strong>${data.listingTitle}</strong>.</p>
          <p>The sit's original dates remain unchanged.</p>
        `,
        ctaLabel: "View your dashboard",
        ctaUrl: `${APP_URL}/dashboard`,
        pushTitle: "New dates declined",
        pushBody: `${data.sitterName || "Your Nomad"} declined the new dates for ${data.listingTitle}. Dates are unchanged`,
        pushUrl: "/dashboard",
      };
    case "arrival_vault_prompt":
      return {
        subject: `Start your Arrival Check-In. ${data.listingTitle}`,
        preview: "A private, just-for-you record of how the home looked on arrival",
        heading: "Start your Arrival Check-In",
        body: `
          <p>Now that you've settled in at <strong>${data.listingTitle}</strong>, take a moment to snap a few photos of the home for your own Arrival Check-In.</p>
          <p>These photos are private. Only you can see them, unless you later need to attach one to a private community flag when you leave your review.</p>
        `,
        ctaLabel: "Add your photos",
        ctaUrl: `${APP_URL}${data.url || "/dashboard"}`,
        pushTitle: "Start your Arrival Check-In",
        pushBody: "Add a few photos for your private, just-for-you Arrival Check-In.",
        pushUrl: data.url || "/dashboard",
      };
    default:
      return {
        subject: "NomadNest Notification",
        preview: "You have a new notification on NomadNest",
        heading: "New notification",
        body: `<p>You have a new notification on NomadNest.</p>`,
        ctaLabel: "Open NomadNest",
        ctaUrl: `${APP_URL}/dashboard`,
        pushTitle: "NomadNest",
        pushBody: "You have a new notification",
        pushUrl: "/dashboard",
      };
  }
}

// ---------------------------------------------------------------------------
// Welcome email (sent by send-welcome-email when a member confirms their email)
// ---------------------------------------------------------------------------

const welcomeStep = (icon: string, title: string, text: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
    <tr>
      <td width="44" valign="top" style="font-size:26px;line-height:32px;">${icon}</td>
      <td valign="top">
        <p style="margin:0;color:${BRAND.dark};font-weight:bold;font-size:16px;line-height:24px;">${title}</p>
        <p style="margin:2px 0 0;color:${BRAND.body};font-size:15px;line-height:23px;">${text}</p>
      </td>
    </tr>
  </table>`;

export function buildWelcomeEmail(firstName: string): BuiltEmail {
  const name = (firstName ?? "").trim() || "there";
  return {
    subject: "Welcome to NomadNest! 🏡",
    preview: "Free pet sitting, free stays, here's how it works.",
    heading: `Welcome to NomadNest, ${name}! 🎉`,
    body: `
      <img src="https://nomadnest.global/welcome-email-hero.jpg" alt="A dog and cat relaxing at home" style="width:100%;height:auto;display:block;border-radius:10px;margin-bottom:24px;" />
      <p style="margin:0 0 16px;color:${BRAND.dark};font-size:18px;font-weight:bold;">What is NomadNest?</p>
      <p style="margin:0 0 24px;">NomadNest connects Nomads, people who love to travel, with Pet Parents who need someone to care for their home and pets while they're away. No booking fees and no nightly rates: Nomads stay for free in exchange for looking after the home and pets.</p>
      <p style="margin:0 0 16px;color:${BRAND.dark};font-size:18px;font-weight:bold;">How it works</p>
      ${welcomeStep("🔍", "Browse &amp; Connect", "Explore sits worldwide, or browse trusted Nomads nearby.")}
      ${welcomeStep("🤝", "Apply or Invite", "Send an application or invite someone directly, and chat first to make sure it's a good fit.")}
      ${welcomeStep("🏡", "Sit &amp; Enjoy", "Care for the home and pets, log daily check-ins, and leave a review when you're done.")}
      <p style="margin:24px 0 16px;color:${BRAND.dark};font-size:18px;font-weight:bold;">How it all began</p>
      <p style="margin:0 0 24px;">NomadNest was founded by two girls who love to travel, and who are pet parents themselves. Through years of house sitting on other platforms, they kept feeling the same thing: it was a wonderful way to see the world, but a lonely one too, and they knew from their own pets back home how much trust it takes to hand over the keys to someone. That's why NomadNest was built around real connection on both sides: Nomads finding each other through Nomads Near Me and City Chats so no sit ever feels solitary, and Pet Parents finding real peace of mind knowing their home and pets are cared for by someone who's part of a genuine community, not a stranger passing through.</p>
      <p style="margin:24px 0 0;">Happy travels,<br />The NomadNest Team</p>
    `,
    ctaLabel: "Complete your profile",
    ctaUrl: `${APP_URL}/complete-profile`,
    footerReason: "You're receiving this because you just joined NomadNest.",
  };
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
        subject: `Welcome aboard. Your ${details.planName ?? "membership"} is active 🎉`,
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
          <p>You can rejoin any time. Your profile, reviews and messages are still here waiting for you.</p>
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
          <p>Please update your payment method soon to keep your membership active. If payment keeps failing, your access will be paused.</p>
          <p style="font-size:14px;color:#888;">Go to Dashboard → Membership → Manage Subscription to update your card.</p>
        `,
        ctaLabel: "Update your payment method",
        ctaUrl: `${APP_URL}/dashboard`,
        footerReason,
        pushTitle: "Payment failed",
        pushBody: "Your membership payment failed. Please update your card.",
        pushUrl: "/membership",
      };
    case "renewal_reminder":
      return {
        subject: "Your NomadNest membership renews soon",
        preview: "Your membership renews in the next few days",
        heading: `Heads up${name}`,
        body: `
          <p>Your NomadNest membership will renew in the next few days${details.endDate ? `, on <strong>${fmtDate(details.endDate)}</strong>` : ""}.</p>
          <p>No action needed if you'd like to stay, and thank you for being part of the community.</p>
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
    subject: "NomadNest: action required",
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
    "Hi Sofia! Lovely to connect. Luna is very friendly and the flat is 5 minutes from the metro.",
  conversationId: "sample-conversation-id",
  reviewerName: "Sofia Marchetti",
  rating: "5",
  text: "James was a wonderful host. Clear instructions, a spotless flat, and Luna is the sweetest cat.",
  otherName: "James Whitfield",
  daysLeft: "4",
  status: "accepted",
  proposedStartDate: "2 Nov 2026",
  proposedEndDate: "16 Nov 2026",
  url: "/sits/sample-sit-id/arrival-vault",
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
    { id: "sit_reschedule_proposed", label: "New dates proposed (to Nomad)", group: "Notifications", build: () => buildNotificationEmail("sit_reschedule_proposed", sample) },
    { id: "sit_reschedule_accepted", label: "New dates accepted (to Pet Parent)", group: "Notifications", build: () => buildNotificationEmail("sit_reschedule_accepted", sample) },
    { id: "sit_reschedule_declined", label: "New dates declined (to Pet Parent)", group: "Notifications", build: () => buildNotificationEmail("sit_reschedule_declined", sample) },
    { id: "arrival_vault_prompt", label: "Arrival Check-In prompt (to Nomad)", group: "Notifications", build: () => buildNotificationEmail("arrival_vault_prompt", sample) },
    { id: "welcome", label: "Welcome email", group: "Notifications", build: () => buildWelcomeEmail("Alex") },
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
