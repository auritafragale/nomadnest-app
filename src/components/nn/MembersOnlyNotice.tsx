import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { nnButton } from "@/components/nn/ui";
import { isStoreApp } from "@/lib/storeApp";

/**
 * Nomad profiles are members-only by design. Shown on Browse Nomads and a
 * Nomad's profile to signed-out visitors, and when a session has ended and
 * couldn't be refreshed. In the store apps there is no membership link (a
 * neutral message only).
 */
const MembersOnlyNotice = ({ headingLevel = "h1" }: { headingLevel?: "h1" | "h2" }) => {
  const store = isStoreApp();
  const Heading = headingLevel;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-[22px] border border-dashed border-border bg-card p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]">
        <Users className="h-6 w-6" aria-hidden="true" />
      </span>
      <Heading className="text-[20px] font-bold">Nomad profiles are for members</Heading>
      <p className="text-[15px] text-muted-foreground">
        {store
          ? "To keep everyone safe, only signed-in members can see Nomads. Sign in to continue."
          : "To keep everyone safe, only members can see Nomads. Sign in, or see what membership includes."}
      </p>
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Link to="/auth" className={nnButton("primary", "h-12 sm:min-w-[140px]")}>
          Sign in
        </Link>
        {!store && (
          <Link to="/membership" className={nnButton("secondary", "h-12 sm:min-w-[140px]")}>
            See membership
          </Link>
        )}
      </div>
    </div>
  );
};

export default MembersOnlyNotice;
