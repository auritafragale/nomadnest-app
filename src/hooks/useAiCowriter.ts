import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export const AI_COWRITER_DAILY_LIMIT = 10;
export const AI_COWRITER_NOTE_MAX_LENGTH = 300;
const FEATURE = "draft_application";

const FRIENDLY_ERROR =
  "Sorry, we couldn't draft your application right now. Please try again in a moment, or write it yourself.";
export const AI_COWRITER_TIMEOUT_ERROR =
  "The AI is taking longer than usual. Please try again in a moment.";
// Slightly longer than the edge function's 45s Anthropic timeout, so the
// server's own friendly timeout normally arrives first; this is the backstop
// that guarantees the spinner can never run forever.
const CLIENT_TIMEOUT_MS = 50_000;

export class AiCowriterError extends Error {
  constructor(
    message: string,
    public status: number | null,
  ) {
    super(message);
  }
}

interface DraftApplicationResponse {
  draft?: string;
  remaining?: number;
}

export interface DraftApplicationInput {
  listingId: string;
  sitDateIds?: string[];
  note?: string;
}

/**
 * AI Application Co-Writer: visibility (feature flag, or admin while the flag
 * is off — the edge function enforces the same rule), drafts left today, and
 * the draft call itself. Only ever returns text; never submits anything.
 */
export const useAiCowriter = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const queryClient = useQueryClient();

  const { data: flagEnabled = false } = useQuery({
    queryKey: ["app-setting", "ai_cowriter_enabled"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "ai_cowriter_enabled")
        .maybeSingle();
      return data?.value === true;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const visible = !!user && (flagEnabled || isAdmin === true);
  const remainingKey = ["ai-cowriter-remaining", user?.id];

  const { data: remaining } = useQuery({
    queryKey: remainingKey,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .eq("feature", FEATURE)
        .gte("created_at", since);
      if (error) return null;
      return Math.max(0, AI_COWRITER_DAILY_LIMIT - (count ?? 0));
    },
    enabled: visible,
  });

  const draft = useMutation({
    mutationFn: async ({ listingId, sitDateIds, note }: DraftApplicationInput) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
      let result: Awaited<ReturnType<typeof supabase.functions.invoke<DraftApplicationResponse>>>;
      try {
        result = await supabase.functions.invoke<DraftApplicationResponse>("draft-application", {
          body: {
            listing_id: listingId,
            sit_date_ids: sitDateIds && sitDateIds.length > 0 ? sitDateIds : undefined,
            note: note?.trim() || undefined,
          },
          signal: controller.signal,
        });
      } catch {
        throw new AiCowriterError(
          controller.signal.aborted ? AI_COWRITER_TIMEOUT_ERROR : FRIENDLY_ERROR,
          controller.signal.aborted ? 504 : null,
        );
      } finally {
        clearTimeout(timer);
      }

      const { data, error } = result;
      if (controller.signal.aborted) {
        throw new AiCowriterError(AI_COWRITER_TIMEOUT_ERROR, 504);
      }

      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null);
          if (typeof body?.remaining === "number") {
            queryClient.setQueryData(remainingKey, body.remaining);
          }
          const status = error.context.status ?? null;
          throw new AiCowriterError(
            body?.error || (status === 504 ? AI_COWRITER_TIMEOUT_ERROR : FRIENDLY_ERROR),
            status,
          );
        }
        throw new AiCowriterError(FRIENDLY_ERROR, null);
      }

      if (!data?.draft || typeof data.draft !== "string") {
        throw new AiCowriterError(FRIENDLY_ERROR, null);
      }
      return { draft: data.draft as string, remaining: data.remaining as number };
    },
    onSuccess: ({ remaining: left }) => {
      if (typeof left === "number") queryClient.setQueryData(remainingKey, left);
    },
  });

  return { visible, remaining: remaining ?? null, draft };
};
