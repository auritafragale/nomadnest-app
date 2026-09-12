import { Link } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Star } from "lucide-react";
import type { NomadOnMap } from "@/pages/FindNomads";

interface NomadMapCardProps {
  nomad: NomadOnMap;
  onMessage: (userId: string) => void;
  messaging: boolean;
}

/**
 * Compact map-bottom-sheet variant of the nomad profile card. Distinct from
 * src/components/browse/NomadCard.tsx (the Nomads Near Me grid card): avatar
 * and name sit side by side rather than stacked to keep the sheet short, and
 * the headline / pet-types-experienced-with are dropped since they're not
 * relevant when one nomad is viewing another's pin on a map.
 */
const NomadMapCard = ({ nomad, onMessage, messaging }: NomadMapCardProps) => {
  const name =
    `${nomad.profile?.first_name || ""} ${nomad.profile?.last_name || ""}`.trim() || "Nomad";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const location = [nomad.profile?.city, nomad.profile?.country].filter(Boolean).join(", ");

  return (
    // pt-1/pl-6 reserve room for the star badge below so it can sit at a
    // non-negative top-0/left-0 (fully inside this card's own box) instead of
    // poking out at a negative offset — MapCardSheet's content wrapper has
    // overflow-y-auto, which was clipping anything that stuck out above it.
    <div className="relative pt-1 pl-6 min-w-[220px]">
      {nomad.profile?.founding_member && (
        <span
          className="absolute top-0 left-0 flex items-center justify-center w-5 h-5 rounded-full bg-accent/15 text-accent"
          title="Founding member"
          aria-label="Founding member"
        >
          <Star className="w-3 h-3 fill-current" />
        </span>
      )}

      <Link to={`/sitter/${nomad.user_id}`} className="flex items-center gap-3">
        <Avatar className="w-12 h-12 flex-shrink-0 ring-2 ring-background shadow-sm">
          <AvatarImage src={nomad.profile?.avatar_url || ""} alt={name} />
          <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{name}</p>
          {location && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{location}</span>
            </p>
          )}
        </div>
      </Link>

      <div className="flex gap-2 mt-3">
        <Link to={`/sitter/${nomad.user_id}`} className="flex-1">
          <Button size="sm" className="w-full h-7 text-xs">View Profile</Button>
        </Link>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 w-full h-7 text-xs"
          onClick={() => onMessage(nomad.user_id)}
          disabled={messaging}
        >
          {messaging && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Message
        </Button>
      </div>
    </div>
  );
};

export default NomadMapCard;
