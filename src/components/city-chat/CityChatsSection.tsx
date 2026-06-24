import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, MessageCircle, Lock } from "lucide-react";
import { useCityChatRooms } from "@/hooks/useCityChatRooms";

const CityChatsSection = () => {
  const { rooms, loading } = useCityChatRooms();

  return (
    <section className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-display font-semibold">City Chats</h2>
      </div>
      <p className="text-muted-foreground mb-6">
        Join conversations with nomads in cities around the world. Available to nomads
        based in the city, or with a confirmed sit there within 7 days.
      </p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No city chats yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <Card key={room.id} className="p-5 flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-primary mt-1 shrink-0" />
                <div>
                  <h3 className="font-semibold text-lg leading-tight">{room.city}</h3>
                  <p className="text-sm text-muted-foreground">{room.country}</p>
                </div>
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
    </section>
  );
};

export default CityChatsSection;
