-- ═══════════════════════════════════════════════════════════════════════════
-- Fix manual ID verification uploads (Bug 2)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Users could INSERT a manual ID verification but never revise it. Two things
-- were missing, and BOTH are required — an RLS policy alone is not enough:
--
--   * RLS:   no UPDATE policy on public.manual_id_verifications for the owner.
--   * GRANT: 20260907032014 granted only SELECT, INSERT on the table to
--            `authenticated`. Without a table-level UPDATE privilege an update
--            fails with "permission denied for table manual_id_verifications"
--            before RLS is ever consulted.
--
-- With both in place, VerifyIdentity.tsx can reuse an existing pending row
-- instead of stacking duplicate submissions in the admin review queue when a
-- member retries after a partial upload.
--
-- No edge functions are redeployed by this migration.
-- See the note at the bottom re: Bug 1 (onboarding avatar upload).


-- ─── RLS: owner may update their own submission while it is pending ──────────
--
-- Scoped to status = 'pending' in both USING and WITH CHECK, so a submission
-- becomes immutable to the member the moment an admin moves it to
-- approved/rejected, and a member cannot flip their own row back to 'pending'
-- to regain write access. Admin review updates continue to run through the
-- pre-existing "Admins can update verifications" policy.

DROP POLICY IF EXISTS "Users can update own pending verifications" ON public.manual_id_verifications;
CREATE POLICY "Users can update own pending verifications"
  ON public.manual_id_verifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');


-- ─── GRANT: column-scoped UPDATE on the two photo paths only ─────────────────
--
-- Deliberately NOT granting UPDATE on status, reviewed_by, reviewed_at or
-- notes: those are the admin review columns, and a member must not be able to
-- write them even on their own pending row. Column-scoped grants mirror the
-- pattern 20260907032014 established for public.profiles.

GRANT UPDATE (id_photo_path, selfie_path) ON public.manual_id_verifications TO authenticated;


-- ─── Note: listing-images storage policy (Fix 1b — verification only) ────────
--
-- No change required. AvatarUpload.tsx writes to `{userId}/avatar/{fileName}`
-- in the listing-images bucket. The INSERT policy is:
--     bucket_id = 'listing-images'
--     AND auth.uid()::text = (storage.foldername(name))[1]
-- (20251220072303_…sql, re-scoped by 20260623000002_security_hardening_2.sql).
-- foldername()[1] on that path is `{userId}`, which equals auth.uid(), so the
-- upload passes. The matching UPDATE policy carries the same predicate, which
-- covers the component's `upsert: true` re-upload path. Semantically avatars
-- do not belong in listing-images, but that is a naming concern, not a
-- permissions one — the bucket is intentionally left unchanged.


-- ─── Note: Bug 1 (onboarding avatar upload) — no trigger change included ─────
--
-- "permission denied for table profiles" is SQLSTATE 42501, a missing
-- table-level GRANT. It is not what an RLS denial or a trigger RAISE looks
-- like. The fix already landed today in 20260907032014, which grants
-- column-scoped UPDATE (avatar_url, first_name, …) on public.profiles to
-- `authenticated`.
--
-- prevent_privilege_escalation was NOT the cause: it compares with
-- IS DISTINCT FROM, which is null-safe by definition, and an avatar-only
-- UPDATE leaves every protected column's NEW value identical to OLD (NULL
-- included), so no branch fires. Adding `OLD.<col> IS NOT NULL` guards would
-- not change the avatar path, and would open a self-escalation hole on exactly
-- the rows where those columns are NULL. See the conversation for detail.
