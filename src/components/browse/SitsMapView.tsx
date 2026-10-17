import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, List } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { ListingFilters, ListingWithDetails } from "@/hooks/useListings";
import LocationSearchInput from "@/components/search/LocationSearchInput";
import { SitFilterTags, SitFiltersButton, clearFilters } from "@/components/browse/SitFilters";
import SitMapCard from "@/components/maps/SitMapCard";
import type { MapPadding, SitFocus } from "@/components/maps/ListingGoogleMap";
import { Skeleton } from "@/components/ui/skeleton";
import { nnButton } from "@/components/nn/ui";
import { DESKTOP_QUERY, SHORT_LANDSCAPE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useNoPagePinch } from "@/hooks/useNoPagePinch";
import { cn } from "@/lib/utils";

const ListingGoogleMap = lazy(() => import("@/components/maps/ListingGoogleMap"));

const NOTE = "Circles show the area, never the home.";
/** Pills and cards floating on the map. */
const FLOAT = "border border-border bg-card shadow-[var(--nn-float-shadow)]";
const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Room kept clear of the floating cards when the map fits its sits.
const PADDING: Record<"phone" | "landscape" | "desktop", MapPadding> = {
  phone: { top: 150, right: 40, bottom: 300, left: 40 },
  landscape: { top: 80, right: 40, bottom: 40, left: 330 },
  desktop: { top: 90, right: 90, bottom: 90, left: 450 },
};

/**
 * Browse Sits, map view (design: SitsMapPhone, SitsMapTabletDark,
 * SitsMapDesktop and their dark versions): the map fills the screen under
 * the top bar, with floating search, filters and sit cards. Sits show as
 * soft area circles, never a home.
 */
