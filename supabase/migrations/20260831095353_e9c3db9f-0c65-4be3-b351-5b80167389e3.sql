-- The founding-member guard also blocked the trusted redemption function, so a
-- valid invite code could never be redeemed. Trusted server-side routines now
-- announce themselves with a transaction-local flag the guard recognises.
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.request_is_end_user() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges to modify admin status';
  END IF;

  -- Trusted SECURITY DEFINER routines (e.g. founding member code redemption)
  -- set this flag for the duration of their transaction only.
  IF coalesce(current_setting('app.trusted_membership_update', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = NEW.id THEN
    IF NEW.founding_member IS DISTINCT FROM OLD.founding_member THEN RAISE EXCEPTION 'Insufficient privileges to modify founding member status'; END IF;
    IF NEW.membership_status IS DISTINCT FROM OLD.membership_status THEN RAISE EXCEPTION 'Insufficient privileges to modify membership status'; END IF;
    IF NEW.membership_type IS DISTINCT FROM OLD.membership_type THEN RAISE EXCEPTION 'Insufficient privileges to modify membership type'; END IF;
    IF NEW.membership_expiry IS DISTINCT FROM OLD.membership_expiry THEN RAISE EXCEPTION 'Insufficient privileges to modify membership expiry'; END IF;
    IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN RAISE EXCEPTION 'Insufficient privileges to modify email verified status'; END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN RAISE EXCEPTION 'Insufficient privileges to modify phone verified status'; END IF;
    IF NEW.id_verified IS DISTINCT FROM OLD.id_verified THEN RAISE EXCEPTION 'Insufficient privileges to modify id verified status'; END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_founding_member_code(p_code text, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row founding_member_codes%ROWTYPE;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN 'invalid';
  END IF;

  SELECT * INTO v_row
  FROM public.founding_member_codes
  WHERE code = p_code AND active = true
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF v_row.used_count >= v_row.max_uses THEN RETURN 'exhausted'; END IF;

  -- Already a founding member: nothing to do, treat as success.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND founding_member = true) THEN
    RETURN 'ok';
  END IF;

  UPDATE public.founding_member_codes SET used_count = used_count + 1 WHERE id = v_row.id;

  PERFORM set_config('app.trusted_membership_update', 'on', true);
  UPDATE public.profiles
  SET founding_member = true, membership_status = 'active',
      membership_type = 'combined', membership_expiry = (now() + INTERVAL '100 years')
  WHERE id = p_user_id;
  PERFORM set_config('app.trusted_membership_update', 'off', true);

  RETURN 'ok';
END;
$function$;