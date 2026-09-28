import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Chat pill: every live sit between the two members ──────────────────────

export interface ConversationActiveSit {
  sit_id: string;
  listing_title: string;
  role: "owner" | "sitter";
  sitter_first_name: string;
  sent_today: boolean;
  due_today: boolean;
}

export const useConversationActiveSits = (conversationIds: string[]) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conversation-active-sits", [...conversationIds].sort().join(","), user?.id],
    queryFn: async (): Promise<ConversationActiveSit[]> => {
      const { data, error } = await supabase.rpc("get_conversation_active_sits", { p_conversation_ids: conversationIds });
      if (error) throw error;
      return (data ?? []) as unknown as ConversationActiveSit[];
    },
    enabled: !!user && conversationIds.length > 0,
    refetchInterval: 60_000,
  });
};

// ─── Sit Story ───────────────────────────────────────────────────────────────

export interface SitStory {
  id: string;
  sit_id: string;
  status: "queued" | "generating" | "ready" | "failed";
  role: "owner" | "sitter";
  title: string | null;
  story: string | null;
  photo_paths: string[];
  city: string | null;
  owner_user_id: string | null;
  sitter_user_id: string | null;
  owner_first_name: string;
  sitter_first_name: string;
  /** The sitter's first name if they allow it on share cards, else null. */
  sitter_share_name: string | null;
  can_review: boolean;
  portfolio_status: "none" | "requested" | "approved" | "declined" | "revoked";
  portfolio_photo_paths: string[];
}

export const useSitStory = (storyId: string | undefined) =>
  useQuery({
    queryKey: ["sit-story", storyId],
    queryFn: async (): Promise<SitStory | null> => {
      const { data, error } = await supabase.rpc("get_sit_story", { p_story_id: storyId! });
      if (error) throw error;
      return (data ?? null) as unknown as SitStory | null;
    },
    enabled: !!storyId,
    // While a story is being (re)written, check back every few seconds.
    refetchInterval: (query) => {
      const d = query.state.data as SitStory | null | undefined;
      return d && (d.status === "queued" || d.status === "generating") ? 5_000 : false;
    },
  });

/** The story for a sit, if there is one (for a link from the sit page). */
export const useStoryForSit = (sitId: string | undefined) =>
  useQuery({
    queryKey: ["sit-story-for-sit", sitId],
    queryFn: async () => {
      const { data } = await supabase.from("sit_stories").select("id, status, title").eq("sit_id", sitId!).maybeSingle();
      return data as { id: string; status: string; title: string | null } | null;
    },
    enabled: !!sitId,
  });

export const useSitStoryActions = (storyId: string | undefined) => {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["sit-story", storyId] });

  const requestPortfolio = useMutation({
    mutationFn: async (request: boolean) => {
      const { error } = await supabase.rpc("set_sit_story_portfolio_request", { p_story_id: storyId!, p_request: request });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });

  const decidePortfolio = useMutation({
    mutationFn: async ({ decision, photoPaths = [] }: { decision: "approve" | "decline"; photoPaths?: string[] }) => {
      const { error } = await supabase.rpc("decide_sit_story_portfolio", {
        p_story_id: storyId!,
        p_decision: decision,
        p_photo_paths: photoPaths,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });

  // Owner, after approval: remove one photo from the Nomad's profile.
  const removePortfolioPhoto = useMutation({
    mutationFn: async (path: string) => {
      const { error } = await supabase.rpc("remove_sit_story_portfolio_photo", { p_story_id: storyId!, p_path: path });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });

  return { requestPortfolio, decidePortfolio, removePortfolioPhoto };
};

// ─── Sitter profile: approved stories ───────────────────────────────────────

export interface PortfolioStory {
  id: string;
  title: string;
  excerpt: string;
  city: string | null;
  photo_paths: string[];
  ready_at: string;
}

/** An approved story as shown on the Nomad's profile (any signed-in member). */
export interface PortfolioStoryFull {
  id: string;
  title: string;
  story: string;
  city: string | null;
  photo_paths: string[];
  sitter_user_id: string;
  ready_at: string;
}

export const usePortfolioStory = (storyId: string | null) =>
  useQuery({
    queryKey: ["portfolio-story", storyId],
    queryFn: async (): Promise<PortfolioStoryFull | null> => {
      const { data, error } = await supabase.rpc("get_portfolio_story", { p_story_id: storyId! });
      if (error) throw error;
      return (data ?? null) as unknown as PortfolioStoryFull | null;
    },
    enabled: !!storyId,
  });

export const useSitterPortfolio = (sitterId: string | undefined) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sitter-portfolio", sitterId],
    queryFn: async (): Promise<PortfolioStory[]> => {
      const { data, error } = await supabase.rpc("get_sitter_portfolio", { p_sitter_id: sitterId! });
      if (error) throw error;
      return (data ?? []) as unknown as PortfolioStory[];
    },
    enabled: !!sitterId && !!user,
  });
};

// ─── Dashboard: the member's Sit Stories ────────────────────────────────────

export type PortfolioStatus = "none" | "requested" | "approved" | "declined" | "revoked";

export interface MySitStory {
  id: string;
  sit_id: string;
  role: "owner" | "sitter";
  status: "queued" | "generating" | "ready";
  title: string | null;
  excerpt: string | null;
  photo_path: string | null;
  listing_title: string | null;
  city: string | null;
  other_first_name: string;
  portfolio_status: PortfolioStatus;
  ready_at: string | null;
}

export const useMySitStories = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-sit-stories", user?.id],
    queryFn: async (): Promise<MySitStory[]> => {
      const { data, error } = await supabase.rpc("get_my_sit_stories");
      if (error) throw error;
      return (data ?? []) as unknown as MySitStory[];
    },
    enabled: !!user,
  });
};
