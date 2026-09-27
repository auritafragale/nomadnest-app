-- ═══════════════════════════════════════════════════════════════════════════
-- One-off cleanup tools: old check-in photos in the PUBLIC listing-images bucket
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This migration deletes NOTHING. It only adds two service-role-only helpers
-- used by the admin-only cleanup-checkin-photos edge function and the
-- /admin/checkin-photo-cleanup page, where an admin first previews the exact
-- list and then confirms.
--
-- What counts as a check-in photo (never a listing photo):
--   files: objects in listing-images whose path has a "checkins" folder
--          ({user_id}/checkins/...), the only place the old check-in uploads
--          (CheckinSheet and the old sit page) ever wrote to.
--   references: sit_checkins.photo_url and the photo inside [[checkin]] chat
--          messages that point at listing-images. These are cleared. A
--          referenced file OUTSIDE a checkins folder is listed but never deleted.
--
-- Files are deleted through the Storage API by the edge function (direct
-- deletes from storage.objects aren't allowed).


-- Preview: what would be deleted and cleared.
CREATE OR REPLACE FUNCTION public.admin_checkin_photo_cleanup_preview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'files', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', o.name,
        'size', (o.metadata->>'size')::bigint,
        'created_at', o.created_at
      ) ORDER BY o.created_at)
      FROM storage.objects o
      WHERE o.bucket_id = 'listing-images'
        AND o.name ~* '^[^/]+/check-?ins?/'
    ), '[]'::jsonb),
    'checkins', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'sit_id', c.sit_id,
        'photo_url', c.photo_url,
        'in_checkins_folder', c.photo_url ~* '/listing-images/[^/]+/check-?ins?/'
      ) ORDER BY c.created_at)
      FROM public.sit_checkins c
      WHERE c.photo_url ~ '/storage/v1/object/public/listing-images/'
    ), '[]'::jsonb),
    'chat_messages', (
      SELECT count(*)
      FROM public.messages m
      WHERE left(m.body, 11) = '[[checkin]]'
        AND m.body ~ '/storage/v1/object/public/listing-images/'
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.admin_checkin_photo_cleanup_preview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_checkin_photo_cleanup_preview() TO service_role;


-- Clear the references (run after the files are deleted).
CREATE OR REPLACE FUNCTION public.admin_clear_public_checkin_photo_refs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_checkins integer;
  v_messages integer := 0;
  m record;
  v_payload jsonb;
BEGIN
  UPDATE public.sit_checkins
  SET photo_url = NULL
  WHERE photo_url ~ '/storage/v1/object/public/listing-images/';
  GET DIAGNOSTICS v_checkins = ROW_COUNT;

  FOR m IN
    SELECT id, body FROM public.messages
    WHERE left(body, 11) = '[[checkin]]'
      AND body ~ '/storage/v1/object/public/listing-images/'
  LOOP
    BEGIN
      v_payload := substr(m.body, 12)::jsonb;
      v_payload := jsonb_set(v_payload, '{photo}', 'null'::jsonb, true);
      UPDATE public.messages SET body = '[[checkin]]' || v_payload::text WHERE id = m.id;
      v_messages := v_messages + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not clear the photo in message %: %', m.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('checkins_cleared', v_checkins, 'messages_cleared', v_messages);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_clear_public_checkin_photo_refs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_public_checkin_photo_refs() TO service_role;
