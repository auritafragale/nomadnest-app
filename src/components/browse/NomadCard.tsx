import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, MessageSquare, Loader2 } from "lucide-react";
import PetTypeIcons from "@/components/browse/PetTypeIcons";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import { useAuth } from "@/contexts/AuthContext";
import { useStartConversation } from "@/hooks/useConversations";
import { toast } from "@/hooks/use-toast";
import type { NomadOnMap } from "@/pages/FindNomads";

const NomadCard = ({ nomad }: { nomad: NomadOnMap }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const startConversation = useStartConversation();
  const [loading, setLoading] = useState(false);

  const name =
    `${nomad.profile?.first_name || ""} ${nomad.profile?.last_name || ""}`.trim() || "Nomad";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const location = [nomad.profile?.city, nomad.profile?.country]
    .filter(Boolean)
    .join(", ");

  const handleMessage = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setLoading(true);
    try {
      const { conversationId } = await startConversation.mutateAsync({
        otherUserId: nomad.user_id,
        conversationType: "direct",
      });
      navigate(`/inbox?conversation=${conversationId}`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to start conversation. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      variant="interactive"
      className="h-full flex flex-col items-center text-center p-3 md:p-4"
    >
      <Link to={`/sitter/${nomad.user_id}`} className="flex flex-col items-center w-full">
        <Avatar className="w-16 h-16 md:w-20 md:h-20 ring-2 ring-background shadow-sm mb-2.5">
          <AvatarImage src={nomad.profile?.avatar_url || ""} alt={name} />
          <AvatarFallback className="text-sm md:text-base font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <h3 className="font-semibold text-sm leading-tight line-clamp-1 w-full">{name}</h3>

        {nomad.profile?.founding_member && (
          <div className="mt-1">
            <FoundingMemberBadge />
          </div>
        )}

        {nomad.headline && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 w-full">
            {nomad.headline}
          </p>
        )}

        {location && (
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-0.5 mt-1.5 w-full">
            <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">{location}</span>
          </p>
        )}

        <PetTypeIcons petTypes={nomad.pet_types || []} className="justify-center pt-2" />
      </Link>

      {user?.id !== nomad.user_id && (
        <div className="w-full mt-auto pt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
            onClick={handleMessage}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            )}
            Message
          </Button>
        </div>
      )}
    </Card>
  );
};

export default NomadCard;
