-- ─── Part 2: Email verification column ──────────────────────────────────────
-- Mirrors auth.users.email_confirmed_at into public.profiles so it is
-- accessible to RLS-protected queries and public profile views.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- Trigger function: keep profiles.email_verified in sync whenever
-- auth.users.email_confirmed_at is stamped (i.e. when the user clicks
-- the confirmation link). SECURITY DEFINER so it can write across schemas.
CREATE OR REPLACE FUNCTION public.sync_email_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when email_confirmed_at transitions from NULL to a timestamp.
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.profiles
    SET email_verified = true
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_email_confirmed ON auth.users;
CREATE TRIGGER on_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_email_verified();

-- Back-fill existing users who have already confirmed their email.
UPDATE public.profiles p
SET email_verified = true
FROM auth.users u
WHERE p.id = u.id
  AND u.email_confirmed_at IS NOT NULL;


-- ─── Part 3 + 4: Phone verification columns ──────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number       TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified_at  TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS phone_line_type    TEXT; -- Twilio Lookup result (e.g. 'mobile', 'voip')


-- ─── Part 5: Admin flag + manual ID review table ─────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.manual_id_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  id_photo_path TEXT NOT NULL,
  selfie_path   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMP WITH TIME ZONE,
  notes         TEXT,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.manual_id_verifications ENABLE ROW LEVEL SECURITY;

-- Users can see their own submissions.
CREATE POLICY "Users can view own verifications"
  ON public.manual_id_verifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can submit (INSERT) their own.
CREATE POLICY "Users can insert own verifications"
  ON public.manual_id_verifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all submissions (used by the review screen).
CREATE POLICY "Admins can view all verifications"
  ON public.manual_id_verifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Admins can update status / reviewed_by / reviewed_at / notes.
CREATE POLICY "Admins can update verifications"
  ON public.manual_id_verifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Index for quick per-user lookups and admin queues.
CREATE INDEX IF NOT EXISTS idx_manual_id_verifications_user_id
  ON public.manual_id_verifications (user_id);
CREATE INDEX IF NOT EXISTS idx_manual_id_verifications_status
  ON public.manual_id_verifications (status);


-- ─── Part 5: Private storage bucket for ID documents ─────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('id-verification-documents', 'id-verification-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Users can upload/read their own files (folder named after their user_id).
CREATE POLICY "Users can upload own ID documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'id-verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own ID documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'id-verification-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins can read all files in this bucket for the review screen.
CREATE POLICY "Admins can read all ID documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'id-verification-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
