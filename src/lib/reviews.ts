import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canonicalPetType } from "@/lib/petTypes";

/**
 * Reviews (Batch E1). 'sitter' = reviews of a Nomad (from Pet Parents),
 * 'owner' = reviews of a Pet Parent (from Nomads). Every average on the site
 * comes from one database function, member_ratings (published reviews only,
 * recency-weighted), so the profile, cards and reviews page always agree.
 */
export type ReviewSide = "sitter" | "owner";

export type CategoryKey =
  | "rating_pet_care"
  | "rating_communication"
  | "rating_cleanliness"
  | "rating_reliability"
  | "rating_respect_home"
  | "rating_home_accuracy"
  | "rating_pet_preparedness"
  | "rating_hospitality"
  | "rating_clear_expectations";

export const REVIEW_CATEGORIES: Record<ReviewSide, { key: CategoryKey; label: string; helper: string }[]> = {
  sitter: [
    { key: "rating_pet_care", label: "Pet care", helper: "How happy and well looked after were your pets?" },
    { key: "rating_communication", label: "Communication", helper: "Did they keep you updated?" },
    { key: "rating_cleanliness", label: "Cleanliness", helper: "How tidy was your home when you got back?" },
    { key: "rating_reliability", label: "Reliability", helper: "Did they arrive and leave as agreed?" },
    { key: "rating_respect_home", label: "Respect for the home", helper: "Did they treat your home with care?" },
  ],
  owner: [
    { key: "rating_communication", label: "Communication", helper: "Were they easy to reach and clear?" },
    { key: "rating_home_accuracy", label: "Home as described", helper: "Was the home like the listing?" },
    { key: "rating_pet_preparedness", label: "Pets ready for the sit", helper: "Did you have everything the pets needed?" },
    { key: "rating_hospitality", label: "Hospitality", helper: "Was the home clean and did you feel welcome?" },
    { key: "rating_clear_expectations", label: "Clear expectations", helper: "Did you know what was expected of you?" },
  ],
};

/** "What stood out?" picks, stored as fixed keys. */
export const HIGHLIGHTS: Record<ReviewSide, { key: string; label: string }[]> = {
  sitter: [
    { key: "great_with_pets", label: "Great with pets" },
    { key: "great_with_cats", label: "Great with cats" },
    { key: "great_with_dogs", label: "Great with dogs" },
    { key: "spotless_home", label: "Spotless home" },
    { key: "daily_photos", label: "Daily photo updates" },
    { key: "great_communicator", label: "Great communicator" },
    { key: "calm_reliable", label: "Calm and reliable" },
    { key: "extra_mile", label: "Went the extra mile" },
  ],
  owner: [
    { key: "home_like_photos", label: "Home like the photos" },
    { key: "helpful_guide", label: "Helpful Welcome Guide" },
    { key: "sweet_pets", label: "Sweet pets" },
    { key: "warm_welcome", label: "Warm welcome" },
    { key: "clear_instructions", label: "Clear instructions" },
    { key: "great_location", label: "Great location" },
    { key: "spotless_home", label: "Spotless home" },
    { key: "good_wifi", label: "Good Wi-Fi for work" },
  ],
};

export const highlightLabel = (side: ReviewSide, key: string) =>
  HIGHLIGHTS[side].find((h) => h.key === key)?.label ?? null;

export const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

const PET_WORDS: Record<string, [string, string]> = {
  dogs: ["dog", "dogs"],
  cats: ["cat", "cats"],
  birds: ["bird", "birds"],
  fish: ["fish", "fish"],
  rabbits: ["rabbit", "rabbits"],
  reptiles: ["reptile", "reptiles"],
  exotics: ["exotic pet", "exotic pets"],
  farm: ["farm animal", "farm animals"],
};

/** "2 cats", "1 dog and 1 cat", "2 dogs, 1 cat and 1 rabbit". Never names. */
export const petsSummary = (pets: Record<string, number> | null | undefined) => {
  if (!pets) return null;
  const order = Object.keys(PET_WORDS);
  const counts = new Map<string, number>();
  for (const [type, n] of Object.entries(pets)) {
    const key = canonicalPetType(type);
    if (n > 0) counts.set(key, (counts.get(key) ?? 0) + n);
  }
  const parts = [...counts.entries()]
    .sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    })
    .map(([key, n]) => {
      const [one, many] = PET_WORDS[key] ?? (n === 1 ? ["pet", "pets"] : ["pet", "pets"]);
      return `${n} ${n === 1 ? one : many}`;
    });
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

