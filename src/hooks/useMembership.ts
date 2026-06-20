import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MembershipState {
  subscribed: boolean;
  membershipType: string | null;
  foundingMember: boolean;
  subscriptionEnd: string | null;
  loading: boolean;
}

export const MEMBERSHIP_PLANS = {
  sitter: {
    name: "Nomad Membership",
    priceId: "price_1TKzGAApcivkCqDvGN2hZMoD",
    productId: "prod_UJcVggxhZfowro",
    price: "£59",
    interval: "year",
    features: [
      "Unlimited sit applications",
      "Profile with reviews",
      "Find Nomads map",
      "Community access",
      "No booking fees ever",
    ],
  },
  owner: {
    name: "Pet Parent Membership",
    priceId: "price_1TKzGJApcivkCqDvptMAEF1E",
    productId: "prod_UJcVTj7SmQp8V8",
    price: "£59",
    interval: "year",
    features: [
      "Unlimited listing posts",
      "Manage applications",
      "Map listing visibility",
      "Community access",
      "No booking fees ever",
    ],
  },
  combined: {
    name: "Combined Membership",
    priceId: "price_1TKzGLApcivkCqDvVFHc8ZH7",
    productId: "prod_UJcVUVxwZ9yA2F",
    price: "£99",
    interval: "year",
    features: [
      "Everything in Nomad plan",
      "Everything in Pet Parent plan",
      "Best value",
      "No booking fees ever",
    ],
  },
} as const;

export const useMembership = () => {
  const { user } = useAuth();
  const [state, setState] = useState<MembershipState>({
    subscribed: false,
    membershipType: null,
    foundingMember: false,
    subscriptionEnd: null,
    loading: true,
  });

  const checkSubscription = useCallback(async () => {
    if (!user) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;

      setState({
        subscribed: data.subscribed ?? false,
        membershipType: data.membership_type ?? null,
        foundingMember: data.founding_member ?? false,
        subscriptionEnd: data.subscription_end ?? null,
        loading: false,
      });
    } catch {
      // Fallback: check profile directly
      const { data: profile } = await supabase
        .from("profiles")
        .select("founding_member, membership_status, membership_type")
        .eq("id", user.id)
        .single();

      setState({
        subscribed: profile?.membership_status === "active" || profile?.founding_member === true,
        membershipType: profile?.membership_type ?? null,
        foundingMember: profile?.founding_member ?? false,
        subscriptionEnd: null,
        loading: false,
      });
    }
  }, [user]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  const startCheckout = async (priceId: string) => {
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { priceId },
    });
    if (error) throw error;
    if (data?.url) {
      window.open(data.url, "_blank");
    }
  };

  const openPortal = async () => {
    const { data, error } = await supabase.functions.invoke("customer-portal");
    if (error) throw error;
    if (data?.url) {
      window.open(data.url, "_blank");
    }
  };

  const redeemFoundingMemberCode = async (
    code: string
  ): Promise<"ok" | "invalid" | "exhausted"> => {
    if (!user) throw new Error("You must be signed in to redeem a code.");
    const trimmed = code.trim();
    if (!trimmed) return "invalid";

    const { data, error } = await supabase.rpc("redeem_founding_member_code", {
      p_code: trimmed,
      p_user_id: user.id,
    });
    if (error) throw error;

    const result = (data as string) ?? "invalid";
    if (result === "ok") await checkSubscription();
    return result as "ok" | "invalid" | "exhausted";
  };

  const hasAccess = (requiredType: "sitter" | "owner") => {
    if (state.foundingMember) return true;
    if (!state.subscribed) return false;
    if (state.membershipType === "combined") return true;
    return state.membershipType === requiredType;
  };

  return {
    ...state,
    checkSubscription,
    startCheckout,
    openPortal,
    joinAsFoundingMember,
    hasAccess,
  };
};
