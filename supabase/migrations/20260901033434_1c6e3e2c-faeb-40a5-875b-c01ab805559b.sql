-- Narrow row exposure to discoverable members only, and document intent.
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT p.id, p.first_name, p.last_name, p.avatar_url, p.city, p.country,
       p.bio, p.location, p.full_name,
       p.id_verified, p.email_verified, p.phone_verified,
       CASE WHEN p.founding_member IS TRUE AND p.membership_status = 'active'
            THEN TRUE ELSE FALSE END AS is_founding_member
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM public.sitter_profiles sp
              WHERE sp.user_id = p.id AND sp.is_visible IS TRUE)
   OR EXISTS (SELECT 1 FROM public.owner_profiles op
              WHERE op.user_id = p.id AND op.is_active IS TRUE)
   OR EXISTS (SELECT 1 FROM public.listings l
              WHERE l.owner_user_id = p.id AND l.status = 'published')
   OR EXISTS (SELECT 1 FROM public.sits s
              WHERE s.owner_user_id = p.id OR s.sitter_user_id = p.id);

COMMENT ON VIEW public.public_profiles IS
'Intentionally evaluated as the view owner (bypasses base-table RLS and column revokes) so that only curated display fields of discoverable members are exposed. Sensitive columns (email, phone_number, membership fields, Onfido IDs, is_admin) are column-revoked on public.profiles and are never selected here.';