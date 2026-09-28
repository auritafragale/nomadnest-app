import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/layout/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, RoleTheme, SectionCard, SerifTitle, nnButton, shortRange } from "@/components/nn/ui";
import { useMyAvailability, useSaveAvailability, type DateRange } from "@/hooks/useMyAvailability";
import { useSits } from "@/hooks/useSits";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string) => new Date(`${s}T12:00:00`);
const addDays = (s: string, n: number) => {
  const d = fromIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const daysIn = (r: DateRange) => Math.round((fromIso(r.end).getTime() - fromIso(r.start).getTime()) / 86_400_000) + 1;
const rangeText = (r: DateRange) => {
  const n = daysIn(r);
  return `${shortRange(r.start, r.end)} · ${n} ${n === 1 ? "day" : "days"}`;
};

/** Sort and merge touching or overlapping ranges. */
const merge = (list: DateRange[]) => {
  const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
  const out: DateRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= addDays(last.end, 1)) {
      if (r.end > last.end) last.end = r.end;
    } else out.push({ ...r });
  }
  return out;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS_AHEAD = 12;

/** My availability (design: Availability.dc.html). */
const MyAvailability = () => {
  const { user } = useAuth();
  const { data, isLoading } = useMyAvailability();
  const save = useSaveAvailability();
  const { data: sits = [] } = useSits();
  const today = iso(new Date());

  const [ranges, setRanges] = useState<DateRange[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [month, setMonth] = useState(0);

  useEffect(() => {
    if (data && ranges === null) setRanges(data.ranges);
  }, [data, ranges]);

  // Booked sits (as the Nomad): never selectable.
  const booked = useMemo(() => {
    const mine = sits.filter(
      (s) => s.sitter_user_id === user?.id && (s.status === "confirmed" || s.status === "in_progress") && s.sit_dates,
    );
    const days = new Set<string>();
    for (const s of mine) {
      for (let d = s.sit_dates!.start_date; d <= s.sit_dates!.end_date; d = addDays(d, 1)) days.add(d);
    }
    return { days, sits: mine.filter((s) => s.sit_dates!.end_date >= today) };
  }, [sits, user?.id, today]);

  const list = ranges ?? [];
  const inRange = (d: string) => list.some((r) => d >= r.start && d <= r.end);

  const first = new Date();
  first.setDate(1);
  const view = new Date(first.getFullYear(), first.getMonth() + month, 1);
  const monthName = view.toLocaleString("en-GB", { month: "long", year: "numeric" });
  const monthLong = view.toLocaleString("en-GB", { month: "long" });
  const offset = view.getDay();
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();

  const pick = (d: string) => {
    setSaved(false);
    if (pending === null) {
      setPending(d);
      setError("");
      return;
    }
    const s = pending < d ? pending : d;
    const e = pending < d ? d : pending;
    setPending(null);
    for (let x = s; x <= e; x = addDays(x, 1)) {
      if (booked.days.has(x)) {
        setError("That range crosses a booked sit. Pick dates around it.");
        return;
      }
    }
    setError("");
    setRanges(merge([...list, { start: s, end: e }]));
  };

  const onSave = () =>
    save.mutate(list, {
      onSuccess: (next) => {
        setRanges(next);
        setSaved(true);
        setPending(null);
        toast.success("Availability saved");
      },
      onError: (err) => setError(err.message || "Your dates couldn't be saved. Please try again."),
    });

  const hint = error || (pending !== null ? "Now tap the last day you're free." : "Tap the first day you're free, then the last.");
  const navBtn =
    "flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-[#EBD3CA] bg-white disabled:opacity-35";

  return (
    <RoleTheme role="sitter" className="min-h-screen">
      <Navbar />
      <main className="mx-auto flex max-w-xl flex-col gap-[18px] px-5 pb-24 pt-20 md:pt-24">
        <PageHeader title="My availability" intro="Let Pet Parents know when you're free to sit." fallback="/dashboard" />

        {isLoading || ranges === null ? (
          <Skeleton className="h-96 w-full rounded-[24px]" />
        ) : data?.unavailable ? (
          <SectionCard className="p-[18px]">
            <p className="text-sm text-[#656B74]">Availability is being switched on. Please try again in a few minutes.</p>
          </SectionCard>
        ) : (
          <>
            <SectionCard label="Calendar" className="flex flex-col gap-3 p-[18px]">
              <div className="flex items-center justify-between">
                <button type="button" className={navBtn} onClick={() => setMonth((m) => Math.max(0, m - 1))} disabled={month === 0} aria-label="Previous month">
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <p className="font-display text-xl" aria-live="polite">
                  {monthName}
                </p>
                <button
                  type="button"
                  className={navBtn}
                  onClick={() => setMonth((m) => Math.min(MONTHS_AHEAD - 1, m + 1))}
                  disabled={month === MONTHS_AHEAD - 1}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[#656B74]" aria-hidden="true">
                {WEEKDAYS.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthName}>
                {Array.from({ length: offset }).map((_, i) => (
                  <span key={`x${i}`} aria-hidden="true" />
                ))}
                {Array.from({ length: days }).map((_, i) => {
                  const d = iso(new Date(view.getFullYear(), view.getMonth(), i + 1));
                  const isPast = d < today;
                  const isBooked = booked.days.has(d);
                  const isFree = inRange(d);
                  const isPending = pending === d;
                  const state = isBooked ? ", booked sit" : isPast ? ", past" : isPending ? ", first day picked" : isFree ? ", free to sit" : "";
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={isBooked || isPast}
                      onClick={() => pick(d)}
                      aria-label={`${i + 1} ${monthLong}${state}`}
                      aria-pressed={isFree || isPending}
                      className={cn(
                        "h-[42px] rounded-xl text-sm",
                        isBooked && "bg-[#C4553E] font-bold text-white",
                        !isBooked && isPast && "text-[#B5B9C0]",
                        !isBooked && !isPast && isPending && "bg-white font-bold text-[#C4553E] shadow-[inset_0_0_0_2px_#C4553E]",
                        !isBooked && !isPast && !isPending && isFree && "bg-[#237A6D] font-bold text-white",
                        !isBooked && !isPast && !isPending && !isFree && "bg-[#FCF3F0] font-semibold",
                        d === today && !isBooked && "ring-2 ring-[#1F1B16] ring-offset-1",
                      )}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#656B74]" aria-hidden="true">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#C4553E]" />Booked sit</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#237A6D]" />Free to sit</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded shadow-[inset_0_0_0_2px_#C4553E]" />First day picked</span>
              </div>
              <p className={cn("text-[13px] leading-snug", error ? "font-semibold text-[#A2412C]" : "text-[#656B74]")} role={error ? "alert" : undefined}>
                {hint}
              </p>
            </SectionCard>

            <SectionCard label="Your dates" className="flex flex-col gap-1 p-[18px]">
              <SerifTitle className="mb-1">Your dates</SerifTitle>
              {booked.sits.map((s) => (
                <div key={s.id} className="flex items-center gap-3 border-t border-[var(--nn-line)] py-3 first:border-t-0">
                  <span className="h-3 w-3 shrink-0 rounded-full bg-[#C4553E]" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold">{s.listing?.title ?? "Your sit"}</span>
                    <span className="text-[13px] text-[#656B74]">Booked sit · {shortRange(s.sit_dates!.start_date, s.sit_dates!.end_date)}</span>
                  </span>
                </div>
              ))}
              {list.map((r) => (
                <div key={r.start} className="flex items-center gap-3 border-t border-[var(--nn-line)] py-2 first:border-t-0">
                  <span className="h-3 w-3 shrink-0 rounded-full bg-[#237A6D]" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-semibold">Free to sit</span>
                    <span className="text-[13px] text-[#656B74]">{rangeText(r)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRanges(list.filter((x) => x !== r));
                      setSaved(false);
                    }}
                    aria-label={`Remove ${rangeText(r)}`}
                    className={nnButton("ghost", "px-3")}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {list.length === 0 && booked.sits.length === 0 && (
                <p className="py-2 text-sm text-[#656B74]">No dates added yet</p>
              )}
            </SectionCard>

            <button
              type="button"
              onClick={onSave}
              disabled={save.isPending}
              className={cn(
                "flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white",
                saved ? "bg-[#237A6D]" : "bg-[#C4553E]",
              )}
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saved ? "Saved" : "Save availability"}
            </button>
            <p className="text-xs text-[#656B74]">
              Pet Parents see only your free dates. Where you're sitting is never shown.
            </p>
          </>
        )}
      </main>
    </RoleTheme>
  );
};

export default MyAvailability;
