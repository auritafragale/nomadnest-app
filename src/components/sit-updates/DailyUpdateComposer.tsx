import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Pill, Send, Sparkles, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MAX_UPDATE_PHOTOS, UPDATE_CHIPS, type UpdateChip } from "@/lib/dailyUpdate";
import {
  draftDailyUpdate,
  removeUpdatePhoto,
  uploadUpdatePhoto,
  useDailyUpdateAiAvailable,
  useSendDailyUpdate,
  type SitUpdateContext,
} from "@/hooks/useDailyUpdates";

interface PhotoItem {
  key: string;
  preview: string;
  path: string | null;
  uploading: boolean;
}

const NOTE_MAX = 1000;
const FLAG_NOTE_MAX = 500;

/** The Nomad's "today's update": photos first, quick taps, a short message. */
export const DailyUpdateComposer = ({
  context,
  todayChips = [],
}: {
  context: SitUpdateContext;
  /** Chips already sent in today's updates (for the meds reminder). */
  todayChips?: string[];
}) => {
  const owner = context.owner.first_name;
  const needsMeds = context.pets.some((p) => p.needs_medication);
  const aiAvailable = useDailyUpdateAiAvailable();
  const send = useSendDailyUpdate(context);
  const fileRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [chips, setChips] = useState<UpdateChip[]>([]);
  const [flagNote, setFlagNote] = useState("");
  const [note, setNote] = useState("");
  const [aiDrafted, setAiDrafted] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [beforeDraft, setBeforeDraft] = useState<string | null>(null);

  // Free the local previews.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Meds given only when a pet needs medication, and then first.
  const chipOptions = needsMeds
    ? [...UPDATE_CHIPS.filter((c) => c.code === "meds"), ...UPDATE_CHIPS.filter((c) => c.code !== "meds")]
    : UPDATE_CHIPS.filter((c) => c.code !== "meds");
  const medsPet = context.pets.find((p) => p.needs_medication)?.name;
  const medsMissing = needsMeds && !todayChips.includes("meds") && !chips.includes("meds");
  const uploading = photos.some((p) => p.uploading);
  const readyPaths = photos.map((p) => p.path).filter((p): p is string => !!p);
  const flagged = chips.includes("flag");
  const hasContent = readyPaths.length > 0 || chips.length > 0 || note.trim().length > 0;

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_UPDATE_PHOTOS - photos.length;
    if (room <= 0) {
      toast.info(`You can add up to ${MAX_UPDATE_PHOTOS} photos.`);
      return;
    }
    const chosen = Array.from(files).slice(0, room);
    if (files.length > room) toast.info(`Only the first ${room} photo${room === 1 ? "" : "s"} were added.`);
    for (const file of chosen) {
      const key = crypto.randomUUID();
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      setPhotos((prev) => [...prev, { key, preview, path: null, uploading: true }]);
      uploadUpdatePhoto(context.sit_id, file)
        .then((path) => setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, path, uploading: false } : p))))
        .catch((err) => {
          setPhotos((prev) => prev.filter((p) => p.key !== key));
          toast.error(err instanceof Error ? err.message : "That photo didn't upload.");
        });
    }
  };

  const removePhoto = (item: PhotoItem) => {
    setPhotos((prev) => prev.filter((p) => p.key !== item.key));
    if (item.path) removeUpdatePhoto(item.path);
  };

  const toggleChip = (code: UpdateChip) =>
    setChips((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      // "All good" and "Something to flag" don't go together.
      const without = prev.filter((c) => !(code === "all_good" && c === "flag") && !(code === "flag" && c === "all_good"));
      return [...without, code];
    });

  const writeWithAi = async () => {
    setDrafting(true);
    try {
      const { text } = await draftDailyUpdate({
        sitId: context.sit_id,
        photoPaths: readyPaths,
        chips,
        note,
        flagNote: flagged ? flagNote : "",
      });
      setBeforeDraft(note);
      setNote(text.slice(0, NOTE_MAX));
      setAiDrafted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sorry, that didn't work right now.");
    } finally {
      setDrafting(false);
    }
  };

  const submit = () =>
    send.mutate(
      { chips, photoPaths: readyPaths, note, flagNote, aiDrafted },
      {
        onSuccess: () => {
          toast.success(`Sent to ${owner}`);
          setPhotos([]);
          setChips([]);
          setFlagNote("");
          setNote("");
          setAiDrafted(false);
          setBeforeDraft(null);
        },
        onError: (err) => toast.error(err.message || "Couldn't send your update. Please try again."),
      },
    );

  return (
    <section aria-labelledby="todays-update" className="space-y-5 rounded-[24px] border border-[var(--nn-border)] bg-card p-[18px] lg:p-5">
      <div>
        <h2 id="todays-update" className="font-display text-[22px] font-normal">Today's update</h2>
        <p className="text-[15px] text-muted-foreground">Share a moment from today with {owner}.</p>
      </div>

      {/* Photos */}
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 px-4 py-10 text-center transition-colors hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-[var(--nn-accent-dark)]">
              <Camera className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="font-semibold">Add photos</span>
            <span className="text-xs text-muted-foreground">Up to {MAX_UPDATE_PHOTOS}. {owner} will love them.</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {photos.map((item) => (
              <div key={item.key} className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
                <img src={item.preview} alt="" className="h-full w-full object-cover" />
                {item.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Loader2 className="h-6 w-6 animate-spin text-white" aria-label="Uploading" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(item)}
                  className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
                  aria-label="Remove photo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {photos.length < MAX_UPDATE_PHOTOS && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 text-sm font-medium text-[var(--nn-accent-dark)] hover:border-primary/60"
              >
                <ImagePlus className="h-6 w-6" aria-hidden="true" />
                Add more
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick taps */}
      <div className="space-y-2">
        <p className="text-[15px] font-semibold">How was today?</p>
        <div className="flex flex-wrap gap-2">
          {chipOptions.map(({ code, label, Icon }) => {
            const on = chips.includes(code);
            const isFlag = code === "flag";
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                onClick={() => toggleChip(code)}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  on
                    ? isFlag
                      ? "border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] text-foreground"
                      : "border-primary bg-primary text-primary-foreground"
                    : "border-[var(--nn-border)] bg-background hover:border-primary/50 hover:bg-primary/5",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
        {medsMissing && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Pill className="h-4 w-4 text-[var(--nn-accent-dark)]" aria-hidden="true" />
            {medsPet ? `${medsPet}'s meds aren't logged today yet.` : "Meds aren't logged today yet."}
          </p>
        )}
        {flagged && (
          <div className="space-y-1.5 rounded-2xl border border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] p-3">
            <label htmlFor="flag-note" className="text-[15px] font-semibold">What should {owner} know?</label>
            <Textarea
              id="flag-note"
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value.slice(0, FLAG_NOTE_MAX))}
              rows={2}
              placeholder="For example: Luna left half her dinner tonight."
              className="rounded-xl bg-background text-base sm:text-sm"
            />
            <p className="text-xs text-muted-foreground">We'll show this clearly to {owner}, in a calm way.</p>
          </div>
        )}
      </div>

      {/* Message */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="update-message" className="text-[15px] font-semibold">Message</label>
          {aiAvailable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 gap-1.5 rounded-full border-[var(--nn-border)]"
              disabled={drafting || uploading || !hasContent}
              onClick={writeWithAi}
            >
              {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
              {drafting ? "Writing…" : "Write my update with AI"}
            </Button>
          )}
        </div>
        <Textarea
          id="update-message"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          rows={4}
          placeholder={aiAvailable ? "A few words about today, or let AI write it from your photos and taps" : "A few words about today (optional)"}
          className="rounded-2xl text-base"
        />
        {aiDrafted && beforeDraft !== null && (
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>Written with AI. Check it and make it yours before sending.</span>
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center gap-1 px-2 font-semibold text-foreground hover:underline"
              onClick={() => {
                setNote(beforeDraft);
                setBeforeDraft(null);
                setAiDrafted(false);
              }}
            >
              <Undo2 className="h-3 w-3" aria-hidden="true" />
              Undo
            </button>
          </div>
        )}
      </div>

      {/* Sticky send */}
      {/* Above the mobile bottom nav (4rem + safe area); at the bottom on desktop. */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-[18px] rounded-b-[24px] border-t border-[var(--nn-line)] bg-card/95 px-[18px] py-3 backdrop-blur md:bottom-0 lg:-mx-5 lg:px-5">
        <Button className="h-[52px] w-full rounded-2xl text-base font-bold" disabled={!hasContent || uploading || send.isPending || drafting} onClick={submit}>
          {send.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="mr-2 h-5 w-5" aria-hidden="true" />}
          {uploading ? "Adding photos…" : send.isPending ? "Sending…" : "Send today's update"}
        </Button>
      </div>
    </section>
  );
};
