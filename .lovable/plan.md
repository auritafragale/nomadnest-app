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

No new provider sign-ups are needed. The only outstanding item is that the WhatsApp OTP path is built but switched off.

## WhatsApp OTP: current state

The code already supports WhatsApp end to end:

- `src/components/settings/PhoneVerification.tsx` shows an SMS / WhatsApp channel picker only when the frontend flag `VITE_ENABLE_WHATSAPP_VERIFY` is `true`.
- `supabase/functions/verify-phone-start/index.ts` only forwards `whatsapp` to Twilio when the backend flag `ENABLE_WHATSAPP_VERIFY` is `true`; otherwise it silently downgrades to SMS.
- Both flags are currently unset, so every member gets SMS OTP.

## Decision (confirmed)

**Build the WhatsApp fallback now, keep SMS as the default channel for launch.** No launch blocker. The flags get flipped the moment your Twilio/Meta WhatsApp sender is approved.

## Build now — make WhatsApp robust and SMS-safe

These changes are safe whether or not WhatsApp is enabled yet:

1. **verify-phone-start: graceful WhatsApp → SMS fallback.**
   - When `ENABLE_WHATSAPP_VERIFY` is on and the member chooses WhatsApp, attempt the WhatsApp verification first.
   - If Twilio rejects the WhatsApp send (number has no WhatsApp account, sender not approved, rate limited, etc.), automatically retry the same number over SMS instead of surfacing a raw Twilio error.
   - Return the channel that actually delivered in the response (`delivered_channel`), so the client message reflects reality.
   - Keep the existing silent downgrade (WhatsApp → SMS) when the backend flag is off, unchanged.

2. **verify-phone-check: no change needed.**
   - Twilio Verify checks the code regardless of channel, so the check function works for both SMS and WhatsApp without modification.

3. **PhoneVerification UI: reflect the real delivered channel.**
   - The "Code sent to..." toast/message already reads the `channel` field; update it to read `delivered_channel` so it never lies (e.g. "Code sent via SMS" when WhatsApp fell back).
   - Default the picker to SMS, with WhatsApp offered as the alternative once enabled. No behavioural change while flags are off.

4. **No flag flips yet.**
   - Do NOT set `ENABLE_WHATSAPP_VERIFY` or `VITE_ENABLE_WHATSAPP_VERIFY` now. SMS remains the only channel for launch.

## Later — the moment your Twilio/Meta WhatsApp sender is approved

This is your side, then mine:

1. You: in the Twilio console, enable the WhatsApp channel on the existing Verify Service, with an approved WhatsApp sender (Twilio-provided number, or your own number connected to a Meta WhatsApp Business Account + Meta business verification). Twilio Verify supplies the OTP message template, so no template approval work on your part.
2. Confirm in the Verify Service settings that WhatsApp shows as an enabled channel.
3. Tell me it's ready. I then:
   - Add `ENABLE_WHATSAPP_VERIFY = true` as a backend secret.
   - Add `VITE_ENABLE_WHATSAPP_VERIFY = true` so the channel picker appears.
   - Test both channels against a real number and confirm `phone_verified` is written to the profile.

Until step 3 above is done, requesting a WhatsApp OTP would return a Twilio error — which is exactly why the flags exist and stay off until then.

## Optional related item

WhatsApp click-to-chat (a "message us on WhatsApp" support link) needs no API at all — just a `wa.me` deep link. Say the word if you want that on the contact page; it's independent of OTP.

## Why SMS for launch

WhatsApp OTP depends on Meta business verification, which can take days and is not on the critical path for sign-ups. SMS OTP already works today and covers every member. Building the fallback now means flipping WhatsApp on later is a one-line config change with no further code work.
