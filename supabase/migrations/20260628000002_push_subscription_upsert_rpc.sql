-- RPC to safely claim a push endpoint for the current authenticated user.
-- Using SECURITY DEFINER so it can DELETE a row owned by a different user
-- (the client-side RLS DELETE policy is scoped to own rows only).
-- This prevents one device endpoint from being associated with multiple users.
CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint TEXT,
  p_p256dh  TEXT,
  p_auth    TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove any existing subscription for this endpoint regardless of owner
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint;

  -- Claim endpoint for the current user
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_push_subscription(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_push_subscription(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(TEXT, TEXT, TEXT) TO authenticated;
