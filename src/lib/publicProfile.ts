import { supabase } from "@/integrations/supabase/client";

// Safe cross-user profile data. The `public_profiles` view only exposes
// display fields (names, avatar, city/country, verification/founding badges)
// of discoverable members — email, phone numbers, membership data, Onfido
// IDs and admin flags are column-revoked on the base `profiles` table and
// are never readable through the Data API.
//
// Use `profiles` directly ONLY for the signed-in user's own row.

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
  founding_member: boolean | null;
}

export const PUBLIC_PROFILE_COLUMNS =
  "id, first_name, last_name, avatar_url, city, country, id_verified, email_verified, phone_verified, is_founding_member";

// The view isn't in the generated Database types yet, so the result is
// untyped (PostgrestBuilder<unknown>). Cast with `as unknown as PublicProfile[]`.
export const publicProfiles = (columns = PUBLIC_PROFILE_COLUMNS) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase.from("public_profiles" as any).select(columns);
