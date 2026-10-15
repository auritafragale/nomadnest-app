# Regression suite: database checks

Run these in the Supabase SQL editor on the live database, in this order, after
every batch that changes the database. Each one is safe to run on live:

- **Proofs** (`*_proof.sql`) are read-only. PASS: every row has `ok = true`.
- **Member tests** (`*_member_test.sql`) act as real members. Each is one
  `DO` block that always ends with an exception, so it can never leave data
  behind (since F1d there are no `BEGIN; … ROLLBACK;` files left).
  - PASS: it stops with `ERROR: PASS_ROLLED_BACK: every check behaved as expected`.
  - FAIL: an error starting `FAIL:` that says what went wrong.
  - Setup steps act as the server with the `{"role":"service_role"}` claim;
    signed-out steps use the `anon` claim and role.
  - Tests that need a Pet Parent with a home give a non-admin, non-Founding
    member with no listing a temporary "Regression sample listing" in
    "Regressville" (no non-admin member owns a listing on live).
- **Leftover checks** (`*_leftover.sql`) are read-only and run straight after
  their member test. PASS: every count is `0`.

If a member test says it needs members it can't find (for example "needs an
admin"), that's a missing fixture, not a failure: note it and move on.

## Order

| # | File | PASS looks like |
|---|------|-----------------|
| 1 | `privacy_batch4_proof.sql` | every row `ok = true` |
| 2 | `listing_limit_write_grants_proof.sql` | every row `ok = true` |
| 3 | `listing_limit_write_grants_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 4 | `dashboard_reports_chat_proof.sql` | every row `ok = true` |
| 5 | `dashboard_reports_chat_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 6 | `stories_reviews_portfolio_proof.sql` | every row `ok = true` |
| 7 | `stories_reviews_portfolio_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 8 | `profiles_privacy_proof.sql` | every row `ok = true` |
| 9 | `profiles_privacy_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 10 | `nomad_screens_proof.sql` | every row `ok = true` |
| 11 | `nomad_screens_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 12 | `parent_screens_proof.sql` | every row `ok = true` |
| 13 | `parent_screens_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 14 | `ai_dates_alt_text_proof.sql` | every row `ok = true` |
| 15 | `ai_dates_alt_text_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 16 | `arrival_photo_delete_proof.sql` | every row `ok = true` |
| 17 | `arrival_photo_delete_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 18 | `photo_metadata_cleanup_proof.sql` | first query: every row `ok = true` (the rest is for reading) |
| 19 | `batch_b_finding_proof.sql` | every row `ok = true` |
| 20 | `batch_b_finding_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 21 | `batch_c_parent_tools_proof.sql` | every row `ok = true` |
| 22 | `batch_c_parent_tools_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 23 | `batch_c_fixes_proof.sql` | every row `ok = true` |
| 24 | `batch_c_fixes_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 25 | `batch_d1_proof.sql` | every row `ok = true` |
| 26 | `batch_d1_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 27 | `batch_d2_proof.sql` | every row `ok = true` |
| 28 | `batch_d2_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 29 | `batch_d2_leftover.sql` | every count `0` |
| 30 | `batch_e1_proof.sql` | every row `ok = true` |
| 31 | `batch_e1_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 32 | `batch_e1_leftover.sql` | every count `0` |
| 33 | `e1_fixes_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 34 | `batch_f1_proof.sql` | every row `ok = true` |
| 35 | `batch_f1_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 36 | `batch_f1_leftover.sql` | every count `0` |
| 37 | `batch_f1b_proof.sql` | every row `ok = true` |
| 38 | `batch_f1b_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 39 | `batch_f1b_leftover.sql` | every count `0` |
| 40 | `batch_f1c_proof.sql` | every row `ok = true` |
| 41 | `batch_f1c_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 42 | `batch_f1c_leftover.sql` | every count `0` |
| 43 | `batch_f1d_proof.sql` | every row `ok = true` |
| 44 | `batch_f1d_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 45 | `batch_f1d_leftover.sql` | every count `0` (also checks the temporary Regressville listings) |
| 46 | `batch_f1e_proof.sql` | every row `ok = true` (after the F1e repair) |
| 47 | `batch_f1e_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 48 | `batch_f1e_leftover.sql` | every count `0` |
| 49 | `batch_f1f_proof.sql` | every row `ok = true` (the file-types row says whether the bucket or the upload rule limits them) |
| 50 | `batch_f1f_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 51 | `batch_f1f_leftover.sql` | count `0` |
| 52 | `batch_f1g_proof.sql` | every row `ok = true` |
| 53 | `batch_f1g_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 54 | `batch_f1g_leftover.sql` | every count `0` |
| 55 | `batch_p1_proof.sql` | every row `ok = true` |
| 56 | `batch_p1_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 57 | `batch_p1_leftover.sql` | every count `0` |
| 58 | `batch_f1h_proof.sql` | every row `ok = true` |
| 59 | `batch_f1h_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 60 | `batch_f1h_leftover.sql` | every count `0` |
| 61 | `batch_f1i_proof.sql` | every row `ok = true` (and `npm test`: no Stripe customer is looked up by email) |
| 62 | `batch_f1i_member_test.sql` | `ERROR: PASS_ROLLED_BACK …` |
| 63 | `batch_f1i_leftover.sql` | every count `0` |

