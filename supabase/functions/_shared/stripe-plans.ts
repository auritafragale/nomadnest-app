import Stripe from "https://esm.sh/stripe@18.5.0";
// deno-lint-ignore no-explicit-any
type Supa = any;

// The three yearly plans. Price ids come from secrets when set
// (STRIPE_PRICE_NOMAD, STRIPE_PRICE_PARENT, STRIPE_PRICE_COMBINED), else
// the ids the app has always used. create-checkout accepts only these.
export type Plan = "sitter" | "owner" | "combined";

const env = (k: string) => (Deno.env.get(k) ?? "").trim();

export const PLANS: Record<Plan, { price: string; product: string; name: string }> = {
  sitter: { price: env("STRIPE_PRICE_NOMAD") || "price_1TKzGAApcivkCqDvGN2hZMoD", product: "prod_UJcVggxhZfowro", name: "Nomad Membership" },
  owner: { price: env("STRIPE_PRICE_PARENT") || "price_1TKzGJApcivkCqDvptMAEF1E", product: "prod_UJcVTj7SmQp8V8", name: "Pet Parent Membership" },
  combined: { price: env("STRIPE_PRICE_COMBINED") || "price_1TKzGLApcivkCqDvVFHc8ZH7", product: "prod_UJcVUVxwZ9yA2F", name: "Combined Membership" },
};

export const isPlan = (v: unknown): v is Plan => v === "sitter" || v === "owner" || v === "combined";

/** The plan for a subscription item's price (or its product), or null. */
export const planOf = (price: Stripe.Price | null | undefined): Plan | null => {
  if (!price) return null;
  const product = typeof price.product === "string" ? price.product : price.product?.id;
  for (const [plan, p] of Object.entries(PLANS) as [Plan, (typeof PLANS)[Plan]][]) {
    if (price.id === p.price || product === p.product) return plan;
  }
  return null;
};

export const planForPrice = (priceId: string): Plan | null =>
  (Object.entries(PLANS) as [Plan, (typeof PLANS)[Plan]][]).find(([, p]) => p.price === priceId)?.[0] ?? null;

/** Combined is the upgrade; Nomad and Pet Parent are equal. */
export const planRank = (p: Plan) => (p === "combined" ? 2 : 1);

export const LIVE = new Set(["active", "trialing", "past_due", "unpaid"]);

export const periodEndOf = (sub: Stripe.Subscription): string | null => {
  // In API version 2025-08-27.basil the period lives on the item.
  const end =
    (sub.items.data[0] as { current_period_end?: number } | undefined)?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof end === "number" && Number.isFinite(end) ? new Date(end * 1000).toISOString() : null;
};

/** The member a subscription belongs to: its metadata, then the customer id, then the email. */
export const findMember = async (
  supabase: Supa,
  stripe: Stripe,
  sub: { metadata?: Stripe.Metadata | null; customer: string | Stripe.Customer | Stripe.DeletedCustomer },
): Promise<{ id: string; email: string | null; founding_member: boolean; membership_status: string | null; stripe_subscription_id: string | null } | null> => {
  const cols = "id, email, founding_member, membership_status, stripe_subscription_id";
  const metaId = sub.metadata?.user_id;
  if (metaId) {
    const { data } = await supabase.from("profiles").select(cols).eq("id", metaId).maybeSingle();
    if (data) return data;
  }
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (customerId) {
    const { data } = await supabase.from("profiles").select(cols).eq("stripe_customer_id", customerId).maybeSingle();
    if (data) return data;
    const customer = await stripe.customers.retrieve(customerId);
    const email = !customer.deleted ? (customer as Stripe.Customer).email : null;
    if (email) {
      const { data: byEmail } = await supabase.from("profiles").select(cols).eq("email", email).maybeSingle();
      if (byEmail) return byEmail;
    }
  }
  return null;
};

/**
 * Writes a subscription's state onto the member's profile (service role).
 * Roles follow automatically (roles_follow_plan trigger). Founding members
 * keep Combined for life whatever happens to an old subscription.
 */
export const syncSubscription = async (supabase: Supa, memberId: string, sub: Stripe.Subscription, founding: boolean) => {
  if (founding) return { status: "active", plan: "combined" as Plan };
  const plan = planOf(sub.items.data[0]?.price);
  const status =
    sub.status === "active" || sub.status === "trialing"
      ? "active"
      : sub.status === "past_due" || sub.status === "unpaid"
        ? "past_due"
        : sub.status === "incomplete"
          ? null // not paid yet: change nothing
          : "none";
  if (status === null) return { status: null, plan };
  const live = status === "active" || status === "past_due";
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  await supabase
    .from("profiles")
    .update({
      membership_status: live ? status : "none",
      membership_type: live ? plan ?? "sitter" : null,
      membership_expiry: live ? periodEndOf(sub) : null,
      membership_cancel_at_period_end: live ? !!sub.cancel_at_period_end : false,
      ...(status === "active" ? { membership_payment_failed_at: null } : {}),
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: live ? sub.id : null,
    })
    .eq("id", memberId);
  return { status: live ? status : "none", plan };
};

/** The member's live subscription, if any (newest first). */
export const liveSubscription = async (stripe: Stripe, customerId: string): Promise<Stripe.Subscription | null> => {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  return (subs.data as Stripe.Subscription[]).filter((s: Stripe.Subscription) => LIVE.has(s.status)).sort((a: Stripe.Subscription, b: Stripe.Subscription) => b.created - a.created)[0] ?? null;
};

/** The member's Stripe customer id: saved on the profile, else found by email. */
export const customerIdFor = async (supabase: Supa, stripe: Stripe, userId: string, email: string): Promise<string | null> => {
  const { data } = await supabase.from("profiles").select("stripe_customer_id").eq("id", userId).maybeSingle();
  if (data?.stripe_customer_id) return data.stripe_customer_id as string;
  const customers = await stripe.customers.list({ email, limit: 1 });
  return customers.data[0]?.id ?? null;
};

/** Only our own pages, so a forged Origin can't send members elsewhere. */
export const appOrigin = (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const allowed =
    /^https:\/\/([a-z0-9-]+\.)*nomadnest\.global$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin);
  return allowed ? origin : "https://nomadnest.global";
};
