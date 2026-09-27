-- ═══════════════════════════════════════════════════════════════════════════
-- Privacy hardening, batch 2: old chat photos in the public bucket
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This migration deletes NOTHING. It adds two service-role-only helpers used
-- by the admin-only cleanup-checkin-photos edge function (kind "chat") and
-- the /admin/chat-photo-cleanup page, where an admin previews the exact list
-- first and then confirms.
--
-- What counts as an old chat photo (never a listing photo):
--   files:    objects in listing-images whose path has a "chat-photos" folder
--             ({user_id}/chat-photos/...), the only place the old chat upload
--             wrote to. New chat photos are in the private chat-photos bucket.
--   messages: [[image]] messages whose "url" points at listing-images. Their
--             body becomes "[Photo removed]" (plus the caption, if any).
--
-- Private photo buckets and file types:
--   Lovable's Storage API tools can't set allowed MIME types, so the private
--   chat-photos and sit-update-photos buckets have none set (private, 5 MB).
--   Uploads are limited by their INSERT policies instead: the file name must
--   end in .jpg, .jpeg, .png or .webp (lowercase, checked below and in the
--   can_upload_* helpers), and the app re-encodes every photo to JPEG in the
--   browser before upload.


-- ─── Upload policies: extension check in the policy itself ─────────────────

DROP POLICY IF EXISTS "Chat members upload chat photos" ON storage.objects;
CREATE POLICY "Chat members upload chat photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-photos'
  AND name ~ '^[^/]+/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'
  AND public.can_upload_chat_photo(name)
);

DROP POLICY IF EXISTS "Sitters upload daily update photos" ON storage.objects;
CREATE POLICY "Sitters upload daily update photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'sit-update-photos'
  AND name ~ '^[^/]+/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'
  AND public.can_upload_sit_update_photo(name)
);


-- ─── Preview: what would be deleted and cleared ────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_chat_photo_cleanup_preview()
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
        AND o.name ~* '^[^/]+/chat-?photos?/'
    ), '[]'::jsonb),
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'conversation_id', m.conversation_id,
        'created_at', m.created_at
      ) ORDER BY m.created_at)
      FROM public.messages m
      WHERE left(m.body, 9) = '[[image]]'
        AND m.body ~ '/storage/v1/object/public/listing-images/'
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.admin_chat_photo_cleanup_preview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_chat_photo_cleanup_preview() TO service_role;


-- ─── Clear the old photo messages (run after the files are deleted) ────────

CREATE OR REPLACE FUNCTION public.admin_clear_public_chat_photo_messages()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m record;
  v_caption text;
  v_cleared integer := 0;
BEGIN
  FOR m IN
    SELECT id, body FROM public.messages
    WHERE left(body, 9) = '[[image]]'
      AND body ~ '/storage/v1/object/public/listing-images/'
  LOOP
    BEGIN
      v_caption := NULLIF(TRIM((substr(m.body, 10)::jsonb)->>'caption'), '');
    EXCEPTION WHEN OTHERS THEN
      v_caption := NULL;
    END;
    UPDATE public.messages
    SET body = CASE WHEN v_caption IS NULL THEN '[Photo removed]' ELSE '[Photo removed] ' || v_caption END
    WHERE id = m.id;
    v_cleared := v_cleared + 1;
  END LOOP;

  RETURN jsonb_build_object('messages_cleared', v_cleared);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_clear_public_chat_photo_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_public_chat_photo_messages() TO service_role;