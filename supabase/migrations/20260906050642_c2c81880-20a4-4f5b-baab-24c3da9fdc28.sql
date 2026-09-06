CREATE UNIQUE INDEX IF NOT EXISTS conversations_unique_listing_pair
  ON public.conversations (listing_id, LEAST(owner_user_id, sitter_user_id), GREATEST(owner_user_id, sitter_user_id))
  WHERE listing_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_unique_direct_pair
  ON public.conversations (LEAST(owner_user_id, sitter_user_id), GREATEST(owner_user_id, sitter_user_id))
  WHERE listing_id IS NULL;