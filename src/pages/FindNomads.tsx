import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, MessageCircle, Star } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import { publicProfiles, type PublicProfile } from "@/lib/publicProfile";
import LocationSearchInput from "@/components/search/LocationSearchInput";
import { Skeleton } from "@/components/ui/skeleton";
import NearMeMap, { type CityPin } from "@/components/maps/NearMeMap";
import NomadVisibilityBanner from "@/components/browse/NomadVisibilityBanner";
import { useAuth } from "@/contexts/AuthContext";
import { useStartConversation } from "@/hooks/useConversations";
import { toast } from "@/hooks/use-toast";
import { NN_PAGE, RoleTheme, nnButton } from "@/components/nn/ui";
import { matchesAllTokens, cn } from "@/lib/utils";
import { List, Map as MapIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface NomadOnMap {
  user_id: string;
  latitude: number;
  longitude: number;
  headline: string | null;
  experience_level: string | null;
  pet_types: string[] | null;
  profile: {
    first_name: string | null;
    avatar_url: string | null;
    city: string | null;
    country: string | null;
    founding_member: boolean | null;
  } | null;
}

const VIEW_MODE_KEY = "nomadnest_find_nomads_view";

const cityKey = (n: NomadOnMap) =>
  `${(n.profile?.city || "").toLowerCase()}|${(n.profile?.country || "").toLowerCase()}`;

/** One Nomad: first name, city, headline and Message. */
const NearCard = ({
  nomad,
  onMessage,
  messaging,
  className,
}: {
  nomad: NomadOnMap;
  onMessage?: () => void;
  messaging: boolean;
  className?: string;
}) => {
  const first = nomad.profile?.first_name || "Nomad";
  const place = [nomad.profile?.city, nomad.profile?.country]
    .filter(Boolean)
    .join(", ");
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-[22px] border border-border bg-card p-4",
        className,
      )}
    >
      <Link to={`/sitter/${nomad.user_id}`} className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D8C3B0] text-base font-bold text-[#5A4636]">
          {nomad.profile?.avatar_url ? (
            <img
              src={nomad.profile.avatar_url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            first.slice(0, 1).toUpperCase()
          )}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-[16px] font-bold">
            {first}
            {nomad.profile?.founding_member && (
              <Star
                className="h-3.5 w-3.5 fill-[#E8B53E] text-[#E8B53E]"
                aria-label="Founding Member"
              />
            )}
          </span>
          {place && (
            <span className="truncate text-sm text-muted-foreground">
              {place}
            </span>
          )}
        </span>
      </Link>
      {nomad.headline && (
        <p className="line-clamp-2 text-[15px] leading-snug">
          {nomad.headline}
        </p>
      )}
      {onMessage && (
        <button
          type="button"
          onClick={onMessage}
          disabled={messaging}
          className={nnButton("secondary", "mt-auto h-11")}
        >
          {messaging ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          )}
          Message
        </button>
      )}
    </article>
  );
};

