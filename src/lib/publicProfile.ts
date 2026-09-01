import { supabase } from "@/integrations/supabase/client";

// Safe cross-user profile data. The `public_profiles` view only exposes
// display fields (names, avatar, city/country, badges) — email, phone
// numbers, membership data, Onfido IDs and admin flags are column-revoked
// on the base `profiles` table and never readable through the Data API.

export interface PublicProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  location: string | null;
  full_name: string | null;
  id_verified: boolean | null;
  email_verified: boolean | null;
  phone_verified: boolean | null;
  is_founding_member: boolean | null;
}

type PublicProfileQuery = {
  eq: (column: string, value: unknown) => PublicProfileQuery;
  in: (column: string, values: unknown[]) => PromiseLike<{ data: PublicProfile[] | null; error: { message: string } | null }> & PublicProfileQuery;
  maybeSingle: () => PromiseLike<{ data: PublicProfile | null; error: { message: string } | null }>;
};

// Thin typed wrapper over the public_profiles view. Accepts .eq() chains and
// .in() filters, then either resolves to rows (await) or .maybeSingle().
export function publicProfiles(columns = "*"): PublicProfileQuery {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase.from("public_profiles" as never).select(columns) as any;

  const api: PublicProfileQuery = {
    eq(column: string, value: unknown) {
      query = query.eq(column, value);
      return api;
    },
    in(column: string, values: unknown[]) {
      query = query.in(column, values);
      return api as never;
    },
    maybeSingle() {
      return query.maybeSingle();
    },
    then(onfulfilled, onrejected) {
      return (query as PromiseLike<unknown>).then(onfulfilled, onrejected);
    },
  } as PublicProfileQuery;

  return api;
}
