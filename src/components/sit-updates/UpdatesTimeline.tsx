import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, Heart, Languages, Loader2, MessageCircle, Pill, Send, Sparkles } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LEGACY_KIND_CHIP, chipInfo, daysBetween, formatDay, languageLabel } from "@/lib/dailyUpdate";
import type { SitCheckin } from "@/hooks/useSitCheckins";
import {
  useReplyToUpdate,
  useToggleCheckinHeart,
  useUpdatePhotoUrls,
  type SitUpdateContext,
} from "@/hooks/useDailyUpdates";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Chips of an update (older one-tap check-ins show as one chip). */
const chipsOf = (c: SitCheckin) =>
  c.kind === "daily_update" ? c.chips ?? [] : [LEGACY_KIND_CHIP[c.kind]].filter((x): x is NonNullable<typeof x> => !!x);

export const UpdateChips = ({ chips, className }: { chips: string[]; className?: string }) => {
  const shown = chips.filter((c) => c !== "flag").map(chipInfo).filter((c): c is NonNullable<typeof c> => !!c);
  if (shown.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Today's care">
      {shown.map(({ code, label, Icon }) => (
        <li key={code} className="inline-flex items-center gap-1 rounded-full bg-[var(--nn-tint)] px-2.5 py-1 text-[13px] font-semibold text-[var(--nn-accent-dark)]">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
};

/** A swipeable row of photos on mobile, a grid on larger screens; tap to enlarge. */
export const UpdatePhotos = ({ urls }: { urls: string[] }) => {
  const [open, setOpen] = useState<string | null>(null);
  if (urls.length === 0) return null;
  return (
    <>
      {/* A grid, not a sideways row: the day cards themselves swipe sideways. */}
      <div className={cn("grid gap-2", urls.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
        {urls.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpen(url)}
            className={cn(
              "w-full overflow-hidden rounded-2xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            )}
            aria-label={`Open photo ${i + 1}`}
          >
            <img src={url} alt="" loading="lazy" className={cn("w-full object-cover", urls.length === 1 ? "max-h-96" : "aspect-square")} />
          </button>
        ))}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl border-0 bg-black p-0">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          {open && <img src={open} alt="" className="max-h-[85vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  );
};

const UpdateItem = ({
  update,
  context,
  photoUrls,
}: {
  update: SitCheckin;
  context: SitUpdateContext;
  photoUrls: Record<string, string>;
}) => {
  const isOwner = context.role === "owner";
  const heart = useToggleCheckinHeart(context.sit_id);
  const reply = useReplyToUpdate(context);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sentReply, setSentReply] = useState(false);

  // Owners read it in their language when a translation exists.
  const hasTranslation = isOwner && !!update.translated_lang && (!!update.translated_message || !!update.translated_flag_note);
  const [showOriginal, setShowOriginal] = useState(false);
  const translated = hasTranslation && !showOriginal;
  const message = translated ? update.translated_message ?? update.note : update.note;
  const flagNote = translated ? update.translated_flag_note ?? update.flag_note : update.flag_note;

  const urls = [
    ...(update.photo_paths ?? []).map((p) => photoUrls[p]).filter((u): u is string => !!u),
    ...(update.photo_url ? [update.photo_url] : []),
  ];
  const sitter = context.sitter.first_name;

  const sendReply = () =>
    reply.mutate(replyText, {
      onSuccess: () => {
        setReplyText("");
        setReplying(false);
        setSentReply(true);
      },
      onError: (err) => toast.error(err.message || "Couldn't send your reply."),
    });

  return (
    <article className="space-y-3">
      {update.flagged && (
        <div className="rounded-2xl border border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] px-3.5 py-3 text-[15px]">
          <p className="font-semibold text-[var(--nn-tip-text)]">A note from {sitter}</p>
          {flagNote && <p className="mt-0.5 whitespace-pre-line text-foreground">{flagNote}</p>}
        </div>
      )}
      <UpdatePhotos urls={urls} />
      <UpdateChips chips={chipsOf(update)} />
      {message && <p className="whitespace-pre-line text-[15px] leading-relaxed">{message}</p>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
        <span>{time(update.created_at)}</span>
        {/* Only the sitter sees that AI helped; owners just see the update. */}
        {!isOwner && update.ai_drafted && (
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Written with AI help
          </span>
        )}
        {hasTranslation && (
          <button type="button" className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-foreground hover:underline" onClick={() => setShowOriginal((v) => !v)}>
            <Languages className="h-3 w-3" aria-hidden="true" />
            {showOriginal ? `See in ${languageLabel(update.translated_lang) ?? "your language"}` : "See original"}
          </button>
        )}
        {!isOwner && update.owner_heart_at && (
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--nn-accent-dark)]">
            <Heart className="h-3 w-3 fill-current" aria-hidden="true" />
            {context.owner.first_name} loved this
          </span>
        )}
      </div>

      {isOwner && !context.other_member_left && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-11 gap-1.5 rounded-full border border-[var(--nn-border)] px-4", update.owner_heart_at && "text-[var(--nn-accent-dark)]")}
              aria-pressed={!!update.owner_heart_at}
              disabled={heart.isPending}
              onClick={() => heart.mutate(update.id, { onError: () => toast.error("Couldn't save that. Please try again.") })}
            >
              <Heart className={cn("h-4 w-4", update.owner_heart_at && "fill-current")} aria-hidden="true" />
              {update.owner_heart_at ? "Loved" : "Love"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-11 gap-1.5 rounded-full border border-[var(--nn-border)] px-4" onClick={() => setReplying((v) => !v)}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Reply
            </Button>
          </div>
          {replying && (
            <div className="flex items-end gap-2">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value.slice(0, 2000))}
                rows={2}
                autoFocus
                placeholder={`Reply to ${sitter}`}
                aria-label={`Reply to ${sitter}`}
                className="rounded-2xl text-base sm:text-sm"
              />
              <Button size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={!replyText.trim() || reply.isPending} onClick={sendReply} aria-label="Send reply">
                {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
          {sentReply && (
            <p className="text-sm text-muted-foreground">
              Sent to {sitter} in <Link to="/inbox" className="font-semibold text-foreground underline">chat</Link>.
            </p>
          )}
        </div>
      )}
    </article>
  );
};

/** Meds line for a day, for sits where a pet needs medication. */
const MedsLine = ({ day, items, today }: { day: string; items: SitCheckin[]; today: string }) => {
  const logged = items.some((u) => (u.chips ?? []).includes("meds") || u.kind === "meds_given");
  const isToday = day === today;
  const text = logged ? (isToday ? "Meds logged today" : "Meds logged") : isToday ? "Meds not logged yet" : "No meds logged this day";
  return (
    <p
      className={cn(
        "mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        logged ? "bg-[var(--nn-ok-bg)] text-[var(--nn-ok-text)]" : "bg-muted text-muted-foreground",
      )}
    >
      {logged ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Pill className="h-3.5 w-3.5" aria-hidden="true" />}
      {text}
    </p>
  );
};

/**
 * One card per day, newest first, as a swipeable row: touch swipe, mouse drag,
 * arrow keys and previous/next buttons (the shared Carousel), with
 * "Day 3 of 7" above and dots below.
 */
export const UpdatesTimeline = ({ updates, context }: { updates: SitCheckin[]; context: SitUpdateContext }) => {
  const days = useMemo(() => {
    const map = new Map<string, SitCheckin[]>();
    for (const u of updates) {
      const day = u.local_day ?? u.created_at.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), u]);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [updates]);
  const { data: photoUrls = {} } = useUpdatePhotoUrls(updates.flatMap((u) => u.photo_paths ?? []));
  const needsMeds = context.pets.some((p) => p.needs_medication);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  if (updates.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-[var(--nn-border)] p-8 text-center text-[15px] text-muted-foreground">
        {context.role === "owner"
          ? `${context.sitter.first_name}'s daily updates will appear here.`
          : "Your updates will appear here once you send them."}
      </div>
    );
  }

  const dayLabel = (day: string) => {
    const n = daysBetween(context.start_date, day) + 1;
    return n >= 1 && n <= context.total_days ? `Day ${n} of ${context.total_days}` : null;
  };
  const currentDay = days[Math.min(current, days.length - 1)]?.[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium" aria-live="polite">
          {currentDay && (
            <>
              {dayLabel(currentDay) && <span className="font-display font-bold">{dayLabel(currentDay)}</span>}
              {dayLabel(currentDay) ? " · " : ""}
              <span className="text-muted-foreground">{formatDay(currentDay)}</span>
            </>
          )}
        </p>
        {days.length > 1 && (
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full border-[var(--nn-border)]"
              onClick={() => api?.scrollPrev()}
              disabled={current === 0}
              aria-label="Newer day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full border-[var(--nn-border)]"
              onClick={() => api?.scrollNext()}
              disabled={current >= days.length - 1}
              aria-label="Older day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <Carousel setApi={setApi} opts={{ align: "start" }} aria-label="Daily updates, newest first">
        <CarouselContent className="-ml-3">
          {days.map(([day, items]) => (
            <CarouselItem
              key={day}
              className="basis-[92%] pl-3 sm:basis-full"
              aria-label={`${dayLabel(day) ?? "Update"}, ${formatDay(day)}`}
            >
              <article className="max-h-[75vh] overflow-y-auto rounded-[24px] border border-[var(--nn-border)] bg-card p-[18px] lg:p-5">
                <h3 className="mb-3 flex items-baseline gap-2">
                  {dayLabel(day) && <span className="font-display text-lg font-bold">{dayLabel(day)?.replace(/ of \d+$/, "")}</span>}
                  <span className="text-sm text-muted-foreground">{formatDay(day)}</span>
                </h3>
                {needsMeds && <MedsLine day={day} items={items} today={context.today} />}
                <div className="space-y-6 divide-y">
                  {items.map((u, i) => (
                    <div key={u.id} className={cn(i > 0 && "pt-6")}>
                      <UpdateItem update={u} context={context} photoUrls={photoUrls} />
                    </div>
                  ))}
                </div>
              </article>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {days.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1.5" aria-hidden="true">
          {days.map(([day], i) => (
            <span
              key={day}
              className={cn("h-2 rounded-full transition-all", i === current ? "w-5 bg-primary" : "w-2 bg-muted-foreground/30")}
            />
          ))}
        </div>
      )}
    </div>
  );
};
