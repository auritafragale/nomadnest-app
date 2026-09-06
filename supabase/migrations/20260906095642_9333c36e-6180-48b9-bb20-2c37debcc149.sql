CREATE TABLE public.conversation_pair_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_pair_threads_distinct_users CHECK (user_a_id <> user_b_id),
  CONSTRAINT conversation_pair_threads_canonical_order CHECK (user_a_id::text < user_b_id::text),
  CONSTRAINT conversation_pair_threads_unique_pair UNIQUE (user_a_id, user_b_id)
);

GRANT SELECT ON public.conversation_pair_threads TO authenticated;
GRANT ALL ON public.conversation_pair_threads TO service_role;

ALTER TABLE public.conversation_pair_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pair participants can view their chat group"
ON public.conversation_pair_threads
FOR SELECT
TO authenticated
USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE TRIGGER update_conversation_pair_threads_updated_at
BEFORE UPDATE ON public.conversation_pair_threads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.conversations
ADD COLUMN pair_thread_id uuid REFERENCES public.conversation_pair_threads(id) ON DELETE RESTRICT;

CREATE INDEX conversations_pair_thread_id_idx
ON public.conversations(pair_thread_id);

CREATE OR REPLACE FUNCTION public.assign_conversation_pair_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  canonical_a uuid;
  canonical_b uuid;
  resolved_thread_id uuid;
BEGIN
  IF NEW.owner_user_id IS NULL OR NEW.sitter_user_id IS NULL THEN
    NEW.pair_thread_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.owner_user_id::text < NEW.sitter_user_id::text THEN
    canonical_a := NEW.owner_user_id;
    canonical_b := NEW.sitter_user_id;
  ELSE
    canonical_a := NEW.sitter_user_id;
    canonical_b := NEW.owner_user_id;
  END IF;

  INSERT INTO public.conversation_pair_threads (user_a_id, user_b_id)
  VALUES (canonical_a, canonical_b)
  ON CONFLICT (user_a_id, user_b_id)
  DO UPDATE SET updated_at = public.conversation_pair_threads.updated_at
  RETURNING id INTO resolved_thread_id;

  NEW.pair_thread_id := resolved_thread_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_conversation_pair_thread() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_conversation_pair_thread() TO service_role;

CREATE TRIGGER assign_conversation_pair_thread_before_write
BEFORE INSERT OR UPDATE OF owner_user_id, sitter_user_id
ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.assign_conversation_pair_thread();

WITH canonical_pairs AS (
  SELECT DISTINCT
    CASE WHEN owner_user_id::text < sitter_user_id::text THEN owner_user_id ELSE sitter_user_id END AS user_a_id,
    CASE WHEN owner_user_id::text < sitter_user_id::text THEN sitter_user_id ELSE owner_user_id END AS user_b_id
  FROM public.conversations
  WHERE owner_user_id IS NOT NULL AND sitter_user_id IS NOT NULL
)
INSERT INTO public.conversation_pair_threads (user_a_id, user_b_id)
SELECT user_a_id, user_b_id
FROM canonical_pairs
ON CONFLICT (user_a_id, user_b_id) DO NOTHING;

UPDATE public.conversations AS c
SET pair_thread_id = pt.id
FROM public.conversation_pair_threads AS pt
WHERE c.pair_thread_id IS NULL
  AND pt.user_a_id = CASE WHEN c.owner_user_id::text < c.sitter_user_id::text THEN c.owner_user_id ELSE c.sitter_user_id END
  AND pt.user_b_id = CASE WHEN c.owner_user_id::text < c.sitter_user_id::text THEN c.sitter_user_id ELSE c.owner_user_id END;

ALTER TABLE public.conversations
ALTER COLUMN pair_thread_id SET NOT NULL;