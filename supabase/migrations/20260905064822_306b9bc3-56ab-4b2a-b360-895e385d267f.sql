CREATE OR REPLACE FUNCTION public.notify_owner_on_sit_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_title text;
  v_label text;
BEGIN
  SELECT s.owner_user_id, COALESCE(l.title, 'your sit')
    INTO v_owner, v_title
  FROM public.sits s
  LEFT JOIN public.listings l ON l.id = s.listing_id
  WHERE s.id = NEW.sit_id;

  v_label := CASE NEW.kind
    WHEN 'pets_fed' THEN 'Pets Fed'
    WHEN 'meds_given' THEN 'Meds Given'
    WHEN 'walk_completed' THEN 'Walk Completed'
    ELSE 'Check-in'
  END;

  IF v_owner IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      v_owner,
      'sit_checkin',
      v_label || ' — ' || v_title,
      COALESCE(NULLIF(NEW.note, ''), 'Your Nomad posted a "' || v_label || '" update.'),
      jsonb_build_object('url', '/sits/' || NEW.sit_id::text, 'sit_id', NEW.sit_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_owner_on_sit_checkin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_owner_on_sit_checkin ON public.sit_checkins;
CREATE TRIGGER trg_notify_owner_on_sit_checkin
AFTER INSERT ON public.sit_checkins
FOR EACH ROW
EXECUTE FUNCTION public.notify_owner_on_sit_checkin();