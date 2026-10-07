import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PhoneShareState {
  /** A confirmed or in-progress sit between the two of you. */
  can_share: boolean;
  my_phone_verified: boolean;
  /** Your own verified number (for the confirm sheet). */
  my_number: string | null;
  i_am_sharing: boolean;
  they_are_sharing: boolean;
  /** Their number, only while they share it with you. */
  their_number: string | null;
  their_first_name: string;
}

/**
 * Share my number. The database decides everything: who can share (a
 * confirmed or in-progress sit, a verified phone) and who can read a number
 * (only the person it's shared with, only while it's shared).
 */
export const usePhoneShares = (otherUserId: string | null | undefined) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ["phone-shares", user?.id, otherUserId] as const;

  const state = useQuery({
    queryKey: key,
    queryFn: async (): Promise<PhoneShareState | null> => {
      const { data, error } = await supabase.rpc("get_phone_shares", { p_other_user: otherUserId! });
      if (error) throw error;
      return ((data ?? [])[0] as PhoneShareState | undefined) ?? null;
    },
    enabled: !!user && !!otherUserId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["phone-shares"] });
    queryClient.invalidateQueries({ queryKey: ["messages"] });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const share = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("share_my_phone", { p_other_user: otherUserId! });
      if (error) {
        if (error.message?.includes("no_verified_phone")) throw new Error("Add a verified phone number first.");
        if (error.message?.includes("no_confirmed_sit")) throw new Error("You can share your number once a sit is confirmed.");
        throw new Error("We couldn't share your number. Please try again.");
      }
    },
    onSettled: refresh,
  });

  const stop = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("stop_sharing_my_phone", { p_other_user: otherUserId! });
      if (error) throw new Error("We couldn't stop sharing. Please try again.");
    },
    onSettled: refresh,
  });

  return { state: state.data ?? null, isLoading: state.isLoading, share, stop };
};
