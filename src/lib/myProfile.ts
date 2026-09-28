import { supabase } from "@/integrations/supabase/client";

/**
 * The signed-in member's own profile row, through get_my_profile(). Members
 * can't read last_name, full_name or location from the profiles table (not
 * even their own), so pages that edit the profile read it here.
 */
export interface MyProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone_number: string | null;
  preferred_language: string | null;
  share_name_in_stories: boolean | null;
  founding_badge: boolean | null;
  membership_status: string | null;
  id_verified: boolean | null;
  email_verified: boolean | null;
  phone_verified: boolean | null;
}

export const fetchMyProfile = async (): Promise<{ data: MyProfile | null }> => {
  const { data, error } = await supabase.rpc("get_my_profile");
  if (error) throw error;
  return { data: (data ?? null) as unknown as MyProfile | null };
};
