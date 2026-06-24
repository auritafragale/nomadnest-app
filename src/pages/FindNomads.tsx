import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import NomadGoogleMap from "@/components/maps/NomadGoogleMap";
import NomadVisibilityBanner from "@/components/browse/NomadVisibilityBanner";

export interface NomadOnMap {
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
    founding_member: boolean | null;
  } | null;
}

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
        .eq("is_visible", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (!error && data && data.length > 0) {
        const userIds = data.map((d) => d.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, avatar_url, city, country, founding_member")
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
            profile: profile
              ? {
                  first_name: profile.first_name,
                  last_name: profile.last_name,
                  avatar_url: profile.avatar_url,
                  city: profile.city,
                  country: profile.country,
                  founding_member: profile.founding_member,
                }
              : null,
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
        <div className="bg-surface border-b border-border">
          <div className="container py-8">
            <h1 className="text-3xl md:text-4xl font-display mb-2">Find Nomads</h1>
            <p className="text-muted-foreground">
              Discover other nomads around the world and connect with them
            </p>
          </div>
        </div>

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
              <NomadGoogleMap nomads={filteredNomads} />
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FindNomads;
