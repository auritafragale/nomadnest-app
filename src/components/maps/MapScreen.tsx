import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { List } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Skeleton } from "@/components/ui/skeleton";
import { useMapLayout, type MapLayout } from "@/hooks/useMapLayout";
import { useNoPagePinch } from "@/hooks/useNoPagePinch";
import type { MapFocus, MapPadding } from "./mapLimits";
import { cn } from "@/lib/utils";

/** Pills and cards floating on the map. */
export const FLOAT = "border border-border bg-card shadow-float";
const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Room kept clear of the floating cards when the map fits its points.
const PADDING: Record<MapLayout, MapPadding> = {
  phone: { top: 150, right: 40, bottom: 300, left: 40 },
  landscape: { top: 80, right: 40, bottom: 40, left: 330 },
  desktop: { top: 90, right: 90, bottom: 90, left: 450 },
};

export interface MapScreenProps<T> {
  user: User | null;
  /** What's on the map, in card order. */
  items: T[];
  getId: (item: T) => string;
  isLoading: boolean;
  /** Empty, error or signed-out content; shown instead of the cards. */
  message: ReactNode | null;
  countLabel: string;
  loadingLabel: string;
  note: string;
  /** Desktop panel heading and line. */
  title: string;
  subtitle: string;
  /** Screen-reader heading on phones. */
  srTitle: string;
  /** "float": a pill on the map; "panel": inside the desktop panel. */
  search: (where: "float" | "panel") => ReactNode;
  filters: (where: "float" | "panel") => ReactNode;
  onShowList: () => void;
  /** Desktop, top right, before List view (e.g. Saved). */
  topRight?: ReactNode;
  renderMap: (m: { selectedId: string | null; onPick: (ids: string[]) => void; padding: MapPadding; focus: MapFocus | null }) => ReactNode;
  renderCard: (item: T, c: { selected: boolean; onPick: () => void }) => ReactNode;
  /** Carousel card width on phone and tablet. */
  cardWidth: string;
}

/**
 * A full-screen map page (Browse Sits and Browse Nomads, map view): the map
 * fills everything under the top bar (above the bottom bar on phones), with
 * a floating search and filters, and the cards in a carousel (phone and
 * tablet), a side panel (a phone turned sideways) or a floating panel sized
 * to its content (desktop). Cards and markers are linked both ways.
 */
