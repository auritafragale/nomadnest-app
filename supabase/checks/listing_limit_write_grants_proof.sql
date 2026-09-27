-- Listing limit + column-level write grants: proof that the live database
-- matches 20260927160000_listing_limit_and_write_grants.sql.
-- READ-ONLY. One row per check; every row should have ok = true.

WITH
spec(tbl, priv, cols) AS (VALUES
  ('profiles', 'UPDATE', ARRAY['first_name', 'last_name', 'full_name', 'bio', 'location', 'avatar_url', 'city', 'country']),
  ('profiles', 'INSERT', ARRAY[]::text[]),
  ('sitter_profiles', 'UPDATE', ARRAY['user_id', 'headline', 'bio', 'why_i_sit', 'experience_level', 'experience_details',
    'languages', 'pet_types', 'comfortable_with', 'sit_style', 'home_preferences', 'house_rules_compatibility',
    'availability_type', 'available_from', 'available_to', 'preferred_regions', 'preferred_countries',
    'preferred_cities', 'gallery', 'age_range', 'latitude', 'longitude', 'is_visible', 'is_active']),
  ('sitter_profiles', 'INSERT', ARRAY['user_id', 'headline', 'bio', 'why_i_sit', 'experience_level', 'experience_details',
    'languages', 'pet_types', 'comfortable_with', 'sit_style', 'home_preferences', 'house_rules_compatibility',
    'availability_type', 'available_from', 'available_to', 'preferred_regions', 'preferred_countries',
    'preferred_cities', 'gallery', 'age_range', 'latitude', 'longitude', 'is_visible', 'is_active']),
  ('owner_profiles', 'UPDATE', ARRAY['user_id', 'bio', 'is_active']),
  ('owner_profiles', 'INSERT', ARRAY['user_id', 'bio', 'is_active']),
  ('listings', 'UPDATE', ARRAY['title', 'description', 'ideal_nomad_types', 'status', 'home_type', 'location_type',
    'public_transport_accessible', 'city', 'country', 'area', 'address_private', 'latitude', 'longitude',
    'wifi_quality', 'sleeping_arrangement', 'amenities', 'photos', 'requirements', 'requirements_other',
    'house_rules', 'house_rules_other', 'home_care_tasks', 'home_care_tasks_other', 'ideal_sitter_description',
    'communication_style', 'remote_location', 'car_needed', 'heavy_gardening', 'wheelchair_accessible',
    'owner_declaration_accepted_at']),
  ('pets', 'UPDATE', ARRAY['name', 'type', 'age', 'personality', 'feeding_details', 'daily_routine', 'walks_exercise',
    'has_medication', 'requires_medication', 'medication_instructions', 'vet_info', 'photos',
    'separation_anxiety_tolerance', 'reactive_to_animals', 'behaviour_notes']),
  ('sit_dates', 'UPDATE', ARRAY['start_date', 'end_date', 'flexibility', 'handover_preference', 'status']),
  ('sits', 'UPDATE', ARRAY['status', 'completed_at']),
  ('applications', 'UPDATE', ARRAY['status']),
  ('sitter_invites', 'UPDATE', ARRAY['status']),
  ('notifications', 'UPDATE', ARRAY['read_at']),
  ('notification_preferences', 'UPDATE', ARRAY['user_id', 'email_new_applications', 'email_messages',
    'email_sit_updates', 'email_reviews', 'email_application_status', 'email_membership']),
  ('manual_id_verifications', 'UPDATE', ARRAY['id_photo_path', 'selfie_path']),
  ('user_roles', 'UPDATE', ARRAY['user_id', 'role', 'onboarding_completed']),
  ('guide_qa', 'UPDATE', ARRAY['answer', 'arrival_only']),
  ('welcome_guide_photos', 'UPDATE', ARRAY['note', 'instruction']),
  ('welcome_guides', 'UPDATE', ARRAY['listing_id', 'owner_user_id', 'emergency_contacts', 'out_of_hours_vet',
    'house_notes', 'bins_recycling', 'plants', 'appliances', 'heating_cooling', 'parking', 'neighbours',
    'na_fields', 'migrated_notes']),
  ('welcome_guide_access', 'UPDATE', ARRAY['listing_id', 'owner_user_id', 'key_handover', 'door_codes',
    'alarm_instructions', 'wifi_details', 'na_fields'])
),
cols AS (
  SELECT s.tbl, s.priv, c.column_name,
         c.column_name = ANY (s.cols) AS expected,
         has_column_privilege('authenticated', format('public.%I', s.tbl), c.column_name, s.priv) AS member_has,
         has_column_privilege('anon', format('public.%I', s.tbl), c.column_name, s.priv) AS anon_has
  FROM spec s
  JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = s.tbl
),
-- Trust and system columns that must never be member-writable.
sensitive(tbl, col) AS (VALUES
  ('profiles', 'reliability_score'), ('profiles', 'flagged_for_admin_review'), ('profiles', 'is_admin'),
  ('profiles', 'founding_member'), ('profiles', 'founding_badge'), ('profiles', 'membership_status'),
  ('profiles', 'membership_type'), ('profiles', 'membership_expiry'), ('profiles', 'email'),
  ('profiles', 'email_verified'), ('profiles', 'phone_number'), ('profiles', 'phone_verified'),
  ('profiles', 'phone_verified_at'), ('profiles', 'phone_line_type'), ('profiles', 'id_verified'),
  ('profiles', 'onfido_applicant_id'), ('profiles', 'onfido_check_id'), ('profiles', 'max_listings'),
  ('profiles', 'reliability_strike_email_sent_at'), ('profiles', 'preferred_language'),
  ('profiles', 'share_name_in_stories'),
  ('sitter_profiles', 'id_verified'), ('sitter_profiles', 'background_check'), ('sitter_profiles', 'phone'),
  ('owner_profiles', 'phone'),
  ('listings', 'owner_user_id'), ('listings', 'approx_latitude'), ('listings', 'approx_longitude'), ('listings', 'timezone'),
  ('sits', 'owner_user_id'), ('sits', 'sitter_user_id'), ('sits', 'listing_id'), ('sits', 'cancelled_from_status'),
  ('manual_id_verifications', 'status'), ('manual_id_verifications', 'reviewed_by'),
  ('welcome_guide_photos', 'storage_path')
),
fn(name, marker) AS (VALUES
  ('enforce_listing_limit', 'FOR UPDATE'),
  ('get_my_settings', 'max_listings'),
  ('admin_get_listing_allowance', 'is_admin_user'),
  ('admin_set_max_listings', 'is_admin_user'),
  ('listing_owner_declaration', 'OLD.owner_declaration_accepted_at'),
  ('process_review_flags', 'not_homeowner'),
  ('export_account_data', 'flag_not_homeowner')
),
trg(tbl, name) AS (VALUES
  ('listings', 'enforce_listing_limit'), ('listings', 'listing_owner_declaration'),
  ('profiles', 'prevent_privilege_escalation'), ('sitter_profiles', 'prevent_sitter_verification_escalation'),
  ('sits', 'guard_sit_update'), ('applications', 'guard_application_update'), ('sit_dates', 'guard_sit_dates_change')
)

