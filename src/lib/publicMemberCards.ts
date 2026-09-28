import { supabase } from "@/integrations/supabase/client";

/**
 * First name and photo of discoverable members, for signed-out pages (Browse
 * sits cards, a listing's host). Signed-out visitors can't read profiles or
 * public_profiles; get_public_member_cards returns only these two fields.
 */
export interface PublicMemberCard {
  id: string;
  first_name: string | null;
  avatar_url: string | null;
}

export const fetchPublicMemberCards = async (ids: string[]): Promise<PublicMemberCard[]> => {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc("get_public_member_cards", { p_user_ids: ids.slice(0, 100) });
  if (error) return [];
  return (data ?? []) as unknown as PublicMemberCard[];
};
