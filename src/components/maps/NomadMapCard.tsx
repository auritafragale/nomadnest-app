import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import type { SitterWithProfile } from "@/hooks/useSitters";
import { nnButton } from "@/components/nn/ui";
import { PetTypeChips } from "@/components/browse/SitCardParts";
import { cn } from "@/lib/utils";

/**
 * A Nomad on the map (design: NomadsMapPhone, NomadsMapDesktop): photo or
 * initial, first name, Founding star, rating, city, headline, the pets they
 * care for and View profile. First name only.
 */
const NomadMapCard = ({ sitter, selected, onPick }: { sitter: SitterWithProfile; selected: boolean; onPick: () => void }) => {
  const first = sitter.profile?.first_name || "Nomad";
  const place = [sitter.profile?.city, sitter.profile?.country].filter(Boolean).join(", ");
  const { average, count } = sitter.rating;
  return (
    <article
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("a,button")) onPick();
      }}
      className={cn(
        "flex h-full w-full flex-col gap-[9px] rounded-[20px] bg-card p-3.5 shadow-float",
        selected ? "border-2 border-brand-coral" : "border border-border",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D8C3B0] text-lg font-bold text-[#5A4636]">
          {sitter.profile?.avatar_url ? <img src={sitter.profile.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : first.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-start justify-between gap-1.5">
            <span className="flex min-w-0 items-center gap-1 font-body text-[16px] font-bold">
              <span className="truncate">{first}</span>
              {sitter.profile?.founding_member && <Star className="h-3.5 w-3.5 shrink-0 fill-[#E8B53E] text-[#E8B53E]" aria-label="Founding member" />}
            </span>
            {count > 0 ? (
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-bold" aria-label={`Rated ${average.toFixed(1)} from ${count} ${count === 1 ? "review" : "reviews"}`}>
                <Star className="h-[13px] w-[13px] fill-[#E8B53E] text-[#E8B53E]" aria-hidden="true" />
                <span aria-hidden="true">
                  {average.toFixed(1)} <span className="font-medium text-muted-foreground">({count})</span>
                </span>
              </span>
            ) : (
              <span className="shrink-0 whitespace-nowrap text-xs font-bold text-muted-foreground">New on NomadNest</span>
            )}
          </span>
          {place && <span className="truncate text-[13px] text-muted-foreground">{place}</span>}
        </span>
      </div>
      <p className="truncate text-sm text-foreground/80">{sitter.headline || " "}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
        <PetTypeChips types={sitter.pet_types ?? []} />
        <Link to={`/sitter/${sitter.user_id}`} className={nnButton("primary", "h-11 shrink-0 rounded-xl bg-brand-coral px-4 text-sm")}>
          View profile
        </Link>
      </div>
    </article>
  );
};

export default NomadMapCard;