export function MapScreen<T>(p: MapScreenProps<T>) {
  useNoPagePinch();
  // Never switches while the search has focus (the keyboard would close).
  const { layout, typing, focusProps } = useMapLayout();
  const desktop = layout === "desktop";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const carousel = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const settle = useRef<number>();
  useEffect(() => () => window.clearTimeout(settle.current), []);

  const ids = p.items.map(p.getId);
  // The phone carousel starts with the first one picked.
  const selected = (selectedId && ids.includes(selectedId) ? selectedId : null) ?? (layout === "phone" ? ids[0] ?? null : null);

  const scrollToCard = (id: string) => {
    const box = layout === "phone" ? carousel.current : panel.current;
    box
      ?.querySelector<HTMLElement>(`[data-map-item="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", inline: "center", block: "nearest" });
  };

  // A marker or cluster: bring its (first) card into view.
  const pickFromMap = (picked: string[]) => {
    const first = ids.find((id) => picked.includes(id));
    if (!first) return;
    setSelectedId(first);
    scrollToCard(first);
  };

  // A card: highlight its marker and move the map there.
  const pickCard = (id: string) => {
    setSelectedId(id);
    setFocus({ id, nonce: Date.now() });
  };

  // Swiping the carousel: the card nearest the middle is picked, and once
  // the swipe settles the map moves to its marker.
  const onCarouselScroll = () => {
    const box = carousel.current;
    if (!box) return;
    const mid = box.getBoundingClientRect().left + box.clientWidth / 2;
    let best: { id: string; d: number } | null = null;
    box.querySelectorAll<HTMLElement>("[data-map-item]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (!best || d < best.d) best = { id: el.dataset.mapItem!, d };
    });
    const pick = best as { id: string; d: number } | null;
    if (!pick || pick.id === selected) return;
    setSelectedId(pick.id);
    window.clearTimeout(settle.current);
    const id = pick.id;
    settle.current = window.setTimeout(() => setFocus({ id, nonce: Date.now() }), 160);
  };

  const listPill = (
    <button type="button" onClick={p.onShowList} className={cn("flex h-11 shrink-0 touch-none items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-bold", FLOAT)}>
      <List className="h-4 w-4" aria-hidden="true" />
      {desktop ? "List view" : "List"}
    </button>
  );
  const count = p.isLoading ? p.loadingLabel : p.countLabel;
  const countPill = (
    <span aria-live="polite" className={cn("flex h-[34px] shrink-0 touch-none items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold", FLOAT)}>
      {count}
    </span>
  );
  const notePill = <span className="touch-none whitespace-nowrap rounded-full bg-card/90 px-2.5 py-1 text-xs text-foreground/80">{p.note}</span>;
  const card = (item: T, wrapper: string) => {
    const id = p.getId(item);
    return (
      <div key={id} data-map-item={id} role="listitem" className={wrapper}>
        {p.renderCard(item, { selected: id === selected, onPick: () => pickCard(id) })}
      </div>
    );
  };
  const stacked = (
    <div ref={panel} role="list" className="-mx-1 flex min-h-0 flex-col gap-2.5 overflow-y-auto px-1 pb-1">
      {p.message ?? p.items.map((item) => card(item, "w-full"))}
    </div>
  );

  return (
    <main
      {...focusProps}
      className={cn(
        "fixed inset-x-0 top-16 overflow-hidden",
        // Members have the bottom bar on phones; the map stops above it.
        p.user ? "bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0" : "bottom-0",
      )}
    >
      {layout !== "desktop" && <h1 className="sr-only">{p.srTitle}</h1>}
      <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
        {p.renderMap({ selectedId: selected, onPick: pickFromMap, padding: PADDING[layout], focus })}
      </Suspense>

      {/* Search and filters: one element in every layout, so the search is
          never rebuilt (that would close the keyboard). On desktop it is the
          floating panel, with the title, the count and the cards. */}
      <section
        aria-labelledby={desktop ? "map-screen-title" : undefined}
        aria-label={desktop ? undefined : "Search and filters"}
        className={cn(
          "absolute z-10 flex",
          layout === "phone" && "pointer-events-none inset-x-0 top-0 flex-col gap-2.5 px-4 pt-3.5",
          layout === "landscape" && "pointer-events-none left-[324px] right-3 top-3 items-start gap-2",
          desktop && cn("left-6 top-6 max-h-[calc(100%-3rem)] w-[396px] flex-col gap-3 overflow-hidden rounded-[24px] p-5", FLOAT),
        )}
      >
        {desktop && (
          <div className="flex flex-col gap-1">
            <h1 id="map-screen-title" className="font-display text-[30px] font-normal leading-tight">
              {p.title}
            </h1>
            <p className="text-[15px] text-muted-foreground">{p.subtitle}</p>
          </div>
        )}
        <div className={cn("pointer-events-auto flex", layout === "phone" && "touch-none", layout === "landscape" && "w-[260px] shrink-0 touch-none")}>
          {p.search(desktop ? "panel" : "float")}
        </div>
        <div
          className={cn(
            "pointer-events-auto flex min-w-0 gap-2",
            desktop ? "flex-wrap" : "-mx-4 -mb-6 -mt-2 touch-pan-x overflow-x-auto px-4 pb-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            layout === "landscape" && "flex-1",
          )}
        >
          {p.filters(desktop ? "panel" : "float")}
        </div>
        {desktop && (
          <>
            <p aria-live="polite" className="text-sm font-semibold">
              {count}
            </p>
            {stacked}
          </>
        )}
      </section>

      {/* Phone and tablet: the cards. Hidden while the search has focus, so
          nothing jumps when the keyboard opens; back on blur. */}
      {layout === "phone" && (
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 pb-3", typing && "invisible")}>
          {p.message ? (
            <div className={cn("pointer-events-auto mx-4 rounded-[20px] p-5", FLOAT)}>{p.message}</div>
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
                aria-label={p.countLabel}
                className="pointer-events-auto flex touch-pan-x snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
              >
                {p.items.map((item) => card(item, cn("shrink-0 snap-center", p.cardWidth)))}
              </div>
            </>
          )}
          <span className="pointer-events-auto self-center">{notePill}</span>
        </div>
      )}

      {/* A phone turned sideways: the cards in a side panel. */}
      {layout === "landscape" && (
        <>
          <section aria-label={p.countLabel} className={cn("absolute bottom-3 left-3 top-3 z-10 flex w-[300px] flex-col gap-2.5 overflow-hidden rounded-[20px] p-3", FLOAT)}>
            <div className="flex items-center justify-between gap-2">
              <span aria-live="polite" className="text-sm font-bold">
                {count}
              </span>
              {listPill}
            </div>
            {stacked}
          </section>
          <span className="pointer-events-none absolute bottom-3 right-3 z-10">{notePill}</span>
        </>
      )}

      {desktop && (
        <>
          <div className="absolute right-6 top-6 z-10 flex gap-2">
            {p.topRight}
            {listPill}
          </div>
          <span className="absolute bottom-6 right-6 z-10">{notePill}</span>
        </>
      )}
    </main>
  );
}
