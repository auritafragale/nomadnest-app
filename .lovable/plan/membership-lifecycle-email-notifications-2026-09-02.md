# Membership Lifecycle Email Notifications

## Goal
Members get a branded NomadNest email (and in-app notification) for every key membership event — payment success, renewal, cancellation, failed payment — instead of relying only on Stripe's receipts.

## What Stripe already covers vs. what's missing
Stripe's own emails (which you enabled): payment receipts and refund confirmations — Stripe-branded only.
Missing on our side: welcome/membership-activated email, renewal reminder, cancellation confirmation ("your access ends on X"), and failed-payment warning ("update your card or lose access").

## Changes

### 1. `supabase/functions/stripe-webhook/index.ts` — add membership emails
The webhook already receives all the right events, so we hook emails in there directly (it uses the service role, no member JWT available). After each profile update, send a branded email via the existing Resend helper pattern:

| Event | Email |
|---|---|
| `customer.subscription.updated` → newly `active` | "Welcome to NomadNest membership" — plan name, renewal date, links to browse/perks |
| `customer.subscription.deleted` | "Membership cancelled" — access end date, how to rejoin |
| `invoice.payment_failed` | "Payment failed" — ask to update card via customer portal, grace warning |

Also insert an in-app `notifications` row for each event so it appears in the notification bell.

Implementation: reuse a small `sendEmail` (Resend) helper inside the webhook (same as `send-notification-email` uses), with the NomadNest logo + coral branding. Lookup recipient email from the Stripe customer (already retrieved in the handler).

### 2. Renewal reminder (optional but recommended)
Add an `invoice.upcoming` event to the Stripe webhook endpoint and send a "your membership renews in ~3 days" email. Requires adding that event to the webhook endpoint in Stripe.

### 3. Respect notification preferences
Add a `email_membership` key check against `notification_preferences` (fall back to sending if the column doesn't exist — transactional billing emails are generally always sent; will default to always-send for payment-failed).

### 4. Test
Trigger test events against the webhook (or replay the earlier live purchase flow) and confirm the email + in-app notification arrive.

## Notes
- No new secrets needed — `RESEND_API_KEY` is already configured.
- Founding members are unaffected (no Stripe subscription).
- Stripe's own receipts stay on — ours complement them, no conflict.
