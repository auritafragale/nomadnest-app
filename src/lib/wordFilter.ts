import { supabase } from "@/integrations/supabase/client";

/**
 * The word filter runs in the database (Batch E1). These are the messages the
 * app shows for its two error codes. They never repeat the word itself, and
 * the text the member typed stays in the box.
 */
export const WORD_FILTER_BANNED =
  "Message not sent. It has words that aren't allowed on NomadNest, such as slurs, sexual words or threats. Please change it and try again.";
export const WORD_FILTER_SWEAR =
  "Not saved. Please remove the swear words. They aren't allowed in reviews, profiles, listings or City Chats.";

/** The swearing note in a private chat (only the sender sees it). */
export const SWEAR_NOTE_TITLE = "Keep it friendly";
export const SWEAR_NOTE_TEXT =
  "Your message was sent, but please avoid swearing. It isn't allowed in reviews, profiles, listings or City Chats. Only you see this note.";

type MaybeDbError = { hint?: string | null; message?: string | null } | null | undefined;

export const wordFilterKind = (error: unknown): "banned" | "swear" | null => {
  const e = error as MaybeDbError;
  const hint = e?.hint ?? "";
  const message = e?.message ?? "";
  if (hint === "word_filter_banned" || message.startsWith("Message not sent. It has words")) return "banned";
  if (hint === "word_filter_swear" || message.startsWith("Not saved. Please remove the swear words")) return "swear";
  return null;
};

/** The plain-words message for a word-filter error, or null for any other error. */
export const wordFilterMessage = (error: unknown): string | null => {
  const kind = wordFilterKind(error);
  return kind === "banned" ? WORD_FILTER_BANNED : kind === "swear" ? WORD_FILTER_SWEAR : null;
};

/** After a private chat message was sent: did it have swearing in it? */
export const hasSwearing = async (text: string) => {
  if (!text.trim()) return false;
  const { data } = await supabase.rpc("text_has_swearing", { p_text: text });
  return data === true;
};