/** Nomads Near Me (design: NearMePhone, NearMeTablet, NearMeDesktop). */
const FindNomads = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const startConversation = useStartConversation();
  // One map at a time: the phone layout or the side-by-side one.
  const isMobile = useIsMobile();
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "map">(() => {
    try {
      return localStorage.getItem(VIEW_MODE_KEY) === "grid" ? "grid" : "map";
    } catch {
      return "map";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  }, [viewMode]);

  const { data: myCity = null } = useQuery({
    queryKey: ["near-me-city", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("city")
        .eq("id", user!.id)
        .maybeSingle();
      return data?.city ?? null;
    },
    enabled: !!user,
  });

  const {
    data: nomads = [],
    isLoading: loading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["nomads-map"],
    queryFn: async (): Promise<NomadOnMap[]> => {
      const { data, error } = await supabase
        .from("sitter_profiles")
        .select(
          "user_id, latitude, longitude, headline, experience_level, pet_types",
        )
        .eq("is_active", true)
        .eq("is_visible", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const userIds = data.map((d) => d.user_id);
      const { data: profiles } = (await publicProfiles(
        "id, first_name, avatar_url, city, country, founding_member",
      ).in("id", userIds)) as {
        data: PublicProfile[] | null;
      };
      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      return data.map((item) => {
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
                avatar_url: profile.avatar_url,
                city: profile.city,
                country: profile.country,
                founding_member: profile.founding_member,
              }
            : null,
        };
      });
    },
  });

  const filteredNomads = searchQuery
    ? nomads.filter((n) =>
        matchesAllTokens(searchQuery, [
          n.profile?.first_name || "",
          `${n.profile?.city || ""} ${n.profile?.country || ""}`,
        ]),
      )
    : nomads;

  // One pin per shared city, at the middle of that city's approximate points.
  const pins = useMemo<CityPin[]>(() => {
    const groups = new Map<string, NomadOnMap[]>();
    for (const n of filteredNomads)
      groups.set(cityKey(n), [...(groups.get(cityKey(n)) ?? []), n]);
    return [...groups.entries()].map(([key, list]) => ({
      key,
      label: list[0].profile?.city || list[0].profile?.country || "this area",
      count: list.length,
      latitude: list.reduce((s, n) => s + n.latitude, 0) / list.length,
      longitude: list.reduce((s, n) => s + n.longitude, 0) / list.length,
    }));
  }, [filteredNomads]);

  // The picked city's Nomads come first in the strip and the list.
  const ordered = useMemo(
    () =>
      selectedCity
        ? [...filteredNomads].sort(
            (a, b) =>
              Number(cityKey(b) === selectedCity) -
              Number(cityKey(a) === selectedCity),
          )
        : filteredNomads,
    [filteredNomads, selectedCity],
  );
  const selectedPin = pins.find((p) => p.key === selectedCity) ?? null;

  const handleMessage = async (otherUserId: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setMessagingId(otherUserId);
    try {
      const { conversationId } = await startConversation.mutateAsync({
        otherUserId,
        conversationType: "direct",
      });
      navigate(`/inbox?conversation=${conversationId}`);
    } catch {
      toast({
        variant: "destructive",
        title: "Couldn't open the chat",
        description: "Please try again.",
      });
    } finally {
      setMessagingId(null);
    }
  };

  const card = (n: NomadOnMap, className?: string) => (
    <NearCard
      key={n.user_id}
      nomad={n}
      className={className}
      messaging={messagingId === n.user_id}
      onMessage={
        user?.id !== n.user_id ? () => handleMessage(n.user_id) : undefined
      }
    />
  );

  const seg = (mode: "grid" | "map", label: string, Icon: typeof List) => (
    <button
      type="button"
      aria-pressed={viewMode === mode}
      onClick={() => setViewMode(mode)}
      className={cn(
        "flex h-11 items-center gap-1.5 rounded-full px-3 text-sm sm:px-4",
        viewMode === mode
          ? "bg-card font-bold shadow-sm"
          : "font-semibold text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );

  const countLine = `${filteredNomads.length} ${filteredNomads.length === 1 ? "Nomad" : "Nomads"} nearby`;

  return (
    <RoleTheme role="sitter" className="flex min-h-screen flex-col">
      <Navbar wide />

      <main
        className={cn(
          NN_PAGE,
          "flex flex-1 flex-col gap-4 pb-12 pt-20 md:pt-24",
        )}
      >
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[32px] font-normal leading-tight lg:text-[38px]">
            Nomads Near Me
          </h1>
          <p className="text-[15px] text-muted-foreground">
            Meet other Nomads in the cities you visit.
          </p>
        </div>

        <Link
          to="/city-chats"
          className="flex min-h-[64px] items-center gap-3 rounded-[18px] bg-brand-teal px-4 py-3 text-[#1F1B16]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/60">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[16px] font-bold">
              {myCity ? `${myCity} City Chat` : "City Chats"}
            </span>
            <span className="text-sm">
              Swap tips and meet up with Nomads in town.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
        </Link>

        <NomadVisibilityBanner bare />

        <div className="flex items-center gap-2">
          <LocationSearchInput
            wrapperClassName="min-w-0 flex-1"
            placeholder="Name or city"
            value={searchQuery}
            onChange={setSearchQuery}
          />
          {isMobile && (
            <div
              role="group"
              aria-label="View"
              className="flex shrink-0 rounded-full bg-muted p-1"
            >
              {seg("map", "Map", MapIcon)}
              {seg("grid", "List", List)}
            </div>
          )}
        </div>

        {loading ? (
          <Skeleton className="h-[420px] w-full rounded-[22px]" />
        ) : isError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 rounded-[22px] border border-border p-8 text-center"
          >
            <p className="text-[17px] font-bold">
              We couldn't load Nomads near you
            </p>
            <p className="text-[15px] text-muted-foreground">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className={nnButton("primary")}
            >
              Try again
            </button>
          </div>
        ) : filteredNomads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[22px] border border-dashed border-border p-8 text-center">
            <p className="text-[17px] font-bold">
              {searchQuery ? "No Nomads match" : "No Nomads yet"}
            </p>
            <p className="text-[15px] text-muted-foreground">
              {searchQuery
                ? "Try another name or city."
                : "Nomads will appear here once they add their location to their profile."}
            </p>
          </div>
        ) : (
          <>
            {/* Phone: map with a swipeable strip, or the list. */}
            {isMobile ? (
              <div className="flex flex-col gap-3">
                {viewMode === "map" ? (
                  <>
                    <div className="-mx-5">
                      <NearMeMap
                        pins={pins}
                        selected={selectedCity}
                        onSelect={setSelectedCity}
                        className="rounded-none border-x-0"
                      />
                    </div>
                    <p className="text-[15px] font-semibold" aria-live="polite">
                      {selectedPin
                        ? `${selectedPin.count} ${selectedPin.count === 1 ? "Nomad" : "Nomads"} in ${selectedPin.label}`
                        : countLine}
                    </p>
                    <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
                      {ordered.map((n) =>
                        card(n, "w-[78%] shrink-0 snap-start"),
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[15px] font-semibold">{countLine}</p>
                    <div className="flex flex-col gap-3">
                      {ordered.map((n) => card(n))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Tablet and desktop: list on the left, map on the right. */
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5">
                <div className="flex max-h-[640px] flex-col gap-3 overflow-y-auto pr-1">
                  <p className="text-[15px] font-semibold" aria-live="polite">
                    {selectedPin
                      ? `${selectedPin.count} ${selectedPin.count === 1 ? "Nomad" : "Nomads"} in ${selectedPin.label} first`
                      : countLine}
                  </p>
                  {ordered.map((n) => card(n))}
                </div>
                <div className="sticky top-24 self-start">
                  <NearMeMap
                    pins={pins}
                    selected={selectedCity}
                    onSelect={setSelectedCity}
                    className="h-[640px]"
                  />
                </div>
              </div>
            )}
            <p className="text-[13px] text-muted-foreground">
              Pins show the city a Nomad chose, never a home.
            </p>
          </>
        )}
      </main>

      <Footer />
    </RoleTheme>
  );
};

export default FindNomads;
