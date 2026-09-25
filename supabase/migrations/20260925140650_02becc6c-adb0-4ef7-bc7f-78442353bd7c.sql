-- ═══════════════════════════════════════════════════════════════════════════
-- AI Application Co-Writer
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. ai_usage: one row per successful AI draft, used by the draft-application
--    edge function for its rolling 24h rate limit. Only the service role
--    writes to it; members can read (count) their own rows.
-- 2. app_settings: simple key/value feature flags, readable by signed-in
--    members, writable only by the service role. Seeded with
--    ai_cowriter_enabled = false so the Co-Writer stays hidden (except for
--    admins, enforced in the edge function) until launch.
--
-- NOT applied automatically — apply via the database tool per the usual
-- workflow for this project.


-- ─── 1. ai_usage ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_feature_created_idx
  ON public.ai_usage (user_id, feature, created_at);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Members may only read their own rows; there are deliberately no INSERT,
-- UPDATE or DELETE policies, and the table-level grants are removed too,
-- so only the service role (which bypasses RLS) can write.
REVOKE ALL ON public.ai_usage FROM anon, authenticated;
GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

DROP POLICY IF EXISTS "Users can view own AI usage" ON public.ai_usage;
CREATE POLICY "Users can view own AI usage"
ON public.ai_usage
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);


-- ─── 2. app_settings (feature flags) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_settings FROM anon, authenticated;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

-- Non-sensitive flags only: every signed-in member can read every row.
DROP POLICY IF EXISTS "Signed-in users can read app settings" ON public.app_settings;
CREATE POLICY "Signed-in users can read app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

INSERT INTO public.app_settings (key, value)
VALUES ('ai_cowriter_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;