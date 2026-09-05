
-- 1) Public profile view should run with the viewer's own permissions,
--    not the table owner's. Give every role read access to the safe,
--    display-only columns the view exposes.
GRANT SELECT (id, first_name, last_name, avatar_url, city, country, bio, location,
              full_name, id_verified, email_verified, phone_verified,
              founding_member, membership_status)
  ON public.profiles TO anon;
GRANT SELECT (phone_verified, founding_member, membership_status)
  ON public.profiles TO authenticated;

CREATE POLICY "Anyone can view profile display fields"
  ON public.profiles FOR SELECT TO anon USING (true);

-- The view's WHERE clause references sitter/owner profiles; anonymous
-- visitors need column access + visibility-scoped policies so the view
-- keeps working under invoker rights without exposing phone numbers.
GRANT SELECT (id, user_id, is_visible)
  ON public.sitter_profiles TO anon;
GRANT SELECT (id, user_id, is_active)
  ON public.owner_profiles TO anon;

CREATE POLICY "Anyone can view visible nomad profiles"
  ON public.sitter_profiles FOR SELECT TO anon USING (is_visible = true);
CREATE POLICY "Anyone can view active pet parent profiles"
  ON public.owner_profiles FOR SELECT TO anon USING (is_active = true);

-- Never expose phone numbers through the API, even if a wider grant
-- is ever added later.
REVOKE SELECT (phone) ON public.sitter_profiles FROM anon, authenticated;
REVOKE SELECT (phone) ON public.owner_profiles FROM anon, authenticated;

ALTER VIEW public.public_profiles SET (security_invoker = true);

-- 2) Internal background-job helpers should never be callable through
--    the API; they are only used by triggers, cron and the service role.
REVOKE EXECUTE ON FUNCTION public.acquire_job_lease(text, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.release_job_lease(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.advance_sit_statuses() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.request_is_end_user() FROM anon, authenticated, public;

-- 3) Every caller-scoped helper self-checks auth and returns nothing for
--    strangers; still, revoke public (signed-out) execution.
REVOKE EXECUTE ON FUNCTION public.get_my_contact_info() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_membership() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_verification() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_unread_conversations_count() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_unread_messages_count() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_messages_read(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_my_profile_phone(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_listing_private_address(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_perk_discount_code(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.redeem_founding_member_code(text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.city_chat_thread_summaries(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.member_review_rates(uuid[]) FROM anon, public;
