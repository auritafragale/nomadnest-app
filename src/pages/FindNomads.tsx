import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { List, Loader2, LocateFixed, MessageCircle, Search, Star } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useCityChatRooms } from "@/hooks/useCityChatRooms";
import { publicProfiles, type PublicProfile } from "@/lib/publicProfile";
import NearMeMap, { type CityPin, type MapFocus, type MapPadding } from "@/components/maps/NearMeMap";
import NomadVisibilityBanner from "@/components/browse/NomadVisibilityBanner";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useAuth } from "@/contexts/AuthContext";
import { useStartConversation } from "@/hooks/useConversations";
import { useMapLayout } from "@/hooks/useMapLayout";
import { useNoPagePinch } from "@/hooks/useNoPagePinch";
import { toast } from "@/hooks/use-toast";
import { RoleTheme, nnButton } from "@/components/nn/ui";
import { matchesAllTokens, cn } from "@/lib/utils";

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

const cityKey = (n: NomadOnMap) => `${(n.profile?.city || "").toLowerCase()}|${(n.profile?.country || "").toLowerCase()}`;
const placeOf = (n: NomadOnMap) => [n.profile?.city, n.profile?.country].filter(Boolean).join(", ");
const firstOf = (n: NomadOnMap) => n.profile?.first_name || "Nomad";
const nomads = (count: number) => `${count} ${count === 1 ? "Nomad" : "Nomads"}`;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Pills and cards floating on the map. */
const FLOAT = "border border-border bg-card shadow-float";
const NOTE = "Pins show the city a Nomad chose, never a home.";

// Room kept clear of the floating cards when the map fits its pins.
const PADDING: Record<"phone" | "landscape" | "desktop", MapPadding> = {
  phone: { top: 140, right: 40, bottom: 290, left: 40 },
  landscape: { top: 80, right: 40, bottom: 40, left: 330 },
  desktop: { top: 90, right: 90, bottom: 90, left: 430 },
};

const Avatar = ({ nomad, size = "h-[46px] w-[46px]" }: { nomad: NomadOnMap; size?: string }) => (
  <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D8C3B0] text-base font-bold text-[#5A4636]", size)}>
    {nomad.profile?.avatar_url ? (
      <img src={nomad.profile.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
    ) : (
      firstOf(nomad).slice(0, 1).toUpperCase()
    )}
  </span>
);

const NameLine = ({ nomad }: { nomad: NomadOnMap }) => (
  <span className="flex min-w-0 flex-col gap-0.5">
    <span className="flex items-center gap-1.5 text-[16px] font-bold">
      <span className="truncate">{firstOf(nomad)}</span>
      {nomad.profile?.founding_member && <Star className="h-3.5 w-3.5 shrink-0 fill-[#E8B53E] text-[#E8B53E]" aria-label="Founding member" />}
    </span>
    {placeOf(nomad) && <span className="truncate text-[13px] text-muted-foreground">{placeOf(nomad)}</span>}
  </span>
);

const MessageButton = ({ busy, onClick, className }: { busy: boolean; onClick: () => void; className?: string }) => (
  <button type="button" onClick={onClick} disabled={busy} className={nnButton("primary", cn("h-10 rounded-[14px] px-3", className))}>
    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}
    Message
  </button>
);

/**
 * Nomads Near Me: a full-screen map with floating cards (design: NearMeMapPhone,
 * NearMeListPhone, NearMeMapTabletDark, NearMeMapDesktop and their dark versions).
 * Pins sit on each Nomad's chosen city or approximate point, never a home;
 * members see first names only.
 */
