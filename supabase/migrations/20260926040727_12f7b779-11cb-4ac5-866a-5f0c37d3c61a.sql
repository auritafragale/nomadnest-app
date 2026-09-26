-- ═══════════════════════════════════════════════════════════════════════════
-- Security hardening: listings.address_private
-- ═══════════════════════════════════════════════════════════════════════════
--
-- APPLY ONLY AFTER the frontend that selects explicit listing columns is
-- published. After this migration, select("*") on listings — and a bare
-- .select() after insert/update — fails for anon and authenticated users.
--
-- An earlier migration added get_listing_private_address (owner or accepted
-- Nomad only) but never revoked direct access to the column, and the public
-- listings SELECT policy is row-level only. So address_private was readable
-- through the API for every visible listing. This withholds the column from
-- anon and authenticated; the RPC stays the only way to read it from the app.
--
-- Owners can still INSERT/UPDATE address_private: only SELECT is restricted.
-- Edge functions (service_role) and SECURITY DEFINER functions are unaffected.
--
-- NOTE FOR FUTURE MIGRATIONS: a new listings column is NOT readable by anon /
-- authenticated until it's added to the column grant. Add it to
-- LISTING_COLUMNS in src/lib/privateColumns.ts as well.

DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'listings'
    AND column_name <> 'address_private';

  EXECUTE 'REVOKE SELECT ON public.listings FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.listings TO anon, authenticated', v_cols);
END;
$$;