import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { nnButton, shortRange } from "@/components/nn/ui";
import { useCityChatRooms, type CityChatRoom } from "@/hooks/useCityChatRooms";
import { cn } from "@/lib/utils";

const roomSub = (r: CityChatRoom) => {
  const dates = r.sit_start && r.sit_end ? shortRange(r.sit_start, r.sit_end) : null;
  if (r.has_access) {
    const n = r.nomad_count ?? 0;
    return `${n} ${n === 1 ? "Nomad" : "Nomads"} here${dates ? ` · your sit ${dates}` : ""}`;
  }
  const verb = r.locked_reason === "invited" ? "You were invited" : "You applied";
  return dates ? `${verb} for ${dates}` : verb;
};

/** The City Chats tab: open rooms and locked cities. */
const CityChatsSection = ({ className, selectedKey }: { className?: string; selectedKey?: string }) => {
  const { rooms, loading, isError, refetch } = useCityChatRooms();
  const open = rooms.filter((r) => r.has_access);
  const locked = rooms.filter((r) => !r.has_access);

  return (
    <section className={cn("flex flex-col gap-3", className)} aria-label="Your City Chats">
      <p className="text-[15px] leading-snug text-muted-foreground">
        Meet other Nomads sitting in the same city. A city's chat opens for you when your sit there is confirmed, and closes when it ends.
      </p>
      {loading ? (
        [1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-[20px]" />)
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="font-display text-xl">Could not load your City Chats</p>
          <button type="button" onClick={() => refetch()} className={nnButton("secondary")}>Try again</button>
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-[var(--nn-border)] px-6 py-8 text-center">
          <span className="text-3xl" aria-hidden="true">🏙️</span>
          <p className="font-display text-xl">No city chat yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            When a sit is confirmed, you can chat with the other Nomads in that city: vet tips, pet play dates and co-working.
          </p>
          <Link to="/browse-sits" className={nnButton("primary", "mt-2")}>Browse sits</Link>
        </div>
      ) : (
        <>
          {open.map((r) => (
            <Link
              key={r.city_key}
              to={`/city-chat/${r.city_key}`}
              aria-label={`${r.city}, ${r.country}, open${r.unread_count ? `, ${r.unread_count} new messages` : ""}`}
              aria-current={selectedKey === r.city_key ? "true" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-[20px] border border-[var(--nn-border)] bg-card p-3.5 transition-colors hover:bg-[var(--nn-soft)]",
                selectedKey === r.city_key && "bg-[var(--nn-tint)]",
              )}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--nn-chip)] text-2xl" aria-hidden="true">🏙️</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-base font-bold">{r.city}, {r.country}</span>
                  {r.unread_count > 0 && (
                    <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[var(--nn-accent)] px-1.5 text-xs font-bold text-primary-foreground">
                      {r.unread_count}
                    </span>
                  )}
                </span>
                <span className="truncate text-[13px] text-muted-foreground">{roomSub(r)}</span>
                <span className="text-[13px] font-semibold text-brand-teal-text">
                  Open{r.unread_count ? ` · ${r.unread_count} new ${r.unread_count === 1 ? "message" : "messages"}` : ""}
                  {r.muted ? " · Muted" : ""}
                </span>
              </span>
            </Link>
          ))}
          {locked.map((r) => (
            <div
              key={r.city_key}
              aria-label={`${r.city}, ${r.country}, locked`}
              className="flex items-center gap-3 rounded-[20px] border border-[var(--nn-border)] bg-muted/50 p-3.5"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted text-2xl" aria-hidden="true">🏙️</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-base font-bold">{r.city}, {r.country}</span>
                <span className="truncate text-[13px] text-muted-foreground">{roomSub(r)}</span>
                <span className="text-[13px] text-muted-foreground">🔒 Opens if your sit here is confirmed</span>
              </span>
            </div>
          ))}
        </>
      )}
    </section>
  );
};

export default CityChatsSection;
