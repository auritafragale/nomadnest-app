# Branded, Viewable Email Templates

## Current state

All emails are inline HTML strings inside 4 edge functions:

| Function | Emails it sends | Branding today |
|---|---|---|
| `send-notification-email` | New application, application status, new message, invites, reviews, ID verified | Wrong accent color (green, not coral) |
| `stripe-webhook` | Membership activated, cancelled, payment failed, renewal reminder | Coral-ish, but inconsistent layout |
| `send-auth-email` | Password reset | Closest to brand (React Email components) |
| `send-contact-email` | Contact form notification + confirmation | Plain, minimal styling |

There is no way for you to see these emails without triggering real events, and every template has its own copy of fonts/colors/logo.

## What we'll build

### 1. One shared branded template module
Create `supabase/functions/_shared/branded-email.ts` — a single layout every email uses:
- NomadNest logo header (logo-email.png)
- Cream background (#FAF7F2), white card, 14px rounded corners
- Coral (#E8735A) headings and CTA buttons, dark (#1A1A1A) text
- Standard footer ("You're receiving this because you have an account on NomadNest" + preferences link)

Editing email content/branding in future = editing this one file plus the template text in each function.

### 2. Refactor all 4 functions onto it
Rewrite each template to use the shared layout. Fixes the green accent, unifies fonts/buttons/footer across every email a member can receive. Content copy stays as-is unless you want changes.

### 3. Email preview page (admin only)
- New edge function `preview-email-templates` (admin-only): renders every email template with sample data and returns the HTML
- New page at `/admin/emails` in the app: lists all templates (application received, message, membership welcome, renewal reminder, payment failed, cancellation, contact confirmation, etc.) and shows each rendered email so you can review copy and branding without sending anything
- Optional "send test to me" button per template so you can receive a real copy in your own inbox

### 4. Deploy
Redeploy the 4 updated functions + the new preview function. No changes to how emails are triggered or to Resend — same sender (noreply@nomadnest.global), same domain.

## Technical notes
- Edge functions only; no database changes
- Preview function checks `is_admin` before rendering
- Existing `email_membership` notification preference behavior unchanged
- Lovable's built-in app-email template system was considered, but your Resend setup already works with your verified domain — migrating would add risk for no visible benefit
