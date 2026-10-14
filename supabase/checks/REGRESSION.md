# Regression suite: database checks

Run these in the Supabase SQL editor on the live database, in this order, after
every batch that changes the database. Each one is safe to run on live:

- **Proofs** (`*_proof.sql`) are read-only. PASS: every row has `ok = true`.
- **Member tests** (`*_member_test.sql`) act as real members and always roll
  back. There are two styles:
  - `BEGIN; … ROLLBACK;` files. PASS: the last query returns a `PASS: …` row.
  - One `DO` block. PASS: it stops with
    `ERROR: PASS_ROLLED_BACK: every check behaved as expected`.
  - Either style, FAIL: an error starting `FAIL:` that says what went wrong.
- **Leftover checks** (`*_leftover.sql`) are read-only and run straight after
  their member test. PASS: every count is `0`.

If a member test says it needs members it can't find (for example "needs an
admin"), that's a missing fixture, not a failure: note it and move on.

## Order

| # | File | PASS looks like |
|---|------|-----------------|
| 1 | `privacy_batch4_proof.sql` | every row `ok = true` |
| 2 | `listing_limit_write_grants_proof.sql` | every row `ok = true` |
| 3 | `listing_limit_write_grants_member_test.sql` | last row `PASS: every member check behaved as expected (rolled back)` |
| 4 | `dashboard_reports_chat_proof.sql` | every row `ok = true` |
| 5 | `dashboard_reports_chat_member_test.sql` | last row `PASS: …` |
| 6 | `stories_reviews_portfolio_proof.sql` | every row `ok = true` |
| 7 | `stories_reviews_portfolio_member_test.sql` | last row `PASS: …` |
| 8 | `profiles_privacy_proof.sql` | every row `ok = true` |
| 9 | `profiles_privacy_member_test.sql` | last row `PASS` |
| 10 | `nomad_screens_proof.sql` | every row `ok = true` |
| 11 | `nomad_screens_member_test.sql` | last row `PASS` |
| 12 | `parent_screens_proof.sql` | every row `ok = true` |
| 13 | `parent_screens_member_test.sql` | last row `PASS: …` |
| 14 | `ai_dates_alt_text_proof.sql` | every row `ok = true` |
| 15 | `ai_dates_alt_text_member_test.sql` | last row `PASS: …` |
| 16 | `arrival_photo_delete_proof.sql` | every row `ok = true` |
| 17 | `arrival_photo_delete_member_test.sql` | last row `PASS: …` |
| 18 | `photo_metadata_cleanup_proof.sql` | fingerprints match your last baseline (see the file; F1c needs a new baseline) |
| 19 | `batch_b_finding_proof.sql` | every row `ok = true` |
| 20 | `batch_b_finding_member_test.sql` | last row `PASS` |
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
- `photo_metadata_cleanup_proof.sql`. **Decision, F1c:** the storage policies
  and the ID bucket settings changed on purpose, so take a new fingerprint
  baseline after F1c. ID drafts now change that bucket at any time.

## Front-end tests

`npm test` (Vitest) runs the unit tests for the pure logic behind recent
fixes: overlapping dates, which invitations count as "already invited", the
sign-in-ended decision, ID photo sizing and the edge-function status helper.
The build does not run them; run them before every push.