const SitsMapView = ({
  user,
  listings,
  isLoading,
  error,
  refetch,
  filters,
  onFiltersChange,
  onOpenFilters,
  onShowList,
  onSignUpPrompt,
  hasActiveFilters,
}: {
  user: User | null;
  listings: ListingWithDetails[] | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  filters: ListingFilters;
  onFiltersChange: (f: ListingFilters) => void;
  onOpenFilters: () => void;
  onShowList: () => void;
  onSignUpPrompt: () => void;
  hasActiveFilters: boolean;
}) => {
  useNoPagePinch();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const landscape = useMediaQuery(SHORT_LANDSCAPE_QUERY) && !desktop;
  const layout = desktop ? "desktop" : landscape ? "landscape" : "phone";

  const all = useMemo(() => listings ?? [], [listings]);
  const onMap = useMemo(() => all.filter((l) => l.latitude && l.longitude), [all]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<SitFocus | null>(null);
  const carousel = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const settle = useRef<number>();

  // The phone carousel starts with the first sit picked.
  const selected = onMap.find((l) => l.id === selectedId)?.id ?? (layout === "phone" ? onMap[0]?.id ?? null : null);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  const scrollToCard = (id: string) => {
    const box = layout === "phone" ? carousel.current : panel.current;
    const el = box?.querySelector<HTMLElement>(`[data-sit="${id}"]`);
    el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", inline: "center", block: "nearest" });
  };

  // A circle or cluster: bring its (first) sit's card into view.
  const pickFromMap = (ids: string[]) => {
    const first = onMap.find((l) => ids.includes(l.id));
    if (!first) return;
    setSelectedId(first.id);
    scrollToCard(first.id);
  };

  // A card: highlight its circle and move the map there.
  const pickCard = (id: string) => {
    setSelectedId(id);
    setFocus({ id, nonce: Date.now() });
  };

  // Swiping the carousel: the card nearest the middle is picked, and once the
  // swipe settles the map moves to its circle.
  const onCarouselScroll = () => {
    const box = carousel.current;
    if (!box) return;
    const mid = box.getBoundingClientRect().left + box.clientWidth / 2;
    let best: { id: string; d: number } | null = null;
    box.querySelectorAll<HTMLElement>("[data-sit]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (!best || d < best.d) best = { id: el.dataset.sit!, d };
    });
    const pick = best as { id: string; d: number } | null;
    if (!pick || pick.id === selected) return;
    setSelectedId(pick.id);
    window.clearTimeout(settle.current);
    const id = pick.id;
    settle.current = window.setTimeout(() => setFocus({ id, nonce: Date.now() }), 160);
  };

  const count = `${onMap.length} ${onMap.length === 1 ? "sit" : "sits"} in this area`;
  const empty = !isLoading && !error && all.length === 0;

  // ── Pieces ──
  const search = (
    <LocationSearchInput
      wrapperClassName="min-w-0 flex-1"
      className="rounded-full border-border bg-card text-[15px] shadow-[var(--nn-float-shadow)]"
      placeholder="Where do you want to go?"
      value={filters.search || ""}
      onChange={(v) => onFiltersChange({ ...filters, search: v })}
    />
  );
  const filterRow = (
    <div className="flex min-w-0 touch-pan-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <SitFiltersButton filters={filters} onOpenFilters={onOpenFilters} floating />
      <SitFilterTags filters={filters} onChange={onFiltersChange} floating />
    </div>
  );
  const listPill = (
    <button type="button" onClick={onShowList} className={cn("flex h-11 shrink-0 touch-none items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-bold", FLOAT)}>
      <List className="h-4 w-4" aria-hidden="true" />
      {desktop ? "List view" : "List"}
    </button>
  );
  const countPill = (
    <span aria-live="polite" className={cn("flex h-[34px] shrink-0 touch-none items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold", FLOAT)}>
      {isLoading ? "Finding sits…" : count}
    </span>
  );
  const notePill = <span className="touch-none whitespace-nowrap rounded-full bg-card/90 px-2.5 py-1 text-xs text-foreground/80">{NOTE}</span>;

  // Today's wording and buttons for no sits, none for these filters, or an error.
  const message = error ? (
    <div role="alert" className="flex flex-col items-center gap-3 text-center">
      <p className="text-[16px] font-bold">We couldn't load sits</p>
      <p className="text-[15px] text-muted-foreground">Check your connection and try again.</p>
      <button type="button" onClick={() => refetch()} className={nnButton("primary")}>
        Try again
      </button>
    </div>
  ) : empty && hasActiveFilters ? (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-[17px] font-bold">No sits match your filters</p>
      <p className="text-[15px] text-muted-foreground">Try different dates or fewer filters.</p>
      <button type="button" onClick={() => onFiltersChange(clearFilters(filters))} className={nnButton("secondary")}>
        Clear filters
      </button>
    </div>
  ) : empty ? (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-[17px] font-bold">No sits posted right now</p>
      <p className="text-[15px] text-muted-foreground">
        NomadNest is young and new homes are added every week. Finish your Nomad profile so Pet Parents can invite you directly.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to={user ? "/edit-sitter-profile" : "/auth?signup=true&role=sitter"} className={nnButton("primary")}>
          Finish my profile
        </Link>
        <Link to="/find-nomads" className={nnButton("secondary")}>
          Find Nomads near me
        </Link>
      </div>
    </div>
  ) : !isLoading && onMap.length === 0 ? (
    <p className="text-center text-[15px] text-muted-foreground">No listings have location data yet.</p>
  ) : null;

  const card = (l: ListingWithDetails, className?: string) => (
    <SitMapCard key={l.id} listing={l} selected={l.id === selected} onPick={() => pickCard(l.id)} onSignUpPrompt={onSignUpPrompt} className={className} />
  );

  return (
    <main
      className={cn(
        "fixed inset-x-0 top-16 overflow-hidden",
        // Members have the bottom bar on phones; the map stops above it.
        user ? "bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0" : "bottom-0",
      )}
    >
      <h1 className="sr-only">Browse Sits, map</h1>
      <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
        <ListingGoogleMap listings={onMap} selectedId={selected} onPick={pickFromMap} padding={PADDING[layout]} focus={focus} />
      </Suspense>

      {layout === "phone" && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2.5 px-4 pt-3.5">
            <div className="pointer-events-auto flex touch-none">{search}</div>
            <div className="pointer-events-auto">{filterRow}</div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 pb-3">
            {message ? (
              <div className={cn("pointer-events-auto mx-4 rounded-[20px] p-5", FLOAT)}>{message}</div>
            ) : (
              <>
                <div className="pointer-events-auto flex items-center justify-between gap-2 px-4">
                  {countPill}
                  {listPill}
                </div>
                <div
                  ref={carousel}
                  onScroll={onCarouselScroll}
                  role="list"
                  aria-label="Sits on the map"
                  className="pointer-events-auto flex touch-pan-x snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
                >
                  {onMap.map((l) => card(l, "w-[300px] snap-center md:w-[330px]"))}
                </div>
              </>
            )}
            <span className="pointer-events-auto self-center">{notePill}</span>
          </div>
        </>
      )}

      {layout === "landscape" && (
        <>
          <div className="pointer-events-none absolute left-[324px] right-3 top-3 z-10 flex items-start gap-2">
            <div className="pointer-events-auto flex w-[260px] shrink-0 touch-none">{search}</div>
            <div className="pointer-events-auto min-w-0 flex-1">{filterRow}</div>
          </div>
          <section aria-label="Sits on the map" className={cn("absolute bottom-3 left-3 top-3 z-10 flex w-[300px] flex-col gap-2.5 overflow-hidden rounded-[20px] p-3", FLOAT)}>
            <div className="flex items-center justify-between gap-2">
              <span aria-live="polite" className="text-sm font-bold">
                {isLoading ? "Finding sits…" : count}
              </span>
              {listPill}
            </div>
            <div ref={panel} className="-mx-1 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-1 pb-1">
              {message ?? onMap.map((l) => card(l, "w-full"))}
            </div>
          </section>
          <span className="pointer-events-none absolute bottom-3 right-3 z-10">{notePill}</span>
        </>
      )}

      {layout === "desktop" && (
        <>
          <section
            aria-labelledby="sits-map-title"
            className={cn("absolute left-6 top-6 z-10 flex max-h-[calc(100%-3rem)] w-[396px] flex-col gap-3 overflow-hidden rounded-[24px] p-5", FLOAT)}
          >
            <div className="flex flex-col gap-1">
              <h2 id="sits-map-title" className="font-display text-[30px] font-normal leading-tight">
                Browse Sits
              </h2>
              <p className="text-[15px] text-muted-foreground">Homes and pets looking for a Nomad.</p>
            </div>
            <LocationSearchInput
              wrapperClassName="w-full"
              className="rounded-full text-[15px]"
              placeholder="Where do you want to go?"
              value={filters.search || ""}
              onChange={(v) => onFiltersChange({ ...filters, search: v })}
            />
            <div className="flex flex-wrap gap-2">
              <SitFiltersButton filters={filters} onOpenFilters={onOpenFilters} />
              <SitFilterTags filters={filters} onChange={onFiltersChange} />
            </div>
            <p aria-live="polite" className="text-sm font-semibold">
              {isLoading ? "Finding sits…" : error ? "" : count}
            </p>
            <div ref={panel} className="-mx-1 flex min-h-0 flex-col gap-2.5 overflow-y-auto px-1 pb-1">
              {message ?? onMap.map((l) => card(l, "w-full"))}
            </div>
          </section>
          <div className="absolute right-6 top-6 z-10 flex gap-2">
            {user && (
              <Link to="/saved" className={cn("flex h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-bold", FLOAT)}>
                <Heart className="h-4 w-4" aria-hidden="true" />
                Saved
              </Link>
            )}
            {listPill}
          </div>
          <span className="absolute bottom-6 right-6 z-10">{notePill}</span>
        </>
      )}
    </main>
  );
};

export default SitsMapView;