export const monthYear = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : null;

export const dayMonth = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

// ── Data ─────────────────────────────────────────────────────────────────

export interface MemberRating {
  average: number | null;
  count: number;
  categories: Partial<Record<CategoryKey, number>>;
}

/** The one rating, for many members (cards). Signed-out visitors may call it. */
export const fetchMemberRatings = async (userIds: string[], side: ReviewSide) => {
  const map = new Map<string, MemberRating>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const { data, error } = await supabase.rpc("member_ratings", { p_user_ids: ids, p_side: side });
  if (error) throw error;
  for (const r of data ?? []) {
    map.set(r.user_id, {
      average: r.average == null ? null : Number(r.average),
      count: r.review_count ?? 0,
      categories: (r.categories ?? {}) as MemberRating["categories"],
    });
  }
  return map;
};

/** The one rating for one member, as shown on their profile. */
export const useMemberRating = (userId: string | undefined, side: ReviewSide) =>
  useQuery({
    queryKey: ["member-rating", userId, side],
    queryFn: async () => (await fetchMemberRatings([userId!], side)).get(userId!) ?? { average: null, count: 0, categories: {} },
    enabled: !!userId,
  });

export interface ReviewSummary {
  average: number | null;
  count: number;
  categories: Partial<Record<CategoryKey, number>>;
  would_again_pct: number | null;
  would_again_answers: number;
  highlights: { key: string; n: number }[];
  ai_summary: string | null;
  ai_review_count: number | null;
}

export const useMemberReviewSummary = (userId: string | undefined, side: ReviewSide, enabled = true) =>
  useQuery({
    queryKey: ["member-review-summary", userId, side],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_member_review_summary", { p_user: userId!, p_side: side });
      if (error) throw error;
      return (data ?? null) as unknown as ReviewSummary | null;
    },
    enabled: !!userId && enabled,
  });

export type ReviewFilter = "all" | "5" | "4" | "3" | "written";
export type ReviewSort = "recent" | "relevant";

export interface MemberReview {
  id: string;
  created_at: string;
  score: number;
  rating: number;
  categories: Partial<Record<CategoryKey, number>>;
  text: string | null;
  would_again: boolean | null;
  highlights: string[];
  reviewer_first_name: string | null;
  reviewer_avatar_url: string | null;
  reviewer_gone: boolean;
  link_listing_id: string | null;
  link_profile_id: string | null;
  city: string | null;
  country: string | null;
  sit_month: string | null;
  nights: number | null;
  pets: Record<string, number> | null;
  sits_together: number;
  reply_body: string | null;
  reply_at: string | null;
  can_reply: boolean;
  total_count: number;
}

export const PAGE_SIZE = 10;

export const useMemberReviews = (
  userId: string | undefined,
  side: ReviewSide,
  filter: ReviewFilter,
  sort: ReviewSort,
  enabled = true,
) =>
  useInfiniteQuery({
    queryKey: ["member-reviews", userId, side, filter, sort],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("get_member_reviews", {
        p_user: userId!,
        p_side: side,
        p_filter: filter,
        p_sort: sort,
        p_limit: PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return (data ?? []) as unknown as MemberReview[];
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.length, 0);
      const total = last[0]?.total_count ?? 0;
      return last.length === PAGE_SIZE && loaded < total ? loaded : undefined;
    },
    enabled: !!userId && enabled,
  });

export interface WaitingReview {
  sit_id: string;
  reviewer_first_name: string;
  other_user_id: string;
  my_role: ReviewSide;
  side: ReviewSide;
  publish_by: string;
}

/** Reviews about me waiting for mine ("Reviews about you"). */
export const useMyWaitingReviews = (enabled: boolean) =>
  useQuery({
    queryKey: ["my-waiting-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_waiting_reviews");
      if (error) throw error;
      return (data ?? []) as unknown as WaitingReview[];
    },
    enabled,
  });

/** Report a review. */
export const REVIEW_REPORT_REASONS = [
  { value: "false_or_misleading", label: "It’s false or misleading" },
  { value: "rude_or_hateful", label: "It’s rude or hateful" },
  { value: "private_details", label: "It shares private details" },
  { value: "not_about_this_sit", label: "It’s not about this sit" },
  { value: "other", label: "Something else" },
];
