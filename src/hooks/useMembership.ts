import { useState, useEffect, useCallback } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { redeemFoundingCode } from "@/lib/foundingCode";

export type PlanId = "sitter" | "owner" | "combined";

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
    checkSubscription();
  }, [checkSubscription]);

  /**
   * Start or change a plan. A new membership opens Stripe Checkout in this
   * tab. A member moving up is changed on the same subscription (credit for
   * what's left); moving down or across happens at renewal.
   */
  const startCheckout = async (plan: PlanId): Promise<{ kind: "redirect" } | { kind: "updated" } | { kind: "scheduled"; effective: string | null }> => {
    const { data, error } = await supabase.functions.invoke("create-checkout", { body: { plan } });
    if (error) throw await readError(error, "We couldn't open the payment page just now. Please try again.");
    if (data?.url) {
      window.location.assign(data.url);
      return { kind: "redirect" };
    }
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
    if (state.foundingMember) return true;
    if (!state.subscribed) return false;
    if (state.membershipType === "combined") return true;
    return state.membershipType === requiredType;
  };

  return { ...state, checkSubscription, startCheckout, openPortal, redeemFoundingMemberCode, hasAccess };
};
