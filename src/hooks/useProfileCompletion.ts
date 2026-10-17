import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMyProfile } from "@/lib/myProfile";
import { ownerCompletion, sitterCompletion, type Completion } from "@/lib/profileCompletion";

/**
 * Profile completeness, one source per side for the Dashboard ring and card
 * and both profile editors, so they always show the same percent. Errors are
 * thrown (react-query retries), never silently read as "missing".
 * Saving in an editor invalidates PROFILE_COMPLETION_KEY.
 */
export const PROFILE_COMPLETION_KEY = ["profile-completion"] as const;

export const fetchOwnerCompletion = async (userId: string): Promise<Completion> => {
  const [{ data: me }, { data: op, error }] = await Promise.all([
    fetchMyProfile(),
    supabase.from("owner_profiles").select("bio").eq("user_id", userId).maybeSingle(),
  ]);
  if (error) throw error;
  return ownerCompletion(me, op);
};

export const fetchSitterCompletion = async (userId: string): Promise<Completion> => {
  const [{ data: me }, { data: sp, error }] = await Promise.all([
    fetchMyProfile(),
    supabase.from("sitter_profiles").select("headline, bio, pet_types, gallery, experience_level, languages, sit_style").eq("user_id", userId).maybeSingle(),
  ]);
  if (error) throw error;
  return sitterCompletion(me, sp);
};

/** Pet Parent profile completeness (`enabled`: only when the member is a Pet Parent). */
export const useOwnerCompletion = (enabled = true) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...PROFILE_COMPLETION_KEY, "owner", user?.id],
    queryFn: () => fetchOwnerCompletion(user!.id),
    enabled: !!user && enabled,
  });
};

/** Nomad profile completeness (`enabled`: only when the member is a Nomad). */
export const useSitterCompletion = (enabled = true) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...PROFILE_COMPLETION_KEY, "sitter", user?.id],
    queryFn: () => fetchSitterCompletion(user!.id),
    enabled: !!user && enabled,
  });
};