SELECT format('%s %s: no table-level grant (member / anon)', tbl, priv) AS item,
       'false / false' AS expected,
       has_table_privilege('authenticated', format('public.%I', tbl), priv)::text || ' / ' ||
       has_table_privilege('anon', format('public.%I', tbl), priv)::text AS actual,
       NOT has_table_privilege('authenticated', format('public.%I', tbl), priv)
         AND NOT has_table_privilege('anon', format('public.%I', tbl), priv) AS ok
FROM spec

UNION ALL
SELECT format('%s %s: member columns exactly as listed', tbl, priv),
       COALESCE(string_agg(column_name, ', ' ORDER BY column_name) FILTER (WHERE expected), '(none)'),
       COALESCE(string_agg(column_name, ', ' ORDER BY column_name) FILTER (WHERE member_has), '(none)'),
       bool_and(expected = member_has)
FROM cols GROUP BY tbl, priv

UNION ALL
SELECT format('%s %s: anon has no columns', tbl, priv), '(none)',
       COALESCE(string_agg(column_name, ', ' ORDER BY column_name) FILTER (WHERE anon_has), '(none)'),
       NOT bool_or(anon_has)
FROM cols GROUP BY tbl, priv

UNION ALL
SELECT format('%s.%s not member-writable', s.tbl, s.col), 'no UPDATE, no INSERT',
       CASE WHEN c.column_name IS NULL THEN 'column missing'
            ELSE 'UPDATE ' || has_column_privilege('authenticated', format('public.%I', s.tbl), s.col, 'UPDATE')::text
              || ', INSERT ' || has_column_privilege('authenticated', format('public.%I', s.tbl), s.col, 'INSERT')::text END,
       c.column_name IS NULL
         OR (NOT has_column_privilege('authenticated', format('public.%I', s.tbl), s.col, 'UPDATE')
             AND (s.tbl NOT IN ('profiles', 'sitter_profiles', 'owner_profiles')
                  OR NOT has_column_privilege('authenticated', format('public.%I', s.tbl), s.col, 'INSERT')))
