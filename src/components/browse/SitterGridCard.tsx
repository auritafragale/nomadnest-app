import { Link } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { MapPin, Star, CheckCircle } from "lucide-react";
import { SitterWithProfile } from "@/hooks/useSitters";
import MessageSitterButton from "@/components/browse/MessageSitterButton";
import CategoryRatingsSummary from "@/components/reviews/CategoryRatingsSummary";
import RatingPlaceholder from "@/components/reviews/RatingPlaceholder";
import PetTypeIcons from "@/components/browse/PetTypeIcons";



interface SitterGridCardProps {
  sitter: SitterWithProfile;
}

const SitterGridCard = ({ sitter }: SitterGridCardProps) => {
  const name = sitter.profile
    ? `${sitter.profile.first_name || ""} ${sitter.profile.last_name || ""}`.trim() || "Nomad"
    : "Nomad";

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const location = sitter.profile
    ? [sitter.profile.city, sitter.profile.country].filter(Boolean).join(", ")
    : null;

  const { average, count } = sitter.rating;

  return (
    <Link to={`/sitter/${sitter.user_id}`} className="block h-full">
      <Card
        variant="interactive"
        className="relative h-full overflow-hidden group flex flex-col items-center text-center p-3 md:p-4"
      >
        {/* Founding Member star (top-left) */}
        {sitter.profile?.founding_member && (
          <span
            className="absolute top-2 left-2 flex items-center justify-center w-6 h-6 rounded-full bg-accent/15 border border-accent"
            title="Founding Member"
            aria-label="Founding Member"
          >
            <Star className="w-3.5 h-3.5 fill-accent text-accent" />
          </span>
        )}

        {/* Avatar with verified badge */}
        <div className="relative mb-2.5">
          <Avatar className="w-16 h-16 md:w-20 md:h-20 ring-2 ring-background shadow-sm">
            <AvatarImage src={sitter.profile?.avatar_url || ""} alt={name} />
            <AvatarFallback className="text-sm md:text-base font-semibold">{initials}</AvatarFallback>
          </Avatar>
          {sitter.id_verified && (
            <div
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-success rounded-full flex items-center justify-center ring-2 ring-background"
              title="ID Verified"
              aria-label="ID verified"
            >
              <CheckCircle className="w-3 h-3 text-success-foreground" />
            </div>
          )}
        </div>

        {/* Name */}
        <h3 className="font-semibold text-sm leading-tight mb-0.5 group-hover:text-primary transition-colors line-clamp-1 w-full">
          {name}
        </h3>
        {sitter.review_rate !== null && sitter.review_rate !== undefined && (
          <p className="text-[11px] text-muted-foreground mb-0.5">
            Review Rate: {sitter.review_rate}%
          </p>
        )}

        {/* Location */}
        {location && (
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-0.5 mb-1.5 line-clamp-1 w-full">
            <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">{location}</span>
          </p>
        )}

        {/* Rating */}
        {count > 0 ? (
          <>
            <div className="flex items-center justify-center gap-0.5 text-xs mb-1.5">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span className="font-medium text-foreground">{average.toFixed(1)}</span>
              <span className="text-muted-foreground">({count})</span>
            </div>
            {sitter.category_ratings?.length > 0 && (
              <CategoryRatingsSummary
                categories={sitter.category_ratings}
                limit={4}
                className="mb-1.5"
              />
            )}
          </>
        ) : (
          <RatingPlaceholder className="mb-1.5 justify-center" />
        )}

        {/* Pet experience — icons only, max 4 then "+" */}
        <PetTypeIcons
          petTypes={sitter.pet_types}
          className="justify-center mt-auto pt-2"
        />
        {/* Message button */}
        <div className="w-full mt-2" onClick={(e) => e.preventDefault()}>
          <MessageSitterButton
            sitterUserId={sitter.user_id}
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
          />
        </div>
      </Card>
    </Link>
  );
};


export default SitterGridCard;
