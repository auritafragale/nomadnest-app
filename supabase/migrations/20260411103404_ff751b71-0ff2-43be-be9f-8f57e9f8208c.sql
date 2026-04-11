
-- Add membership columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS membership_expiry timestamp with time zone DEFAULT NULL;

-- Update existing founding members to have active combined membership
UPDATE public.profiles
SET membership_status = 'active',
    membership_type = 'combined',
    membership_expiry = (now() + interval '100 years')
WHERE founding_member = true;
