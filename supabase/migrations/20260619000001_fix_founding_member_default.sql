-- Fix founding_member column default: stop granting it automatically to new signups.
-- Existing rows with founding_member = true are intentionally left untouched.
ALTER TABLE public.profiles
  ALTER COLUMN founding_member SET DEFAULT false;

-- ─── Founding-member invite codes ────────────────────────────────────────────
-- A small table of codes, each with an atomic redemption counter.
-- The cap is enforced by a Postgres function using SELECT ... FOR UPDATE so that
-- concurrent redemptions cannot slip through a naive count-then-insert check.

CREATE TABLE public.founding_member_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  max_uses    INTEGER NOT NULL DEFAULT 900,
  used_count  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Seed the launch code (900 redemptions, matching the Facebook group size).
-- The actual code value is shown at the end of this migration comment block;
-- update it to whatever you want before applying.
INSERT INTO public.founding_member_codes (code, max_uses, used_count, active)
VALUES ('NOMADNEST2024', 900, 0, true);

-- RLS: only service-role / edge functions should touch this table.
ALTER TABLE public.founding_member_codes ENABLE ROW LEVEL SECURITY;

-- No public SELECT policy — the edge function uses the service role key.


-- ─── Atomic redemption function ─────────────────────────────────────────────
-- Returns:
--   'ok'           → code valid, counter incremented, caller should set founding_member = true
--   'invalid'      → code not found or inactive
--   'exhausted'    → cap already reached
-- The SELECT ... FOR UPDATE on the single code row serialises concurrent calls
-- so the cap cannot be exceeded under load.

CREATE OR REPLACE FUNCTION public.redeem_founding_member_code(
  p_code    TEXT,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row founding_member_codes%ROWTYPE;
BEGIN
  -- Lock the specific code row for the duration of this transaction.
  SELECT * INTO v_row
  FROM public.founding_member_codes
  WHERE code = p_code AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'invalid';
  END IF;

  IF v_row.used_count >= v_row.max_uses THEN
    RETURN 'exhausted';
  END IF;

  -- Increment the counter atomically.
  UPDATE public.founding_member_codes
  SET used_count = used_count + 1
  WHERE id = v_row.id;

  -- Grant founding-member status to the user.
  UPDATE public.profiles
  SET founding_member    = true,
      membership_status  = 'active',
      membership_type    = 'combined',
      membership_expiry  = (now() + INTERVAL '100 years')
  WHERE id = p_user_id;

  RETURN 'ok';
END;
$$;

-- Grant execute to authenticated users so the client SDK can call it via RPC.
GRANT EXECUTE ON FUNCTION public.redeem_founding_member_code(TEXT, UUID)
  TO authenticated;
