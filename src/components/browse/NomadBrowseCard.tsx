import { Link } from "react-router-dom";
import { BadgeCheck, Sparkles, Star } from "lucide-react";
import type { SitterWithProfile } from "@/hooks/useSitters";
import MessageSitterButton from "@/components/browse/MessageSitterButton";
import { StatusChip, nnButton } from "@/components/nn/ui";
import { dedupePetTypes, formatPetType } from "@/lib/petTypes";
import { cn } from "@/lib/utils";

const MAX_PETS = 3;

/** "Knows cats and dogs", with "+N" past three types. */
const knows = (types: string[]) => {
  const all = dedupePetTypes(types).map((t) => formatPetType(t).toLowerCase());
  if (all.length === 0) return null;
  const shown = all.slice(0, MAX_PETS);
  const more = all.length - shown.length;
  const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return { list, more };
};

/** One Nomad on Browse Nomads (design: NomadsPhone cards). First name only. */
const NomadBrowseCard = ({ sitter, reason }: { sitter: SitterWithProfile; reason?: string | null }) => {
  const first = sitter.profile?.first_name || "Nomad";
  const place = [sitter.profile?.city, sitter.profile?.country].filter(Boolean).join(", ");
  const { average, count } = sitter.rating;
  const rating =
    count > 0
      ? `${average.toFixed(1)} (${count})${sitter.review_rate !== null && sitter.review_rate !== undefined ? ` · Review rate ${sitter.review_rate}%` : ""}`
      : null;
  const pets = knows(sitter.pet_types || []);

  return (
    <article className="flex h-full flex-col gap-3 rounded-[22px] border border-[var(--nn-border)] bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D8C3B0] text-lg font-bold text-[#5A4636]">
          {sitter.profile?.avatar_url ? <img src={sitter.profile.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : first.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-sans text-[17px] font-bold leading-tight">{first}</h3>
            {sitter.id_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-teal-text" aria-label="ID verified" />}
            {sitter.profile?.founding_member && <StatusChip tone="gold">Founding</StatusChip>}
          </div>
          {place && <p className="truncate text-sm text-muted-foreground">{place}</p>}
          <p className="flex items-center gap-1 text-sm">
            {rating ? (
              <>
                <Star className="h-3.5 w-3.5 shrink-0 fill-[#E8B53E] text-[#E8B53E]" aria-hidden="true" />
                <span className="font-semibold">{rating}</span>
              </>
            ) : (
              <span className="text-muted-foreground">New on NomadNest</span>
            )}
          </p>
        </div>
      </div>
      {sitter.headline && <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{sitter.headline}</p>}
      {reason && (
        <p className="flex items-start gap-1.5 rounded-xl bg-[var(--nn-ok-bg)] px-3 py-2 text-sm text-brand-teal-text">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{reason}</span>
        </p>
      )}
      {pets && (
        <p className="text-sm text-muted-foreground">
          Knows {pets.list}
          {pets.more > 0 && <span className="ml-1 font-semibold text-foreground">+{pets.more}</span>}
        </p>
      )}
      <div className="mt-auto flex gap-2 pt-1">
        <MessageSitterButton sitterUserId={sitter.user_id} variant="outline" className={cn(nnButton("secondary"), "h-11 flex-1")} />
        <Link to={`/sitter/${sitter.user_id}`} className={nnButton("primary", "h-11 flex-1")}>
          View profile
        </Link>
      </div>
    </article>
  );
};

export default NomadBrowseCard;
