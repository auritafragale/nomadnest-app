import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import "leaflet/dist/leaflet.css";

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface NomadOnMap {
  user_id: string;
  latitude: number;
  longitude: number;
  headline: string | null;
  experience_level: string | null;
  pet_types: string[] | null;
  profile: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    city: string | null;
    country: string | null;
  } | null;
}

const FitBounds = ({ nomads }: { nomads: NomadOnMap[] }) => {
  const map = useMap();

  useEffect(() => {
    const coords = nomads.map((n) => [n.latitude, n.longitude] as [number, number]);
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
    }
  }, [nomads, map]);

  return null;
};

const FindNomads = () => {
  const [nomads, setNomads] = useState<NomadOnMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchNomads = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sitter_profiles")
        .select("user_id, latitude, longitude, headline, experience_level, pet_types")
        .eq("is_active", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (!error && data && data.length > 0) {
        // Fetch profiles separately (no FK)
        const userIds = data.map((d) => d.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, avatar_url, city, country")
          .in("id", userIds);

        const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

        const mapped = data.map((item) => {
          const profile = profileMap.get(item.user_id) || null;
          return {
            user_id: item.user_id,
            latitude: item.latitude!,
            longitude: item.longitude!,
            headline: item.headline,
            experience_level: item.experience_level,
            pet_types: item.pet_types,
            profile: profile ? {
              first_name: profile.first_name,
              last_name: profile.last_name,
              avatar_url: profile.avatar_url,
              city: profile.city,
              country: profile.country,
            } : null,
          };
        });
        setNomads(mapped);
      }
      setLoading(false);
    };

    fetchNomads();
  }, []);

  const filteredNomads = searchQuery
    ? nomads.filter((n) => {
        const name = `${n.profile?.first_name || ""} ${n.profile?.last_name || ""}`.toLowerCase();
        const location = `${n.profile?.city || ""} ${n.profile?.country || ""}`.toLowerCase();
        const q = searchQuery.toLowerCase();
        return name.includes(q) || location.includes(q);
      })
    : nomads;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pt-20">
        {/* Header */}
        <div className="bg-surface border-b border-border">
          <div className="container py-8">
            <h1 className="text-3xl md:text-4xl font-display mb-2">Find Nomads</h1>
            <p className="text-muted-foreground">
              Discover other nomads around the world and connect with them
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="bg-surface border-b border-border sticky top-16 z-40">
          <div className="container py-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search by name or location..."
                className="pl-10 h-12"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="container py-8">
          {loading ? (
            <Skeleton className="w-full h-[600px] rounded-lg" />
          ) : filteredNomads.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No nomads on the map yet</h3>
              <p className="text-muted-foreground">
                Nomads will appear here once they add their location to their profile.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {filteredNomads.length} nomad{filteredNomads.length !== 1 ? "s" : ""} on the map
              </p>
              <div className="w-full h-[600px] rounded-lg overflow-hidden border border-border">
                <MapContainer
                  center={[30, 0]}
                  zoom={2}
                  className="w-full h-full"
                  scrollWheelZoom
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <FitBounds nomads={filteredNomads} />
                  {filteredNomads.map((nomad) => {
                    const name = `${nomad.profile?.first_name || ""} ${nomad.profile?.last_name || ""}`.trim() || "Nomad";
                    const initials = name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2);
                    const location = [nomad.profile?.city, nomad.profile?.country].filter(Boolean).join(", ");

                    return (
                      <Marker key={nomad.user_id} position={[nomad.latitude, nomad.longitude]}>
                        <Popup>
                          <div className="min-w-[180px] text-center">
                            <div className="flex justify-center mb-2">
                              <div className="w-12 h-12 rounded-full overflow-hidden bg-muted">
                                {nomad.profile?.avatar_url ? (
                                  <img
                                    src={nomad.profile.avatar_url}
                                    alt={name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-sm font-medium">
                                    {initials}
                                  </div>
                                )}
                              </div>
                            </div>
                            <Link
                              to={`/sitter/${nomad.user_id}`}
                              className="font-semibold text-sm hover:text-primary block"
                            >
                              {name}
                            </Link>
                            {nomad.headline && (
                              <p className="text-xs text-muted-foreground mt-1">{nomad.headline}</p>
                            )}
                            {location && (
                              <p className="text-xs text-muted-foreground mt-1">📍 {location}</p>
                            )}
                            {nomad.pet_types && nomad.pet_types.length > 0 && (
                              <p className="text-xs mt-1">{nomad.pet_types.join(", ")}</p>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FindNomads;
