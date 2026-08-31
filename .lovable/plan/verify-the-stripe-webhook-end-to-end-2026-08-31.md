# Verify the Stripe webhook end to end

`STRIPE_WEBHOOK_SECRET` is now saved alongside `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`, so the `stripe-webhook` function has everything it needs. The remaining work is confirming it actually verifies and applies real Stripe events.

## Steps

1. Redeploy `stripe-webhook` so it picks up the newly added secret.
2. Send an unsigned test request to the function URL and confirm it now rejects with a signature error (400) instead of the previous "secret not set" 500 — this proves the secret is loaded.
3. Trigger real live events from Stripe against the endpoint (`we_1TkF2dApcivkCqDv9OMVjmzq`) for the three subscribed events: `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
4. Read the function logs to confirm each event verified successfully and the handler ran without errors.
5. Check the membership record in the database reflects the event (status change on update/cancel, failure flag on payment failure) so the sync path is proven, not just the signature check.
6. Report the outcome; if any handler branch errors, fix it in `supabase/functions/stripe-webhook/index.ts` and re-verify.

## Technical notes

- No frontend changes. Only a redeploy plus verification; a code fix happens only if a handler branch fails during testing.
- Live mode is in use (`sk_live`, `livemode: true`), so test events are sent to the live endpoint. Subscription events triggered against a real customer will change that customer's membership state — I will use a Stripe-generated test trigger rather than touching a genuine member's subscription where possible, and confirm with you before touching any real subscription.
