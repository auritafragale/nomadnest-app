import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { nnButton } from "@/components/nn/ui";
import { useSideAccess } from "@/hooks/useSideAccess";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : null);

/** Opens the Stripe page for updating the card (same tab). */
export const useUpdateCard = () => {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal", { body: { flow: "update_card" } });
      if (error || !data?.url) throw new Error("We couldn't open billing just now. Please try again.");
      window.location.assign(data.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't open billing just now.");
      setBusy(false);
    }
  };
  return { open, busy };
};

/**
 * Why a member can't do something, and what to do, in plain words:
 * - the retry week after a failed payment (Update my card), and
 * - a Pet Parent whose membership ended while they have a published listing
 *   (Renew). Nothing shows when everything is fine.
 */
const MembershipNotice = ({ hasPublishedListing = false, className }: { hasPublishedListing?: boolean; className?: string }) => {
  const { data: access } = useSideAccess();
  const card = useUpdateCard();
  if (!access) return null;

  if (access.pastDue) {
    return (
      <section role="alert" className={cn("flex flex-col gap-3 rounded-[20px] border-[1.5px] border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] p-4 text-[var(--nn-tip-text)] sm:flex-row sm:items-center sm:justify-between", className)}>
        <p className="text-[15px]">
          <strong>Your last payment didn't go through.</strong> Please update your card by {fmt(access.retryUntil) ?? "the end of this week"} to keep your membership.
        </p>
        <button type="button" onClick={card.open} disabled={card.busy} className={nnButton("primary", "shrink-0")}>
          {card.busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Update my card
        </button>
      </section>
    );
  }

  if (hasPublishedListing && !access.owner) {
    return (
      <section role="status" className={cn("flex flex-col gap-3 rounded-[20px] border-[1.5px] border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] p-4 text-[var(--nn-tip-text)] sm:flex-row sm:items-center sm:justify-between", className)}>
        <p className="text-[15px]">
          <strong>Your Pet Parent membership has ended.</strong> Your listing is hidden until you renew. Confirmed sits go ahead as planned.
        </p>
        <Link to="/membership" className={nnButton("primary", "shrink-0")}>
          Renew
        </Link>
      </section>
    );
  }

  return null;
};

export default MembershipNotice;
