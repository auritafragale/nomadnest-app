-- Test-account setup for the launch audit: approve the two throwaway audit
-- accounts so the apply / messaging flows can be exercised end to end.
UPDATE public.manual_id_verifications
SET status = 'approved', reviewed_at = now()
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'audit+%@nomadnest-audit.com'
);

UPDATE public.profiles
SET id_verified = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email LIKE 'audit+%@nomadnest-audit.com'
);