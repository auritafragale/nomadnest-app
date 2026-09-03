import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Navigation, MessageCircle, Lock, Settings as SettingsIcon } from "lucide-react";
import { useNearbyCityChats } from "@/hooks/useNearbyCityChats";

const formatDistance = (km: number) =>
  km < 1 ? "less than 1 km" : `${Math.round(km)} km`;

const NearbyCityChats = () => {
  const { status, nearby, loading, requestLocation } = useNearbyCityChats();

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Navigation className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-display font-semibold">Near you</h2>
      </div>

      {status === "idle" || status === "prompting" ? (
        <Card className="p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-muted-foreground flex-1">
            Share your location and we'll show the city chats closest to you right now.
          </p>
          <Button onClick={requestLocation} disabled={status === "prompting"}>
            <Navigation className="w-4 h-4" />
            {status === "prompting" ? "Locating…" : "Show city chats near me"}
          </Button>
        </Card>
      ) : status === "denied" || status === "unsupported" ? (
        <Card className="p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-muted-foreground flex-1">
            We couldn't read your location, so we're using the city on your profile. You can change
            your city any time in Settings.
          </p>
          <Button variant="secondary" asChild>
            <Link to="/settings">
              <SettingsIcon className="w-4 h-4" />
              Update my city
            </Link>
          </Button>
        </Card>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : nearby.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          No city chats close to you yet — search below to explore other cities.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {nearby.map((room) => (
            <Card key={room.id} className="p-5 flex flex-col gap-3">
              <div>
                <h3 className="font-semibold text-lg leading-tight">{room.city}</h3>
                <p className="text-sm text-muted-foreground">
                  {room.country} · {formatDistance(room.distanceKm)} away
                </p>
              </div>
              {room.hasAccess ? (
                <Button asChild className="w-full mt-auto">
                  <Link to={`/city-chat/${room.id}`}>
                    <MessageCircle className="w-4 h-4" />
                    Join Chat
                  </Link>
                </Button>
              ) : (
                <Button disabled variant="secondary" className="w-full mt-auto">
                  <Lock className="w-4 h-4" />
                  Join when you have a sit here
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default NearbyCityChats;