One-off, not part of the regular run: `batch_f1e_repair_preview.sql` (read-only)
lists the rows the F1e repair would change. Run it once before the repair
migration is applied; after the repair it returns no rows with
`will_repair = true`.

## Checks updated for later decisions

Older checks describe what was intended when they were written. When a later
batch deliberately changed that, the check was updated (never weakened where
the old behaviour still holds):

- `batch_f1_proof.sql`. **Decision, F1b:** new invitations and applications are
  notified by statement triggers (`notify_sitter_on_invite_batch`,
  `notify_new_applications`), one notification per insert, and the row trigger
  `notify_sitter_on_invite` is gone. **Decision, F1c:** `invite_declined` from
  `notify_invite_answered`. The "no member text" rows now check the new functions.
- `batch_f1_member_test.sql` and `batch_f1b_member_test.sql`. The test listing
  titles no longer carry the "test 2099" marker: a listing title rightly
  appears in alerts such as New message, so the marker check was failing on
  correct behaviour. Their leftover checks match the new titles too.
- `nomad_screens_member_test.sql`. **Decision, F1c:** one live invitation per
  date range and Nomad. The 20-a-day limit test now invites for 20 different
  ranges, so it still tests the daily limit, not the new index.
- `batch_d2_proof.sql`. **Decision, E1:** RESTRICTIVE "… across a block"
  policies were added to invitations and applications. They narrow access and
  need no access helper, so the "uses a row-keyed access helper" rows look at
  permissive policies only.
- `photo_metadata_cleanup_proof.sql`. **Decisions, F1c and F1d:** storage
  policies and the ID bucket changed on purpose, and ID drafts change that
  bucket at any time, so a fixed fingerprint baseline kept going stale. It now
  checks today's rules directly: the private buckets stay private with no
  unconditional read policy, and the ID bucket has its 10MB limit and types.
- `privacy_batch4_proof.sql`. **Decision, E1:** reviews are no longer
  readable by everyone. It now checks the writer, reviewee and admin
  policies, and that no reviews SELECT policy is for anyone but members.
- `listing_limit_write_grants_proof.sql` and its member test. **Decision,
  D2:** notification_preferences gained the push and message email columns
  (members may set them), and members can no longer update user_roles
  (onboarding goes through `complete_onboarding()`).
- `dashboard_reports_chat_proof.sql`. **Decision, E1:** a report about a
  member may carry the reporter's own chat (`reports.conversation_id`).
- `profiles_privacy_proof.sql`. **Decisions, D2 and E1:** Nomad visibility
  is decided by `nomad_profile_is_live()`, and the RESTRICTIVE "hidden
  across a block" policy is a second SELECT policy, checked on its own row.
- `batch_c_parent_tools_proof.sql`. **Decision, D1:** `share_my_phone` and
  `get_phone_shares` read phone numbers, but only with the owner's consent
  (`phone_shares`), so they are allowed.
- `batch_c_parent_tools_member_test.sql`. **Decision, F1:** the decline
  notification is the server's own wording and never carries the note. The
  test now picks that notification by status (every row in one transaction
  has the same created_at).
- `batch_d1_proof.sql`. **Decision, E1:** City Chat's RESTRICTIVE block
  policy only narrows access; the "rooms they can access" row looks at
  permissive policies, and the block policy has its own row.
- `batch_d2_proof.sql`. **D2 clean-up:** the snapshot table
  `d2_discoverability_before` was dropped, so the two rows that compared
  against it are gone.
- `batch_f1c_proof.sql`, `batch_f1d_proof.sql` and `photo_metadata_cleanup_proof.sql`.
  **Decision, F1f:** Lovable can't set the ID bucket's file types, so they
  are limited by the upload rule instead (extensions jpg, jpeg, png, webp,
  heic, heif, pdf). The file-types row passes either way and says which.
- `batch_f1g_proof.sql` and `batch_f1g_member_test.sql`. **Decision, P1:**
  nobody reads `perks` directly; visitors and members see active perks through
  `get_perks_preview`, members get the list through `get_member_perks`.
- Tests that needed a listing owner (`listing_limit_write_grants`,
  `dashboard_reports_chat`, `nomad_screens`, `batch_b_finding` member
  tests) now make a temporary listing for a non-admin, non-Founding member.
- Every member test acting as the server now sets the `service_role` claim
  (not an empty one), and every remaining `BEGIN … ROLLBACK` test is now one
  `DO` block. **Decision, F1d:** `request_is_end_user()` is false with no
  token, so a server step with no claim behaves like the server.

## Front-end tests

**Decision, F1e:** an invitation marked "applied" only counts as "already
invited" while its application is live (applied, shortlisted, or accepted
with a confirmed or in-progress sit). The F1c invite tests were updated to
that rule, and `src/test/f1e.test.ts` covers it.

`npm test` (Vitest) runs the unit tests for the pure logic behind recent
fixes: overlapping dates, which invitations count as "already invited", the
sign-in-ended decision, ID photo sizing and the edge-function status helper.
Since F1g they also cover email escaping and subjects, the Onfido "own applicant" rule,
the block-then-report order, store-app detection and quiet sign-in errors.
The build does not run them; run them before every push.
