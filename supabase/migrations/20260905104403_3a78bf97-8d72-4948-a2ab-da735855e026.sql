ALTER TABLE public.welcome_guides ALTER COLUMN owner_user_id SET NOT NULL;
DROP INDEX IF EXISTS public.welcome_guides_owner_user_id_key;
ALTER TABLE public.welcome_guides ADD CONSTRAINT welcome_guides_owner_user_id_key UNIQUE (owner_user_id);