# Final Launch Checklist — Remaining Items

## 1. Live paid signup test (founder-led)
- Use the prepared test account `aurita.fragale91+paytest@gmail.com` (Nomad role, non-founder)
- Run one real £59 Nomad Membership purchase through Stripe Checkout on the preview
- Confirm: payment succeeds → Stripe webhook fires → membership activates in the app (check Membership page shows "active")
- Then cancel/refund the test subscription in the Stripe Dashboard

## 2. Google Maps key restrictions (founder action)
- In Google Cloud Console, restrict the API key by HTTP referrer:
  - `https://nomadnest.global/*`
  - `https://*.lovable.app/*`
- This protects the public key endpoint since anonymous visitors need the browse map

## 3. Publish
- Run a final security scan check
- Publish so all recent fixes go live to nomadnest.global (webhook fix, privacy lockdown, empty states, testimonial carousel, mobile nav, splash/onboarding deep-link fix)

## Deliberately deferred
- **Member Perks** — add partners at /admin/perks when you have them (site copy already says "rolling out")
- **Onfido webhook token** — only needed when automated ID checks go live; manual review works now
- **WhatsApp OTP** — built, stays off until Twilio/Meta approval

## No code changes needed
Items 1 and 2 are manual tests/settings. Item 3 is publish only.
