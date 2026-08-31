import { Link } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MapPin, Star, CheckCircle, Dog, Cat, Bird, Rabbit, Fish } from "lucide-react";
import { SitterWithProfile } from "@/hooks/useSitters";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import MessageSitterButton from "@/components/browse/MessageSitterButton";
import CategoryRatingsSummary from "@/components/reviews/CategoryRatingsSummary";
import RatingPlaceholder from "@/components/reviews/RatingPlaceholder";
import { formatPetType } from "@/lib/petTypes";


const petIcons: Record<string, typeof Dog> = {
  dog: Dog,
  cat: Cat,
  bird: Bird,
  rabbit: Rabbit,
  fish: Fish,
};

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
  const petTypes = (sitter.pet_types || []).slice(0, 3);

  return (
    <Link to={`/sitter/${sitter.user_id}`} className="block h-full">
      <Card
        variant="interactive"
        className="h-full overflow-hidden group flex flex-col items-center text-center p-3 md:p-4"
      >
        {/* Avatar with verified badge */}
        <div className="relative mb-2.5">
          <Avatar className="w-16 h-16 md:w-20 md:h-20 ring-2 ring-background shadow-sm">
            <AvatarImage src={sitter.profile?.avatar_url || ""} alt={name} />
            <AvatarFallback className="text-sm md:text-base font-semibold">{initials}</AvatarFallback>
          </Avatar>
          {sitter.id_verified && (
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center ring-2 ring-background">
              <CheckCircle className="w-3 h-3 text-primary-foreground" />
            </div>
          )}
        </div>

        {/* Name */}
        <h3 className="font-semibold text-sm leading-tight mb-0.5 group-hover:text-primary transition-colors line-clamp-1 w-full">
          {name}
        </h3>

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

        {/* Founding Member badge */}
        {sitter.profile?.founding_member && (
          <div className="mb-1.5">
            <FoundingMemberBadge />
          </div>
        )}

        {/* Pet type tags */}
        {petTypes.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center mt-auto pt-2">
            {petTypes.map((type) => {
              const Icon = petIcons[type.toLowerCase()] || Dog;
              return (
                <Badge
                  key={type}
                  variant="muted"
                  className="gap-0.5 text-[10px] px-1.5 h-5 capitalize"
                >
                  <Icon className="w-2.5 h-2.5" />
                  {formatPetType(type)}
                </Badge>
              );
            })}
          </div>
        )}
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
