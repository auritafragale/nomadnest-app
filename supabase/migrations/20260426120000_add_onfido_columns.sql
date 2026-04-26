-- Add Onfido identity verification columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS id_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS onfido_applicant_id text,
  ADD COLUMN IF NOT EXISTS onfido_check_id text;
