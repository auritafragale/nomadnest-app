import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, MessageCircle, Lock } from "lucide-react";
import { useCityChatRooms, type CityChatRoom } from "@/hooks/useCityChatRooms";

import { cn } from "@/lib/utils";

const RoomCard = ({ room }: { room: CityChatRoom }) => (
  <Card className="p-5 flex flex-col gap-3">
    <div className="flex items-start gap-2">
      <MapPin className="w-4 h-4 text-primary mt-1 shrink-0" />
      <div>
        <h3 className="font-semibold text-lg leading-tight">{room.city}</h3>
        <p className="text-sm text-muted-foreground">{room.country}</p>
      </div>
    </div>
    {room.hasAccess ? (
      <Button asChild className="w-full mt-auto">
        <Link to={`/city-chat/${room.city_key}`}>
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
);

const CityChatsSection = ({ className }: { className?: string }) => {
  const { rooms, loading } = useCityChatRooms();

  const yourRooms = rooms.filter((r) => r.hasAccess);

  return (
    <section className={cn("mt-6 space-y-10", className)}>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : yourRooms.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          You don't have access to any city chats yet. Confirm a sit in a city
          to join its chat.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {yourRooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </section>
  );
};

export default CityChatsSection;
