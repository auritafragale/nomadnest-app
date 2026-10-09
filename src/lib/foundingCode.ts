import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type RedeemResult = "ok" | "invalid" | "exhausted" | "already";

/**
 * Redeem a founding invite code (server-side, redeem-founding-code). Any paid
 * plan is cancelled and what is left of it refunded.
 */
export const redeemFoundingCode = async (
  code: string,
): Promise<{ result: RedeemResult; refundedPence: number | null; refundPending: boolean }> => {
  const trimmed = code.trim();
  if (!trimmed) return { result: "invalid", refundedPence: null, refundPending: false };
  const { data, error } = await supabase.functions.invoke<{ result?: RedeemResult; refunded_pence?: number | null; refund_pending?: boolean }>(
    "redeem-founding-code",
    { body: { code: trimmed } },
  );
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(detail?.error || "We couldn't redeem that code just now. Please try again.");
  }
  return {
    result: (data?.result ?? "invalid") as RedeemResult,
    refundedPence: data?.refunded_pence ?? null,
    refundPending: !!data?.refund_pending,
  };
};

export const REDEEM_MESSAGES: Record<Exclude<RedeemResult, "ok">, string> = {
  invalid: "That code wasn't recognised. Please check it and try again.",
  exhausted: "That code has been used up, or all 1,000 founding places are taken.",
  already: "You're already a Founding member.",
};
