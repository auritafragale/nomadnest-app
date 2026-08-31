# Pre-Launch Cleanup and Remaining Work

My recommendations on the three questions, plus what is still genuinely outstanding.

## 1. Payments are the real blocker

The signing secret for the Stripe webhook is **not present** in the backend secrets. The webhook function refuses every event without it, so:

- a member's renewal, cancellation or failed payment never updates their membership status;
- someone who cancels keeps access forever, someone whose card fails is never downgraded.

Fix: you copy the signing secret from the Stripe webhook endpoint (the one pointing at `.../functions/v1/stripe-webhook`) and I store it as `STRIPE_WEBHOOK_SECRET`. Then I run a live test subscription end to end and refund it, confirming the membership flips to active and back on cancel.

## 2. Demo listings — recommend unpublishing, not deleting

Two of the three published listings are yours (London Sit, Cozy Paris Apartment). They already attracted 5 applications, which means real Nomads can apply to homes that do not exist — the fastest way to lose trust in a trust-based marketplace.

Recommendation: **unpublish both to draft.** They stay in your account for demos and screenshots, disappear from Browse Sits, and the associated test applications get cleared. The one genuine listing (Adelaide) stays live.

If a near-empty Browse Sits worries you, the answer is supply, not fake homes: an "invite a Pet Parent" push, and a friendly empty state that tells Nomads to set up alerts and check back — better than a listing nobody can actually stay in.

## 3. Test accounts — recommend deleting all 12

Twelve accounts are test or audit accounts (my `audit+...` accounts, plus older `example.com` / `mailinator` / "Test User" signups). They currently show up as people in Browse Nomads.

Recommendation: **delete all 12**, along with the conversations, applications and profiles attached to them. The 14 genuine public signups and your own accounts are untouched. I will list exactly which accounts are going before anything is removed, so you can veto any of them.

## 4. Founding members — recommend keeping the real ones

18 accounts hold free lifetime Combined access. That is everyone who signed up while the site was unintentionally public, plus test accounts.

Recommendation: **keep the genuine early signups, strip the test ones.** They joined in good faith and are your first community; taking access away now costs you goodwill worth far more than 14 memberships. Removing it from test accounts happens automatically when those accounts are deleted. Going forward the only way to become a Founding Member is redeeming an invite code, which is now enforced.

## 5. Member Perks — you said add real partners now

The hub is built and empty, so members currently see "Coming soon" for a benefit the membership page sells.

You already have an admin screen at Admin → Perks where you can add partners yourself. For each partner I need: name, category, the one-line benefit, affiliate link, optional discount code, optional logo and expiry. Send me the list and I load them in; or add them yourself and I will check how they render for a member vs a signed-out visitor and confirm click tracking is recording.

Until at least three partners are live, I would soften the membership page wording from a headline benefit to "partner perks rolling out", so nothing over-promises.

## 6. Everything else outstanding

- **Google Maps key restrictions** — the key currently rejects non-production referers. Confirm `nomadnest.global`, `*.lovable.app` and your preview domain are all whitelisted, or maps go blank for some members.
- **ID verification is manual and gates both listing and applying.** Every new member waits for an admin to approve documents before they can do anything. Decide before launch whether that queue is staffable day one, or whether applying should be ungated and only listing require ID.
- **14 empty city chat rooms.** Fine to leave, but they look dead; worth hiding rooms with no activity until someone posts.
- **WhatsApp OTP stays off.** SMS covers everyone; flip the flags when Twilio approves your sender.
- **Publish.** All the frontend fixes from the audit are in the preview but not live yet.

## Order of work

1. Stripe webhook secret + live subscription test (blocker).
2. Unpublish demo listings, delete test accounts.
3. Load perks partners, adjust membership wording if fewer than three.
4. Confirm Maps referers, decide the ID verification gate.
5. Publish, then re-run the sign-up and payment flow once on the live domain.

## Technical notes

- Account deletion goes through the existing delete path so linked profiles, conversations, applications and storage objects are removed, not orphaned.
- Listing unpublish is a status change to draft, fully reversible.
- Founding member changes touch only accounts being deleted; no genuine member's record is modified.
- Data changes come to you as a migration to approve, with the exact affected accounts listed.
