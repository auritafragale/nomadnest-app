import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, MessageCircle, Lock, Search } from "lucide-react";
import { useCityChatRooms, type CityChatRoom } from "@/hooks/useCityChatRooms";

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
);

const CityChatsSection = () => {
  const { rooms, loading } = useCityChatRooms();
  const [query, setQuery] = useState("");

  const yourRooms = useMemo(
    () => rooms.filter((r) => r.hasAccess).slice(0, 5),
    [rooms],
  );

  const trimmed = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (trimmed.length < 2) return [];
    return rooms.filter(
      (r) =>
        r.city.toLowerCase().includes(trimmed) ||
        r.country.toLowerCase().includes(trimmed),
    );
  }, [rooms, trimmed]);

  return (
    <section className="mt-10 space-y-10">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-display font-semibold">Your City Chats</h2>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : yourRooms.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            You don't have access to any city chats yet — get a confirmed sit or
            turn on your visibility.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {yourRooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-display font-semibold">Explore City Chats</h2>
        </div>
        <p className="text-muted-foreground mb-4">
          Search for nomad communities in cities around the world.
        </p>
        <div className="relative max-w-md mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search a city..."
            className="pl-10 h-11"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {trimmed.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            Type at least 2 characters to search.
          </p>
        ) : searchResults.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No city chats match "{query}".
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {searchResults.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default CityChatsSection;
