import { useState, useEffect, useCallback } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { redeemFoundingCode } from "@/lib/foundingCode";
import { useSideAccess } from "@/hooks/useSideAccess";

export type PlanId = "sitter" | "owner" | "combined";

export type PlanPreview =
  | { preview: "upgrade"; plan: PlanId; amount_due: number; currency: string; yearly_amount: number | null; renewal: string | null; proration_date: number }
  | { preview: "scheduled"; plan: PlanId; effective: string | null }
  | { preview: "keep"; plan: PlanId; renewal: string | null }
  | { preview: "checkout"; plan: PlanId };

export interface MembershipState {
  subscribed: boolean;
  /** active | past_due | none */
  status: "active" | "past_due" | "none";
  membershipType: PlanId | null;
  foundingMember: boolean;
  /** Renewal date, or the end date when cancelAtPeriodEnd. */
  subscriptionEnd: string | null;
  cancelAtPeriodEnd: boolean;
  paymentFailedAt: string | null;
  /** A move down or across booked for the renewal date. */
  pendingPlan: PlanId | null;
  cardBrand: string | null;
  cardLast4: string | null;
  loading: boolean;
}

/** The three yearly plans (the server decides the Stripe prices). */
export const MEMBERSHIP_PLANS = {
  sitter: {
    name: "Nomad Membership",
    short: "Nomad",
    who: "For house sitters",
    price: "£59",
    interval: "year",
    features: ["Apply to unlimited sits worldwide", "Profile with ID check and reviews", "Nomads Near Me and City Chats", "Member perks"],
  },
  owner: {
    name: "Pet Parent Membership",
    short: "Pet Parent",
    who: "For homeowners with pets",
    price: "£59",
    interval: "year",
    features: ["List your home, add dates any time", "Applicants, invites and AI best match", "Welcome Guide and daily updates", "Member perks"],
  },
  combined: {
    name: "Combined Membership",
    short: "Combined",
    who: "Sit and be sat",
    price: "£99",
    interval: "year",
    features: ["Everything in Nomad and Pet Parent", "Switch between modes in one tap", "One renewal date", "Member perks"],
  },
} as const;

const EMPTY: MembershipState = {
  subscribed: false,
  status: "none",
  membershipType: null,
  foundingMember: false,
  subscriptionEnd: null,
  cancelAtPeriodEnd: false,
  paymentFailedAt: null,
  pendingPlan: null,
  cardBrand: null,
  cardLast4: null,
  loading: true,
};

const readError = async (error: unknown, fallback: string) => {
  const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
  return new Error(detail?.error || fallback);
};

export const useMembership = () => {
  const { user, session } = useAuth();
  const [state, setState] = useState<MembershipState>(EMPTY);
  // The server's rule (has_side_access): the same answer the database uses.
  const { data: side, refetch: refetchSide } = useSideAccess();

  const checkSubscription = useCallback(async () => {
    if (!user || !session?.access_token) {
      setState({ ...EMPTY, loading: false });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      setState({
        subscribed: data.subscribed ?? false,
        status: data.status === "past_due" ? "past_due" : data.subscribed ? "active" : "none",
        membershipType: data.membership_type ?? null,
        foundingMember: data.founding_member ?? false,
        subscriptionEnd: data.subscription_end ?? null,
        cancelAtPeriodEnd: !!data.cancel_at_period_end,
        paymentFailedAt: data.payment_failed_at ?? null,
        pendingPlan: data.pending_plan ?? null,
        cardBrand: data.card_brand ?? null,
        cardLast4: data.card_last4 ?? null,
        loading: false,
      });
    } catch {
      // Fallback: what the webhook last saved on the profile.
      const { data: rows } = await supabase.rpc("get_my_membership");
      const p = Array.isArray(rows) ? rows[0] : rows;
      const status = p?.membership_status === "past_due" ? "past_due" : p?.membership_status === "active" || p?.founding_member ? "active" : "none";
      setState({
        ...EMPTY,
        subscribed: status !== "none",
        status,
        membershipType: ((p?.founding_member ? "combined" : p?.membership_type) ?? null) as PlanId | null,
        foundingMember: p?.founding_member ?? false,
        subscriptionEnd: p?.founding_member ? null : p?.membership_expiry ?? null,
        cancelAtPeriodEnd: !!p?.cancel_at_period_end,
        paymentFailedAt: p?.payment_failed_at ?? null,
        loading: false,
      });
    }
  }, [user, session?.access_token]);

  useEffect(() => {
    checkSubscription().then(() => refetchSide());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkSubscription]);

  /**
   * What a plan change would do, from Stripe, without changing anything:
   * "upgrade" (the exact amount charged today), "scheduled" (a change at
   * renewal, nothing to pay), "keep" (undo an ending membership) or
   * "checkout" (a new membership: Stripe Checkout shows the amount).
   */
  const previewChange = async (plan: PlanId): Promise<PlanPreview> => {
    const { data, error } = await supabase.functions.invoke("create-checkout", { body: { plan, action: "preview" } });
    if (error) throw await readError(error, "We couldn't check the price just now. Please try again.");
    return data as PlanPreview;
  };

  /** A new membership: Stripe Checkout, in this tab. */
  const startCheckout = async (plan: PlanId) => {
    const { data, error } = await supabase.functions.invoke("create-checkout", { body: { plan, action: "checkout" } });
    if (error) throw await readError(error, "We couldn't open the payment page just now. Please try again.");
    if (data?.url) window.location.assign(data.url);
  };

  /** Change a live membership, only after the member confirmed the preview. */
  const confirmChange = async (plan: PlanId, prorationDate?: number): Promise<{ kind: "updated" } | { kind: "scheduled"; effective: string | null }> => {
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { plan, action: "change", ...(prorationDate ? { proration_date: prorationDate } : {}) },
    });
    if (error) throw await readError(error, "We couldn't change your plan just now. Please try again.");
    await checkSubscription();
    if (data?.scheduled) return { kind: "scheduled", effective: data.effective ?? null };
    return { kind: "updated" };
  };

  /** Stripe billing portal, in this tab. `updateCard` goes straight to the card. */
  const openPortal = async (updateCard = false) => {
    const { data, error } = await supabase.functions.invoke("customer-portal", { body: updateCard ? { flow: "update_card" } : {} });
    if (error) throw await readError(error, "We couldn't open billing just now. Please try again.");
    if (data?.url) window.location.assign(data.url);
  };

  const redeemFoundingMemberCode = async (code: string) => {
    const res = await redeemFoundingCode(code);
    if (res.result === "ok") await checkSubscription();
    return res;
  };

  const hasAccess = (requiredType: "sitter" | "owner") => {
    if (side) return requiredType === "sitter" ? side.sitter : side.owner;
    if (state.foundingMember) return true;
    if (!state.subscribed) return false;
    if (state.membershipType === "combined") return true;
    return state.membershipType === requiredType;
  };

  return { ...state, checkSubscription, previewChange, startCheckout, confirmChange, openPortal, redeemFoundingMemberCode, hasAccess };
};
