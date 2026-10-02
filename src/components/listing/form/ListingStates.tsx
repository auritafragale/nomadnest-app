import { Link } from "react-router-dom";
import { Check, Home, ShieldCheck, Star } from "lucide-react";
import { NN_PAGE, nnButton } from "@/components/nn/ui";
import { cn } from "@/lib/utils";

export type ListingState = "live" | "membership" | "id" | "limit";

const COPY: Record<ListingState, { title: string; body: string; main: [string, string]; second: [string, string] }> = {
  live: {
    title: "Your listing is live",
    body: "Next, set up your Welcome Guide. It takes about 10 minutes and means fewer messages while you are away.",
    main: ["Set up my Welcome Guide", ""],
    second: ["Maybe later", "/dashboard"],
  },
  membership: {
    title: "Become a Pet Parent member to list your home",
    body: "£59 a year, or £99 to be a Pet Parent and a Nomad. Founding members are already in.",
    main: ["See membership", "/membership"],
    second: ["Back to dashboard", "/dashboard"],
  },
  id: {
    title: "Verify your ID to list your home",
    body: "It takes about 5 minutes. Your documents are only used to check it is you, and nobody else ever sees them.",
    main: ["Verify my identity", "/verify-identity"],
    second: ["Back to dashboard", "/dashboard"],
  },
  limit: {
    title: "You already have a listing",
    body: "Your membership includes one home. You can add new dates to it any time, or contact us if you need to list another home.",
    main: ["Add new dates", "/dashboard"],
    second: ["Contact us", "/contact"],
  },
};

/** Before and after the form (design: ListingStatesPhone). */
const ListingStates = ({
  state,
  listingId,
  preview,
}: {
  state: ListingState;
  /** Live: the new listing, for the Welcome Guide and the preview link. */
  listingId?: string;
  preview?: { title: string; line: string; photo?: string | null };
}) => {
  const c = COPY[state];
  const Icon = state === "live" ? Check : state === "membership" ? Star : state === "id" ? ShieldCheck : Home;
  const mainTo = state === "live" ? `/listing/${listingId}/welcome-guide` : c.main[1];
  return (
    <main className={cn(NN_PAGE, "flex flex-1 flex-col items-center pb-16 pt-24")}>
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <span
          className={cn(
            "flex h-[76px] w-[76px] items-center justify-center rounded-full",
            state === "live" ? "bg-[var(--nn-ok-bg)] text-brand-teal-text" : "bg-muted text-foreground",
          )}
        >
          <Icon className="h-9 w-9" aria-hidden="true" />
        </span>
        <h1 className="font-display text-[30px] font-normal leading-tight">{c.title}</h1>
        <p className="text-[16px] text-muted-foreground">{c.body}</p>
        {state === "live" && preview && listingId && (
          <div className="flex w-full items-center gap-3 rounded-[20px] border border-[var(--nn-border)] bg-card p-3 text-left">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#CDB79E]">
              {preview.photo ? <img src={preview.photo} alt="" className="h-full w-full object-cover" /> : <Home className="h-7 w-7 text-[#8A7660]" aria-hidden="true" />}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-bold">{preview.title}</span>
              <span className="text-sm text-muted-foreground">{preview.line}</span>
              <Link to={`/listing/${listingId}`} className="min-h-11 py-2 text-sm font-bold text-[var(--nn-accent-dark)] underline underline-offset-2">
                See how Nomads see it
              </Link>
            </span>
          </div>
        )}
        <Link to={mainTo} className={nnButton("primary", "h-12 w-full")}>
          {c.main[0]}
        </Link>
        <Link to={c.second[1]} className={nnButton("secondary", "h-12 w-full")}>
          {c.second[0]}
        </Link>
      </div>
    </main>
  );
};

export default ListingStates;
