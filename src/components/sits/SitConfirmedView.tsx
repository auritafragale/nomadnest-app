import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { nnButton } from "@/components/nn/ui";
import { TripPass, CommissionLine } from "@/components/perks/Placements";
import { petNamesSentence } from "@/lib/perkPlacements";
import { resolveListingConversation } from "@/lib/conversations";
import type { SitUpdateContext } from "@/hooks/useDailyUpdates";

/**
 * "Sit confirmed" (design: PerksSitConfirmedPhone). The Nomad sees it once
 * per sit on this device, the first time they open the sit after it is
 * confirmed. The Trip pass shows for members only.
 */
export const SitConfirmedView = ({
  context,
  city,
  country,
  onDone,
}: {
  context: SitUpdateContext;
  city: string | null;
  country: string | null;
  onDone: () => void;
}) => {
  const navigate = useNavigate();
  const pets = petNamesSentence(context.pets.map((p) => p.name));
  const where = city || country;
  const dates = `${format(parseISO(context.start_date), "EEE d")} to ${format(parseISO(context.end_date), "EEE d MMM")}`;
  const owner = context.owner.first_name || "your Pet Parent";

  const message = async () => {
    onDone();
    try {
      const id = context.owner_user_id && context.sitter_user_id
        ? await resolveListingConversation({ listingId: context.listing_id, ownerUserId: context.owner_user_id, sitterUserId: context.sitter_user_id })
        : null;
      navigate(id ? `/inbox?conversation=${id}` : "/inbox");
    } catch {
      navigate("/inbox");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div className="flex justify-end">
        <button type="button" aria-label="Close" onClick={onDone} className="flex h-11 w-11 items-center justify-center rounded-full">
          <X className="h-[22px] w-[22px]" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--brand-teal))] text-primary-foreground">
          <Check className="h-8 w-8" strokeWidth={3} aria-hidden="true" />
        </span>
        <h1 className="font-display text-[34px] font-normal leading-tight">Sit confirmed</h1>
        <p className="text-[16px] leading-normal text-muted-foreground">
          You’re looking after {pets || "the pets"}
          {where ? ` in ${where}` : ""}, {dates}.
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        <button type="button" onClick={onDone} className={nnButton("primary", "h-[52px] rounded-[14px] text-[15px]")}>
          See your sit
        </button>
        <button type="button" onClick={message} className={nnButton("secondary", "h-[52px] rounded-[14px] text-[15px]")}>
          Message {owner}
        </button>
      </div>
      <TripPass
        sitId={context.sit_id}
        city={city}
        country={country}
        startDate={context.start_date}
        endDate={context.end_date}
        today={context.today}
        petNames={context.pets.map((p) => p.name)}
        placement="sit_confirmed"
      />
      <CommissionLine />
    </div>
  );
};
