import { supabase } from "@/integrations/supabase/client";

/**
 * Canonical chat-thread resolution.
 *
 * A chat thread has exactly one identity:
 *  - Home chats: the home (`listing_id`) + the two members, with the home's Pet
 *    Parent always stored on `owner_user_id` and the Nomad on `sitter_user_id`.
 *  - Person-to-person chats: one thread per unordered pair, `listing_id = null`.
 *
 * Every screen must go through these helpers so no path can create a second or
 * role-swapped copy of a thread (which used to split messages between the two
 * members, and could deep-link a Nomad into the chat for the wrong home).
 * Matching database unique indexes enforce the same rule server-side.
 */

const findPairConversation = async (
  userA: string,
  userB: string,
  listingId: string | null,
): Promise<string | null> => {
  let query = supabase
    .from("conversations")
    .select("id, owner_user_id, sitter_user_id")
    .or(
      `and(owner_user_id.eq.${userA},sitter_user_id.eq.${userB}),` +
        `and(owner_user_id.eq.${userB},sitter_user_id.eq.${userA})`,
    );

  query = listingId ? query.eq("listing_id", listingId) : query.is("listing_id", null);

  const { data } = await query.order("created_at", { ascending: true }).limit(1);
  return data?.[0]?.id ?? null;
};

export const findExistingPairConversation = async (
  ownerUserId: string,
  sitterUserId: string,
): Promise<string | null> => {
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .or(
      `and(owner_user_id.eq.${ownerUserId},sitter_user_id.eq.${sitterUserId}),` +
        `and(owner_user_id.eq.${sitterUserId},sitter_user_id.eq.${ownerUserId})`,
    )
    .order("updated_at", { ascending: false })
    .limit(1);

  return data?.[0]?.id ?? null;
};

/**
 * Find (or create) the single chat thread for a sit / home.
 * `ownerUserId` MUST be the home's Pet Parent and `sitterUserId` the Nomad.
 */
export const resolveListingConversation = async ({
  listingId,
  ownerUserId,
  sitterUserId,
}: {
  listingId: string | null;
  ownerUserId: string;
  sitterUserId: string;
}): Promise<string | null> => {
  const existing = await findPairConversation(ownerUserId, sitterUserId, listingId);
  if (existing) return existing;

  const { data: created } = await supabase
    .from("conversations")
    .insert({
      owner_user_id: ownerUserId,
      sitter_user_id: sitterUserId,
      listing_id: listingId,
      conversation_type: listingId ? "listing" : "direct",
    })
    .select("id")
    .maybeSingle();

  if (created?.id) return created.id;

  // Lost a race (or the unique index rejected a duplicate) — re-read.
  return findPairConversation(ownerUserId, sitterUserId, listingId);
};

/**
 * Find (or create) the single person-to-person thread between two members.
 * `ownerUserId` is only used for the orientation of a brand-new row.
 */
export const resolveDirectConversation = async ({
  ownerUserId,
  sitterUserId,
}: {
  ownerUserId: string;
  sitterUserId: string;
}): Promise<string | null> =>
  resolveListingConversation({ listingId: null, ownerUserId, sitterUserId });
