import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSideAccess } from "@/hooks/useSideAccess";

/**
 * Member perks (Batch P1). Nobody reads public.perks directly:
 *   get_perks_preview()          anyone: id, name, logo, category, trip moment, order
 *   get_member_perks()           members only: display fields, has_code, used_by_me
 *   get_perk_discount_code(slug) members only: the code
 *   perk-redirect (edge)         members only: the partner link
 * Signed-out visitors and non-members only ever call the preview.
 */

export const PERK_CATEGORIES = [
  "Travel",
  "Insurance",
  "Data",
  "Activities",
  "Pet Care",
  "Gear & Tech",
  "Health & Wellness",
  "Coworking",
  "Other",
] as const;

export type TripMoment = "before" | "road" | "sit";
export const TRIP_MOMENTS: { id: TripMoment; label: string; intro: string }[] = [
  { id: "before", label: "Before you fly", intro: "Cover, data and a safe connection." },
  { id: "road", label: "On the road", intro: "Drop your bags, see the city." },
  { id: "sit", label: "At the sit", intro: "For the pets you look after." },
];
export const tripMomentOf = (value: string | null | undefined): TripMoment =>
  value === "before" || value === "sit" ? value : "road";

export interface PerkPreview {
  id: string;
  name: string;
  logo_url: string | null;
  category: string;
  trip_moment: string;
  sort_order: number;
}

export interface MemberPerk extends PerkPreview {
  slug: string;
  description: string | null;
  terms: string | null;
  expires_at: string | null;
  benefit_headline: string | null;
  benefit_subline: string | null;
  is_perk_of_month: boolean;
  spotlight_text: string | null;
  picked_for_sits: boolean;
  has_code: boolean;
  used_by_me: boolean;
}

export interface NextSitForPerks {
  city: string | null;
  country: string | null;
  start_date: string | null;
  end_date: string | null;
}

/** Is the signed-in member on either side (Founding, active, or past due in the grace week)? */
export const usePerkAccess = () => {
  const { user, loading: authLoading } = useAuth();
  const access = useSideAccess();
  const isMember = !!user && !!access.data && (access.data.sitter || access.data.owner);
  return {
    signedIn: !!user,
    isMember,
    loading: authLoading || (!!user && access.isLoading),
  };
};

export const usePerksPreview = (enabled = true) =>
  useQuery({
    queryKey: ["perks-preview"],
    enabled,
    queryFn: async (): Promise<PerkPreview[]> => {
      const { data, error } = await supabase.rpc("get_perks_preview");
      if (error) throw error;
      return (data ?? []) as PerkPreview[];
    },
    staleTime: 5 * 60_000,
  });

export const useMemberPerks = (enabled: boolean) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["member-perks", user?.id],
    enabled: enabled && !!user,
    queryFn: async (): Promise<MemberPerk[]> => {
      const { data, error } = await supabase.rpc("get_member_perks");
      if (error) throw error;
      return (data ?? []) as MemberPerk[];
    },
  });
};

export const useMyNextSitForPerks = (enabled: boolean) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["perks-next-sit", user?.id],
    enabled: enabled && !!user,
    queryFn: async (): Promise<NextSitForPerks | null> => {
      const { data, error } = await supabase.rpc("get_my_next_sit_for_perks");
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as NextSitForPerks | undefined;
      return row ?? null;
    },
  });
};

/** First name and Founding flag for the member card (the member's own). */
export const usePerkMemberCard = (enabled: boolean) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["perks-member-card", user?.id],
    enabled: enabled && !!user,
    queryFn: async () => {
      const [{ data: me }, { data: membership }] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", user!.id).maybeSingle(),
        supabase.rpc("get_my_membership"),
      ]);
      const m = (Array.isArray(membership) ? membership[0] : membership) as { founding_member?: boolean } | undefined;
      return { firstName: (me?.first_name ?? "").trim() || null, founding: !!m?.founding_member };
    },
  });
};

export const getDiscountCode = async (slug: string): Promise<string | null> => {
  const { data, error } = await supabase.rpc("get_perk_discount_code", { p_slug: slug });
  if (error) throw error;
  return (data as string | null) ?? null;
};

export const openPerk = async (slug: string) => {
  const { data, error } = await supabase.functions.invoke("perk-redirect", {
    body: { slug, referrer: window.location.pathname },
  });
  if (error) throw error;
  if (data?.url) window.open(data.url as string, "_blank", "noopener,noreferrer");
  else throw new Error("Could not open this perk right now.");
};

/** The headline to show: the admin's, unless it is empty or a placeholder
 *  ("Get $ OFF": a currency sign with no amount). */
export const perkHeadline = (headline: string | null | undefined) => {
  const h = (headline ?? "").trim();
  if (!h || isPlaceholderHeadline(h)) return "Member discount";
  return h;
};

/** "$" or "£" without a number is a placeholder (saving one is blocked). */
export const isPlaceholderHeadline = (headline: string) => /[$£]/.test(headline) && !/\d/.test(headline);
