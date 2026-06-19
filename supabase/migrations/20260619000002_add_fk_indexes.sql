-- Add indexes on foreign-key columns used by RLS policies.
-- None of these tables have explicit indexes beyond their primary keys.

CREATE INDEX IF NOT EXISTS idx_applications_listing_id        ON public.applications (listing_id);
CREATE INDEX IF NOT EXISTS idx_applications_sitter_user_id    ON public.applications (sitter_user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_owner_user_id    ON public.conversations (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_sitter_user_id   ON public.conversations (sitter_user_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id       ON public.messages (conversation_id);

CREATE INDEX IF NOT EXISTS idx_sits_owner_user_id             ON public.sits (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sits_sitter_user_id            ON public.sits (sitter_user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id          ON public.notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_user_id       ON public.reviews (reviewee_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_sit_id                 ON public.reviews (sit_id);

CREATE INDEX IF NOT EXISTS idx_sitter_invites_owner_user_id   ON public.sitter_invites (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sitter_invites_sitter_user_id  ON public.sitter_invites (sitter_user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id     ON public.push_subscriptions (user_id);
