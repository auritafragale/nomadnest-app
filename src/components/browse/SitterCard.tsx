import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MapPin, Star, Cat, Dog, Bird, Rabbit, MessageSquare, Languages, Shield, CheckCircle, Loader2 } from "lucide-react";
import { SitterWithProfile } from "@/hooks/useSitters";
import { useStartConversation } from "@/hooks/useConversations";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import CategoryRatingsSummary from "@/components/reviews/CategoryRatingsSummary";
import RatingPlaceholder from "@/components/reviews/RatingPlaceholder";
import { formatPetType, petTypeIcon, dedupePetTypes } from "@/lib/petTypes";

interface SitterCardProps {
  sitter: SitterWithProfile;
  viewMode: "grid" | "list";
}


const SitterCard = ({ sitter, viewMode }: SitterCardProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const startConversation = useStartConversation();
  const [isStartingChat, setIsStartingChat] = useState(false);

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

  const isAvailable = () => {
    if (!sitter.available_from || !sitter.available_to) return true;
    const today = new Date().toISOString().split("T")[0];
    return sitter.available_from <= today;
  };

  const handleMessageClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      toast({
        variant: "destructive",
        title: "Sign in required",
        description: "Please sign in to message nomads.",
      });
      navigate("/auth");
      return;
    }

    if (user.id === sitter.user_id) {
      toast({
        variant: "destructive",
        title: "Cannot message yourself",
        description: "You cannot start a conversation with yourself.",
      });
      return;
    }

    setIsStartingChat(true);
    try {
      const result = await startConversation.mutateAsync({
        otherUserId: sitter.user_id,
      });
      navigate(`/inbox?conversation=${result.conversationId}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to start conversation. Please try again.",
      });
    } finally {
      setIsStartingChat(false);
    }
  };

  return (
    <Link to={`/sitter/${sitter.user_id}`}>
      <Card
        variant="interactive"
        className={`overflow-hidden group ${viewMode === "list" ? "flex flex-row" : ""}`}
      >
        <div className={`p-4 md:p-6 ${viewMode === "list" ? "flex gap-4 md:gap-6 items-start" : ""}`}>
          <div
            className={`${
              viewMode === "list"
                ? "flex-shrink-0"
                : "flex flex-col items-center text-center mb-4"
            }`}
          >
            <div className="relative">
              <Avatar
                className={`${viewMode === "list" ? "w-20 h-20" : "w-24 h-24 mb-3"}`}
              >
                <AvatarImage
                  src={sitter.profile?.avatar_url || ""}
                  alt={name}
                />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {sitter.id_verified && (
                <div
                  className="absolute -bottom-1 -right-1 w-6 h-6 bg-success rounded-full flex items-center justify-center ring-2 ring-background"
                  title="ID Verified"
                  aria-label="ID verified"
                >
                  <CheckCircle className="w-4 h-4 text-success-foreground" />
                </div>
              )}
            </div>
            {viewMode !== "list" && (
              <>
                <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                  {name}
                </h3>
                {sitter.experience_level && (
                  <span className="text-sm text-muted-foreground">
                    {sitter.experience_level}
                  </span>
                )}
              </>
            )}
          </div>

          <div className={`${viewMode === "list" ? "flex-1" : ""}`}>
            {viewMode === "list" && (
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                    {name}
                  </h3>
                  {sitter.experience_level && (
                    <span className="text-sm text-muted-foreground">
                      {sitter.experience_level}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {sitter.id_verified && (
                    <Badge variant="outline" className="gap-1 border-success/40 text-success">
                      <CheckCircle className="w-3 h-3" />
                      ID Verified
                    </Badge>
                  )}
                  {sitter.background_check && (
                    <Badge variant="outline" className="gap-1">
                      <Shield className="w-3 h-3" />
                      Background Check
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {sitter.headline && (
              <p
                className={`text-sm text-muted-foreground ${
                  viewMode === "list" ? "mb-2" : "mb-3 text-center"
                }`}
              >
                {sitter.headline}
              </p>
            )}

            <div
              className={`space-y-2 ${viewMode === "list" ? "" : "text-center"}`}
            >
              {location && (
                <div
                  className={`flex items-center gap-2 text-sm text-muted-foreground ${
                    viewMode === "list" ? "" : "justify-center"
                  }`}
                >
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  {location}
                </div>
              )}
              {sitter.languages && sitter.languages.length > 0 && (
                <div
                  className={`flex items-center gap-2 text-sm text-muted-foreground ${
                    viewMode === "list" ? "" : "justify-center"
                  }`}
                >
                  <Languages className="w-4 h-4 flex-shrink-0" />
                  {sitter.languages.slice(0, 3).join(", ")}
                  {sitter.languages.length > 3 && ` +${sitter.languages.length - 3}`}
                </div>
              )}
            </div>

            <div
              className={`flex flex-wrap gap-2 mt-4 ${
                viewMode === "list" ? "" : "justify-center"
              }`}
            >
              {dedupePetTypes(sitter.pet_types).slice(0, 3).map((petType) => {
                const Icon = petTypeIcon(petType);
                return (
                  <Badge key={petType} variant="muted" className="gap-1 capitalize">
                    <Icon className="w-3 h-3" />
                    {formatPetType(petType)}
                  </Badge>
                );
              })}
              <Badge variant={isAvailable() ? "success" : "muted"}>
                {isAvailable() ? "Available" : "Booked"}
              </Badge>
            </div>

            {sitter.rating.count > 0 ? (
              <div className="mt-3 space-y-1.5">
                <div
                  className={`flex items-center gap-1 text-sm ${
                    viewMode === "list" ? "" : "justify-center"
                  }`}
                >
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium">{sitter.rating.average.toFixed(1)}</span>
                  <span className="text-muted-foreground">({sitter.rating.count})</span>
                </div>
                <CategoryRatingsSummary
                  categories={sitter.category_ratings || []}
                  compact={false}
                  className="max-w-sm mx-auto"
                />
              </div>
            ) : (
              <div className="mt-3">
                <RatingPlaceholder compact={false} className={viewMode === "list" ? "" : "justify-center"} />
              </div>
            )}



            {viewMode === "list" && (
              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMessageClick}
                  disabled={isStartingChat}
                >
                  {isStartingChat ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <MessageSquare className="w-4 h-4 mr-2" />
                  )}
                  Message
                </Button>
                <Button size="sm">
                  View Profile
                </Button>
              </div>
            )}
          </div>
        </div>

        {viewMode !== "list" && (
          <div className="px-4 pb-4 md:px-6 md:pb-6 flex gap-2 md:gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleMessageClick}
              disabled={isStartingChat}
            >
              {isStartingChat ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <MessageSquare className="w-4 h-4 mr-2" />
              )}
              Message
            </Button>
            <Button className="flex-1">
              View Profile
            </Button>
          </div>
        )}
      </Card>
    </Link>
  );
};

export default SitterCard;
