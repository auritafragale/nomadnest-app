import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveListingConversation } from "@/lib/conversations";
import type { Sit } from "@/hooks/useSits";

/** Open the one chat for this sit's home, creating it if needed. */
export const useOpenSitChat = (sit: Sit | undefined) => {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const open = async () => {
    if (!sit || opening) return;
    setOpening(true);
    try {
      const id = await resolveListingConversation({
        listingId: sit.listing_id,
        ownerUserId: sit.owner_user_id,
        sitterUserId: sit.sitter_user_id,
      });
      navigate(id ? `/inbox?conversation=${id}` : "/inbox");
    } catch {
      navigate("/inbox");
    } finally {
      setOpening(false);
    }
  };
  return { open, opening };
};

/** Has the signed-in member already reviewed this sit? */
export const useHasReviewed = (sitId: string, enabled: boolean) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["has-reviewed", sitId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("reviews")
        .select("id")
        .eq("sit_id", sitId)
        .eq("reviewer_user_id", user!.id)
        .maybeSingle();
      return !!data;
    },
    enabled: enabled && !!user,
  });
};