FROM sensitive s
LEFT JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = s.tbl AND c.column_name = s.col

UNION ALL
SELECT format('%s.%s private (no member or anon SELECT)', t, c), 'false / false',
       has_column_privilege('authenticated', format('public.%I', t), c, 'SELECT')::text || ' / ' ||
       has_column_privilege('anon', format('public.%I', t), c, 'SELECT')::text,
       NOT has_column_privilege('authenticated', format('public.%I', t), c, 'SELECT')
         AND NOT has_column_privilege('anon', format('public.%I', t), c, 'SELECT')
FROM (VALUES ('profiles', 'max_listings'), ('listings', 'owner_declaration_accepted_at'),
             ('reviews', 'flag_not_homeowner')) AS p(t, c)

UNION ALL
SELECT 'profiles.max_listings shape', 'integer, not null, default 1',
       data_type || ', ' || CASE WHEN is_nullable = 'NO' THEN 'not null' ELSE 'nullable' END || ', default ' || COALESCE(column_default, '-'),
       data_type = 'integer' AND is_nullable = 'NO' AND column_default = '1'
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'max_listings'

UNION ALL
SELECT 'reviews.flag_not_homeowner check', 'yes / no / not_sure',
       COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'reviews_flag_not_homeowner_values'), 'missing'),
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_flag_not_homeowner_values')

UNION ALL
SELECT format('trigger %s on %s', t.name, t.tbl), 'enabled',
       COALESCE((SELECT tg.tgenabled::text FROM pg_trigger tg
                 WHERE tg.tgrelid = format('public.%I', t.tbl)::regclass AND tg.tgname = t.name), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg
               WHERE tg.tgrelid = format('public.%I', t.tbl)::regclass AND tg.tgname = t.name AND tg.tgenabled <> 'D')
FROM trg t

UNION ALL
SELECT format('function %s has %s', f.name, f.marker), 'present',
       CASE WHEN p.oid IS NULL THEN 'missing'
            WHEN position(f.marker IN pg_get_functiondef(p.oid)) > 0 THEN 'present' ELSE 'marker missing' END,
       p.oid IS NOT NULL AND position(f.marker IN pg_get_functiondef(p.oid)) > 0
FROM fn f
LEFT JOIN pg_proc p ON p.proname = f.name AND p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT format('function %s: no anon execute', p.proname), 'false',
       has_function_privilege('anon', p.oid, 'EXECUTE')::text,
       NOT has_function_privilege('anon', p.oid, 'EXECUTE')
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('enforce_listing_limit', 'get_my_settings', 'admin_get_listing_allowance',
                    'admin_set_max_listings', 'listing_owner_declaration', 'process_review_flags', 'export_account_data')

UNION ALL
SELECT 'export_account_data: service role only', 'authenticated false',
       'authenticated ' || has_function_privilege('authenticated', 'public.export_account_data(uuid)', 'EXECUTE')::text,
       NOT has_function_privilege('authenticated', 'public.export_account_data(uuid)', 'EXECUTE')

ORDER BY ok, item;