const FindNomads = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const startConversation = useStartConversation();
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const carousel = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useNoPagePinch();
  // Phone and tablet: floating cards. A phone turned sideways: a side panel.
  // Never switches while the search has focus (the keyboard would close).
  const { layout, typing, focusProps } = useMapLayout();
  const desktop = layout === "desktop";

  // The City Chat pill follows the City Chat rule: only rooms the member can
  // open now (a confirmed or in-progress sit there), the same list as the
  // City Chats page. No room, no pill.
  const { rooms: cityRooms } = useCityChatRooms();
  const openRooms = cityRooms.filter((r) => r.has_access && r.room_id);
  const cityChat =
    openRooms.length === 1
      ? { to: `/city-chat/${openRooms[0].city_key}`, title: `${openRooms[0].city} City Chat`, action: "Join" }
      : openRooms.length > 1
        ? { to: "/city-chats", title: `Your City Chats (${openRooms.length})`, action: "Open" }
        : null;

  const {
    data: all = [],
    isLoading: loading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["nomads-map"],
    queryFn: async (): Promise<NomadOnMap[]> => {
      const { data, error } = await supabase
        .from("sitter_profiles")
        .select("user_id, latitude, longitude, headline, experience_level, pet_types")
        .eq("is_active", true)
        .eq("is_visible", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const userIds = data.map((d) => d.user_id);
      const { data: profiles } = (await publicProfiles("id, first_name, avatar_url, city, country, founding_member").in("id", userIds)) as {
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

  const filtered = useMemo(
    () =>
      searchQuery
        ? all.filter((n) => matchesAllTokens(searchQuery, [n.profile?.first_name || "", `${n.profile?.city || ""} ${n.profile?.country || ""}`]))
        : all,
    [all, searchQuery],
  );

  // One pin per shared city, at the middle of that city's approximate points.
  const pins = useMemo<CityPin[]>(() => {
    const groups = new Map<string, NomadOnMap[]>();
    for (const n of filtered) groups.set(cityKey(n), [...(groups.get(cityKey(n)) ?? []), n]);
    return [...groups.entries()].map(([key, list]) => ({
      key,
      label: list[0].profile?.city || list[0].profile?.country || "this area",
      count: list.length,
      latitude: list.reduce((s, n) => s + n.latitude, 0) / list.length,
      longitude: list.reduce((s, n) => s + n.longitude, 0) / list.length,
    }));
  }, [filtered]);

  // Cards follow the pins, so a city's Nomads sit side by side.
  const ordered = useMemo(() => {
    const order = new Map(pins.map((p, i) => [p.key, i]));
    return [...filtered].sort((a, b) => (order.get(cityKey(a)) ?? 0) - (order.get(cityKey(b)) ?? 0));
  }, [filtered, pins]);

  // Phone and tablet start with the first card picked (design: NearMeMapPhone).
  const active = ordered.find((n) => n.user_id === activeId) ?? (layout === "phone" ? ordered[0] ?? null : null);
  const selectedCity = active ? cityKey(active) : null;
  const selectedPin = pins.find((p) => p.key === selectedCity) ?? null;
  const mine = user ? all.find((n) => n.user_id === user.id) ?? null : null;
  const myPin = mine && filtered.includes(mine) ? cityKey(mine) : null;

  // A search that hides the picked Nomad clears the pick.
  useEffect(() => {
    if (activeId && !ordered.some((n) => n.user_id === activeId)) setActiveId(null);
  }, [ordered, activeId]);

  const scrollToCard = (id: string) => {
    const box = layout === "phone" ? carousel.current : panel.current;
    const el = box?.querySelector<HTMLElement>(`[data-nomad="${id}"]`);
    el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", inline: "center", block: "nearest" });
  };

  // Tapping a pin picks that city's first Nomad and brings their card into view.
  const pickCity = (key: string) => {
    const first = ordered.find((n) => cityKey(n) === key);
    if (!first) return;
    setActiveId(first.user_id);
    scrollToCard(first.user_id);
  };

  // Tapping a card picks it and centres the map on its city.
  const pickNomad = (n: NomadOnMap) => {
    setActiveId(n.user_id);
    setFocus({ key: cityKey(n), nonce: Date.now() });
  };

  // Swiping the carousel: the card nearest the middle becomes the picked one.
  const onCarouselScroll = () => {
    const box = carousel.current;
    if (!box) return;
    const mid = box.getBoundingClientRect().left + box.clientWidth / 2;
    let best: { id: string; d: number } | null = null;
    box.querySelectorAll<HTMLElement>("[data-nomad]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (!best || d < best.d) best = { id: el.dataset.nomad!, d };
    });
    const pick = best as { id: string; d: number } | null;
    if (pick && pick.id !== activeId) setActiveId(pick.id);
  };

  // Swiping the carousel up opens the full list.
  const onTouchStart = (e: TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (dy < -50 && Math.abs(dy) > Math.abs(dx) * 1.5) setListOpen(true);
  };

  const centreOnMe = () => setFocus({ key: myPin, nonce: Date.now() });

  const handleMessage = async (otherUserId: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setMessagingId(otherUserId);
    try {
      const { conversationId } = await startConversation.mutateAsync({ otherUserId, conversationType: "direct" });
      navigate(`/inbox?conversation=${conversationId}`);
    } catch {
      toast({ variant: "destructive", title: "Couldn't open the chat", description: "Please try again." });
    } finally {
      setMessagingId(null);
    }
  };

  const countLine = selectedPin ? `${nomads(selectedPin.count)} in ${selectedPin.label} · ${filtered.length} nearby` : `${nomads(filtered.length)} nearby`;
  const empty = !loading && !isError && filtered.length === 0;

  const searchInput = (className?: string) => (
    <label className={cn("flex h-12 min-w-0 items-center gap-2.5 rounded-full pl-4 pr-1.5", className)}>
      <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search a city or name"
        aria-label="Search a city or name"
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
      />
    </label>
  );

  const cityChatPill = cityChat && (
    <Link
      to={cityChat.to}
      className="flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand-teal pl-3 pr-1.5 text-sm font-bold text-primary-foreground shadow-float"
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      {cityChat.title}
      <span className="flex h-[30px] items-center rounded-full bg-card px-2.5 text-[13px] text-brand-teal-text">{cityChat.action}</span>
    </Link>
  );

  const centreButton = (
    <button
      type="button"
      onClick={centreOnMe}
      aria-label={myPin ? "Centre on me" : "Show every Nomad"}
      className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground", FLOAT)}
    >
      <LocateFixed className="h-5 w-5" aria-hidden="true" />
    </button>
  );

  // One row in the full list (phone sheet and desktop panel).
  const listRow = (n: NomadOnMap) => (
    <li key={n.user_id} data-nomad={n.user_id}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-[18px] border bg-card p-3",
          n.user_id === active?.user_id ? "border-2 border-brand-coral" : "border-border",
        )}
      >
        <button type="button" onClick={() => pickNomad(n)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Show ${firstOf(n)} on the map`}>
          <Avatar nomad={n} size="h-11 w-11" />
          <span className="flex min-w-0 flex-col">
            <NameLine nomad={n} />
            {n.headline && <span className="truncate text-[13px] text-foreground/80">{n.headline}</span>}
          </span>
        </button>
        {user?.id !== n.user_id ? (
          <MessageButton busy={messagingId === n.user_id} onClick={() => void handleMessage(n.user_id)} className="shrink-0" />
        ) : (
          <Link to={`/sitter/${n.user_id}`} className={nnButton("secondary", "h-10 shrink-0 rounded-[14px] px-3")}>
            Profile
          </Link>
        )}
      </div>
    </li>
  );

  const errorCard = (
    <div role="alert" className={cn("flex flex-col items-center gap-3 rounded-[20px] p-5 text-center", FLOAT)}>
      <p className="text-[17px] font-bold">We couldn't load Nomads near you</p>
      <p className="text-[15px] text-muted-foreground">Check your connection and try again.</p>
      <button type="button" onClick={() => refetch()} className={nnButton("primary")}>
        Try again
      </button>
    </div>
  );

  const emptyCard = (
    <div className={cn("flex flex-col gap-3 rounded-[20px] p-5", FLOAT)}>
      <p className="text-[17px] font-bold">{searchQuery ? "No Nomads match" : "No Nomads near you yet"}</p>
      <p className="text-[15px] text-muted-foreground">
        {searchQuery ? "Try another name or city." : "When Nomads near you turn on their visibility, they show up here. Turn yours on so they can find you."}
      </p>
      {!searchQuery && <NomadVisibilityBanner />}
    </div>
  );

  return (
    <RoleTheme role="sitter">
      <Navbar wide />

      {/* The map fills everything between the top bar and the bottom bar. */}
      <main {...focusProps} className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] top-16 md:bottom-0">
        {layout !== "desktop" && <h1 className="sr-only">Nomads Near Me</h1>}
        <NearMeMap
          pins={pins}
          selected={selectedCity}
          onSelect={pickCity}
          padding={PADDING[layout]}
          focus={focus}
        />

        {/* Search, visibility and City Chat: one element in every layout, so
            the search is never rebuilt (that would close the keyboard). On
            desktop it is the floating panel, with the title and the list. */}
        <section
          aria-labelledby={desktop ? "near-me-title" : undefined}
          aria-label={desktop ? undefined : "Search"}
          className={cn(
            "absolute z-10 flex",
            layout === "phone" && "pointer-events-none inset-x-0 top-0 flex-col gap-2.5 px-4 pt-3.5 md:flex-row md:items-center",
            layout === "landscape" && "pointer-events-none left-[324px] right-3 top-3 touch-pan-x gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            desktop && cn("left-6 top-6 max-h-[calc(100%-3rem)] w-[380px] flex-col gap-3 overflow-hidden rounded-[24px] p-5", FLOAT),
          )}
        >
          {desktop && (
            <div className="flex flex-col gap-1">
              <h1 id="near-me-title" className="font-display text-[30px] font-normal leading-tight">
                Nomads Near Me
              </h1>
              <p className="text-[15px] text-muted-foreground">Meet other Nomads in the cities you visit.</p>
            </div>
          )}
          {desktop && <NomadVisibilityBanner />}
          <div
            className={cn(
              "flex items-center rounded-full",
              desktop ? "border border-border bg-background" : cn("pointer-events-auto min-w-0 touch-none", FLOAT),
              layout === "phone" && "md:flex-1",
              layout === "landscape" && "w-[240px] shrink-0",
            )}
          >
            {searchInput("flex-1")}
            {layout === "phone" && (
              <button
                type="button"
                onClick={() => setListOpen(true)}
                aria-label="Show list"
                className="mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
              >
                <List className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            )}
          </div>
          {!desktop && (
            <div className={cn("pointer-events-auto flex gap-2", layout === "phone" && "-mx-4 -mb-6 -mt-2 touch-pan-x overflow-x-auto px-4 pb-6 pt-2 [scrollbar-width:none] md:mx-0 md:my-0 md:overflow-visible md:p-0")}>
              <NomadVisibilityBanner variant="pill" />
              {cityChatPill}
            </div>
          )}
          {desktop && (
            <>
              <p aria-live="polite" className="text-sm font-semibold">
                {loading ? "Finding Nomads…" : isError ? "" : countLine}
              </p>
              <div ref={panel} className="-mx-1 min-h-0 overflow-y-auto px-1 pb-1">
                {isError ? (
                  errorCard
                ) : empty ? (
                  <div className="flex flex-col gap-2 rounded-[18px] border border-dashed border-border p-5 text-center">
                    <p className="text-[17px] font-bold">{searchQuery ? "No Nomads match" : "No Nomads near you yet"}</p>
                    <p className="text-[15px] text-muted-foreground">
                      {searchQuery ? "Try another name or city." : "When Nomads near you turn on their visibility, they show up here."}
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2.5">{ordered.map(listRow)}</ul>
                )}
              </div>
            </>
          )}
        </section>

        {/* ── Phone and tablet: the cards. Hidden while the search has focus,
            so nothing jumps when the keyboard opens; back on blur. ── */}
        {layout === "phone" && (
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 pb-3", typing && "invisible")}>
          {isError ? (
            <div className="pointer-events-auto px-4">{errorCard}</div>
          ) : empty ? (
            <div className="pointer-events-auto px-4">{emptyCard}</div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4">
                <span aria-live="polite" className={cn("pointer-events-auto flex h-[34px] touch-none items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold", FLOAT)}>
                  {loading ? "Finding Nomads…" : countLine}
                </span>
                <span className="pointer-events-auto touch-none">{centreButton}</span>
              </div>
              <div
                ref={carousel}
                onScroll={onCarouselScroll}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                aria-label="Nomads nearby"
                role="list"
                className="pointer-events-auto flex touch-pan-x snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
              >
                {ordered.map((n) => (
                  <article
                    key={n.user_id}
                    role="listitem"
                    data-nomad={n.user_id}
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest("a,button")) pickNomad(n);
                    }}
                    className={cn(
                      "flex w-[268px] shrink-0 snap-center flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-float md:w-[300px]",
                      n.user_id === active?.user_id ? "border-2 border-brand-coral" : "border border-border",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar nomad={n} />
                      <NameLine nomad={n} />
                    </div>
                    <p className="truncate text-sm text-foreground/80">{n.headline || " "}</p>
                    <div className="flex gap-2">
                      {user?.id !== n.user_id && (
                        <MessageButton busy={messagingId === n.user_id} onClick={() => void handleMessage(n.user_id)} className="flex-1" />
                      )}
                      <Link to={`/sitter/${n.user_id}`} className={nnButton("secondary", cn("h-10 rounded-[14px] px-3.5", user?.id === n.user_id && "flex-1"))}>
                        Profile
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          <span className="pointer-events-auto self-center touch-none whitespace-nowrap rounded-full bg-card/90 px-2.5 py-1 text-xs text-foreground/80">{NOTE}</span>
        </div>
        )}

        {/* Phone and tablet: the full list over two thirds of the map. */}
        <Drawer open={listOpen && layout === "phone"} onOpenChange={setListOpen} shouldScaleBackground={false}>
          <DrawerContent className="h-[66dvh]">
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
              <div>
                <DrawerTitle className="text-[17px] font-bold">{nomads(filtered.length)} nearby</DrawerTitle>
                <DrawerDescription className="sr-only">Every Nomad on the map, with Message.</DrawerDescription>
              </div>
              <button type="button" onClick={() => setListOpen(false)} className={nnButton("secondary", "h-11")}>
                Map
              </button>
            </div>
            <ul className="flex flex-col gap-2.5 overflow-y-auto px-5 pb-6">{ordered.map(listRow)}</ul>
          </DrawerContent>
        </Drawer>

        {/* ── A phone turned sideways: the cards in a side panel ── */}
        {layout === "landscape" && (
          <>
            <section aria-label="Nomads nearby" className={cn("absolute bottom-3 left-3 top-3 z-10 flex w-[300px] flex-col gap-2.5 overflow-hidden rounded-[20px] p-3", FLOAT)}>
              <p aria-live="polite" className="text-sm font-bold">
                {loading ? "Finding Nomads…" : isError ? "" : countLine}
              </p>
              <div ref={panel} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
                {isError ? errorCard : empty ? emptyCard : <ul className="flex flex-col gap-2.5">{ordered.map(listRow)}</ul>}
              </div>
            </section>
            <div className="absolute bottom-3 right-3 z-10 flex touch-none flex-col items-end gap-2">
              {centreButton}
              <span className="whitespace-nowrap rounded-full bg-card/90 px-2.5 py-1 text-xs text-foreground/80">{NOTE}</span>
            </div>
          </>
        )}

        {/* ── Desktop: City Chat top right, centre on me and the note bottom right ── */}
        {desktop && (
          <>
            <div className="absolute right-6 top-6 z-10">{cityChatPill}</div>
            <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end gap-2">
              {centreButton}
              <span className="whitespace-nowrap rounded-full bg-card/90 px-2.5 py-1 text-xs text-foreground/80">{NOTE}</span>
            </div>
          </>
        )}
      </main>
    </RoleTheme>
  );
};

export default FindNomads;
