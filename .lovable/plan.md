# API status and enabling WhatsApp OTP

## What is already connected

| Service | Purpose | Status |
| --- | --- | --- |
| Stripe | Membership subscriptions + webhook | Live keys + webhook secret in place |
| Twilio Verify | Phone OTP (SMS) | Account SID, Auth Token, Verify Service SID in place |
| Twilio Lookup | VOIP / line-type detection | Uses the same Twilio credentials |
| Onfido | ID verification | API token in place |
| Resend | Auth + transactional + contact emails | API key in place |
| Google Maps / Places | Maps, autocomplete, geocoding | Key + two Map IDs in place |
| Web Push (VAPID) | Push notifications | Key pair in place |

Nothing new needs to be signed up for. The only gap is that the WhatsApp OTP path is built but switched off.

## WhatsApp OTP: current state

The code already supports it end to end:

- The verification screen shows an SMS / WhatsApp channel picker only when the frontend flag `VITE_ENABLE_WHATSAPP_VERIFY` is `true`.
- The `verify-phone-start` function only forwards `whatsapp` to Twilio when the backend flag `ENABLE_WHATSAPP_VERIFY` is `true`, otherwise it silently falls back to SMS.
- Both flags are currently unset, so every member gets SMS.

So switching WhatsApp on is a configuration job, not a build job — but it cannot be flipped until Twilio's side is ready.

## What has to happen on Twilio first (your side)

1. In the Twilio console, enable the **WhatsApp channel** on the same Verify Service already used for SMS.
2. Twilio requires an approved WhatsApp sender: either a Twilio-provided WhatsApp number or your own number connected to a Meta WhatsApp Business Account, plus business verification with Meta. Twilio's Verify service supplies the OTP message template, so no template approval work on your part.
3. Confirm in the Verify Service settings that WhatsApp shows as an enabled channel.

Until step 3 is done, requesting a WhatsApp OTP returns a Twilio error, which is exactly why the flags exist.

## What I will do once Twilio is ready

1. Add `ENABLE_WHATSAPP_VERIFY = true` as a backend secret so the edge function stops downgrading WhatsApp to SMS.
2. Add `VITE_ENABLE_WHATSAPP_VERIFY = true` so the channel picker appears in Settings.
3. Improve the fallback behaviour in `verify-phone-start`: if a WhatsApp send fails (member has no WhatsApp on that number, or the sender is rate-limited), retry automatically over SMS and tell the client which channel actually delivered, instead of surfacing a raw Twilio error.
4. Update the verification UI so the delivery message reflects the channel that was actually used, and default the picker to WhatsApp with SMS as the visible alternative.
5. Test both channels against a real number and confirm `phone_verified` is written to the profile.

## Optional related item

WhatsApp click-to-chat (a "message us on WhatsApp" link for support) needs no API at all — just a `wa.me` link. Say the word if you want that on the contact page.

## Recommendation

Keep SMS as the only channel for launch. WhatsApp OTP depends on Meta business verification, which can take days and is not on the critical path for sign-ups. Do the Twilio + Meta setup in parallel and I will flip the flags the moment it clears.
