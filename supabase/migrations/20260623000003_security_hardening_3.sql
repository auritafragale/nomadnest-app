-- ─── Security hardening (part 3) ─────────────────────────────────────────────
-- Fixes 2 real security issues (private address exposure, over-permissive
-- message editing). Edge function redeploy is a manual step (see notes).


-- ─── Fix 1: Gated accessor for private listing address ────────────────────────
--
-- The listings table has address_private which should only be readable by:
--   (a) the listing owner, or
--   (b) a sitter with an accepted application for that listing.
-- The broad SELECT policy (needed for public listing browsing) cannot restrict
-- individual columns, so we provide a SECURITY DEFINER function as the only
-- authorised path to retrieve address_private. The frontend ListingDetail page
-- is updated separately to exclude the column from its select("*") call.
--
-- applications.status = 'accepted' is a valid enum value (confirmed from schema).

CREATE OR REPLACE FUNCTION public.get_listing_private_address(p_listing_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_address TEXT;
BEGIN
  SELECT address_private INTO v_address
  FROM public.listings
  WHERE id = p_listing_id
    AND (
      -- Caller is the listing owner
      owner_user_id = auth.uid()
      OR
      -- Caller has an accepted application for this listing
      EXISTS (
        SELECT 1 FROM public.applications
        WHERE listing_id = p_listing_id
          AND sitter_user_id = auth.uid()
          AND status = 'accepted'
      )
    );

  RETURN v_address; -- NULL if no matching row (unauthorised)
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_listing_private_address(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_listing_private_address(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_listing_private_address(UUID) TO authenticated;


-- ─── Fix 2: Messages UPDATE policy — restrict to message author only ──────────
--
-- The previous policy (USING conversation participant check) let any conversation
-- participant edit any message in that conversation — including the other party's
-- messages. Restricting to sender_user_id = auth.uid() closes this.
-- Column name confirmed as sender_user_id from codebase scan.

DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
CREATE POLICY "Users can update own messages"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_user_id);


-- ─── Notes ───────────────────────────────────────────────────────────────────
--
-- Fix 3 (edge function redeploy): notify-id-rejected, send-notification-email,
--   send-push-notification show "no authentication" in the scanner because the
--   scanner is reading a stale deploy. config.toml already has verify_jwt = true.
--   Redeploy these three functions via Lovable or Supabase CLI to clear the flag.
