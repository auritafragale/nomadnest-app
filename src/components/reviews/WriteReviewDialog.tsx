import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Lock, Paperclip, PenLine, Star, X } from "lucide-react";
import { resizeImage } from "@/lib/imageResize";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RoleTheme, nnButton, shortRange } from "@/components/nn/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { HOME_FLAG_QUESTIONS, NOMAD_FLAG_QUESTIONS, HOMEOWNER_QUESTION } from "@/lib/trustFlags";
import { HIGHLIGHTS, RATING_WORDS, REVIEW_CATEGORIES, dayMonth, type CategoryKey } from "@/lib/reviews";
import { wordFilterMessage } from "@/lib/wordFilter";

const EVIDENCE_BUCKET = "arrival-vault-photos";
/** Flags a Nomad reviewer can back with a photo from their Arrival Vault — the Pet Parent side has no vault. */
const VAULT_ELIGIBLE_COLUMNS = new Set(["flag_home_cleanliness", "flag_undisclosed_cameras"]);
const REVIEW_WINDOW_TIP = "Reviews are open for 14 days after the sit ends. After that, the sit auto-completes and reviews close.";
const PRIVATE_TIP = "These answers are never shown on anyone’s profile. They only help our community team spot repeated patterns.";

interface VaultPhoto {
  id: string;
  path: string;
  signedUrl: string | null;
}

interface FlagEvidenceDraft {
  reasonText: string;
  photoFile?: File;
  vaultPhotoPath?: string;
}

// Installed-PWA Android devices (this app is one — see manifest.json/sw.js)
// can have their whole web view killed and reloaded by the OS while a native
// file/photo picker is in front, wiping all in-memory React state. Persisting
// the in-progress review to sessionStorage means a reviewer who gets caught
// by that never has to start over from a blank form.
const REVIEW_DRAFT_PREFIX = "nomadnest_review_draft_";
const draftStorageKey = (sitId: string) => `${REVIEW_DRAFT_PREFIX}${sitId}`;
// Stay well under sessionStorage's typical ~5MB per-origin quota — a photo
// that doesn't fit is simply not persisted; the rest of the draft still is.
const MAX_DRAFT_PHOTO_BYTES = 3 * 1024 * 1024;

interface StoredFlagEvidence {
  reasonText: string;
  vaultPhotoPath?: string;
  photo?: { dataUrl: string; name: string; type: string };
}

/** "not_sure" is only an answer to the homeowner question. */
type FlagAnswer = "yes" | "no" | "not_sure";

interface ReviewDraft {
  step?: number;
  text: string;
  ratings: Partial<Record<CategoryKey, number>>;
  again?: boolean | null;
  highlights?: string[];
  flagAnswers: Record<string, FlagAnswer | undefined>;
  flagEvidence: Record<string, StoredFlagEvidence>;
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const dataUrlToFile = (dataUrl: string, name: string, type: string): File | undefined => {
  try {
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type });
  } catch {
    return undefined;
  }
};

interface WriteReviewDialogProps {
  sitId: string;
  revieweeUserId: string;
  revieweeName: string;
  /** "sitter": a Pet Parent reviewing a Nomad. "owner": a Nomad reviewing a Pet Parent. */
  reviewType: "owner" | "sitter";
  trigger?: React.ReactNode;
  onReviewSubmitted?: () => void;
  /** Controlled mode: when provided, no trigger is rendered. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const choiceClass = (on: boolean) =>
  cn(
    "min-h-12 rounded-xl text-[15px]",
    on ? "border-2 border-foreground bg-muted font-bold" : "border-[1.5px] border-[var(--nn-border)] font-semibold",
  );

/** Write a review (design: WriteReviewPhone, WriteReviewTabletDark, WriteReviewDesktop). */
const WriteReviewDialog = ({
  sitId,
  revieweeUserId,
  revieweeName,
  reviewType,
  trigger,
  onReviewSubmitted,
  open: controlledOpen,
  onOpenChange,
}: WriteReviewDialogProps) => {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const side = reviewType; // the side being reviewed
  const nomadWriter = reviewType === "owner";
  const categories = REVIEW_CATEGORIES[side];
  const name = revieweeName || (nomadWriter ? "your Pet Parent" : "your Nomad");

  const [step, setStep] = useState(1);
  const [text, setText] = useState("");
  const [ratings, setRatings] = useState<Partial<Record<CategoryKey, number>>>({});
  const [again, setAgain] = useState<boolean | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [flagAnswers, setFlagAnswers] = useState<Record<string, FlagAnswer | undefined>>({});
  const [flagEvidence, setFlagEvidence] = useState<Record<string, FlagEvidenceDraft>>({});
  const [loading, setLoading] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [posted, setPosted] = useState<null | { published: boolean; publishBy: string | null; overall: string }>(null);

  const rated = categories.filter((c) => (ratings[c.key] ?? 0) > 0).length;
  const allRated = rated === categories.length;
  const overallValue = rated ? categories.reduce((s, c) => s + (ratings[c.key] ?? 0), 0) / rated : 0;
  const overall = rated ? overallValue.toFixed(1) : "–";

  // `reviewType === "sitter"` means a Pet Parent is reviewing a Nomad.
  const flagQuestions = reviewType === "sitter" ? NOMAD_FLAG_QUESTIONS : HOME_FLAG_QUESTIONS;
  const isNomadReviewer = nomadWriter;

  // The sit card: first name, photo, place, dates, nights and days left.
  const { data: sitCard } = useQuery({
    queryKey: ["review-sit-card", sitId],
    queryFn: async () => {
      const [{ data: sit }, { data: other }, { data: me }] = await Promise.all([
        supabase
          .from("sits")
          .select("status, cancelled_at, snapshot_city, snapshot_country, snapshot_start_date, snapshot_end_date, listing:listing_id(city, country), sit_dates:sit_dates_id(start_date, end_date)")
          .eq("id", sitId)
          .maybeSingle(),
        supabase.from("profiles").select("avatar_url").eq("id", revieweeUserId).maybeSingle(),
        supabase.from("profiles").select("first_name").eq("id", user!.id).maybeSingle(),
      ]);
      const s = sit as null | {
        status: string;
        cancelled_at: string | null;
        snapshot_city: string | null;
        snapshot_country: string | null;
        snapshot_start_date: string | null;
        snapshot_end_date: string | null;
        listing: { city: string | null; country: string | null } | null;
        sit_dates: { start_date: string; end_date: string } | null;
      };
      if (!s) return null;
      const start = s.sit_dates?.start_date ?? s.snapshot_start_date;
      const plannedEnd = s.sit_dates?.end_date ?? s.snapshot_end_date;
      // The same end date the review window uses (the day it was cancelled for a sit cut short).
      const end = s.status === "cancelled" && s.cancelled_at ? s.cancelled_at.slice(0, 10) : plannedEnd;
      const today = new Date();
      const daysSince = end ? Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.parse(`${end}T00:00:00Z`)) / 86_400_000) : null;
      const nights = start && end ? Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000)) : null;
      return {
        avatar: (other as { avatar_url: string | null } | null)?.avatar_url ?? null,
        myName: (me as { first_name: string | null } | null)?.first_name?.trim() ?? "",
        place: [s.snapshot_city ?? s.listing?.city, s.snapshot_country ?? s.listing?.country].filter(Boolean).join(", "),
        dates: start && end ? shortRange(start, end) : null,
        nights,
        daysLeft: daysSince == null ? null : Math.max(0, 14 - daysSince),
      };
    },
    enabled: open && !!user,
  });

  // Restore a saved draft once per sit each time this dialog opens, then
  // persist further edits back to sessionStorage. See REVIEW_DRAFT_PREFIX
  // above for why: an installed PWA on Android can lose all in-memory state
  // to an OS-triggered reload while the native photo picker is in front.
  const [restoredForSitId, setRestoredForSitId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !sitId || restoredForSitId === sitId) return;
    setRestoredForSitId(sitId);
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(draftStorageKey(sitId));
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const draft: ReviewDraft = JSON.parse(raw);
      setText(draft.text || "");
      setRatings(draft.ratings || {});
      setAgain(draft.again ?? null);
      setPicks(Array.isArray(draft.highlights) ? draft.highlights.slice(0, 3) : []);
      setFlagAnswers(draft.flagAnswers || {});
      if (draft.step && draft.step >= 1 && draft.step <= 3) setStep(draft.step);
      const restoredEvidence: Record<string, FlagEvidenceDraft> = {};
      for (const [column, evidence] of Object.entries(draft.flagEvidence || {})) {
        restoredEvidence[column] = {
          reasonText: evidence.reasonText || "",
          vaultPhotoPath: evidence.vaultPhotoPath,
          photoFile: evidence.photo ? dataUrlToFile(evidence.photo.dataUrl, evidence.photo.name, evidence.photo.type) : undefined,
        };
      }
      setFlagEvidence(restoredEvidence);
      setDraftRestored(true);
    } catch (e) {
      console.warn("Could not restore review draft:", e);
    }
  }, [open, sitId, restoredForSitId]);

  useEffect(() => {
    if (!open || !sitId || restoredForSitId !== sitId || posted) return;

    const isEmpty =
      !text &&
      Object.values(ratings).every((v) => !v) &&
      again === null &&
      picks.length === 0 &&
      Object.keys(flagAnswers).length === 0 &&
      Object.keys(flagEvidence).length === 0;
    if (isEmpty) return;

    let cancelled = false;
    (async () => {
      const evidenceEntries = await Promise.all(
        Object.entries(flagEvidence).map(async ([column, evidence]) => {
          let photo: StoredFlagEvidence["photo"];
          if (evidence.photoFile && evidence.photoFile.size <= MAX_DRAFT_PHOTO_BYTES) {
            try {
              photo = { dataUrl: await fileToDataUrl(evidence.photoFile), name: evidence.photoFile.name, type: evidence.photoFile.type };
            } catch {
              photo = undefined;
            }
          }
          const stored: StoredFlagEvidence = { reasonText: evidence.reasonText, vaultPhotoPath: evidence.vaultPhotoPath, photo };
          return [column, stored] as const;
        }),
      );
      if (cancelled) return;

      const draft: ReviewDraft = { step, text, ratings, again, highlights: picks, flagAnswers, flagEvidence: Object.fromEntries(evidenceEntries) };
      try {
        sessionStorage.setItem(draftStorageKey(sitId), JSON.stringify(draft));
      } catch {
        // Likely quota exceeded because of an attached photo — retry without
        // photos so the text/ratings/answers still survive a reload.
        try {
          const withoutPhotos: ReviewDraft = {
            ...draft,
            flagEvidence: Object.fromEntries(Object.entries(draft.flagEvidence).map(([column, evidence]) => [column, { ...evidence, photo: undefined }])),
          };
          sessionStorage.setItem(draftStorageKey(sitId), JSON.stringify(withoutPhotos));
        } catch {
          // Persistence is a nicety, not a hard requirement — give up quietly.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sitId, restoredForSitId, step, text, ratings, again, picks, flagAnswers, flagEvidence, posted]);

  const isFlagRaised = (column: string, answer: FlagAnswer | undefined) => {
    const q = flagQuestions.find((fq) => fq.column === column);
    if (!q || !answer) return false;
    return q.yesIsGood ? answer === "no" : answer === "yes";
  };
  const flagPayload = () => {
    const payload: Record<string, boolean> = {};
    for (const q of flagQuestions) {
      const answer = flagAnswers[q.column];
      if (!answer) continue;
      // A flag is raised when the unhealthy answer is given.
      payload[q.column] = isFlagRaised(q.column, answer);
    }
    return payload;
  };

  // Only a Nomad reviewing a Pet Parent has an Arrival Vault to draw evidence from.
  const { data: vaultPhotos } = useQuery({
    queryKey: ["arrival-vault-photos-for-review", sitId],
    queryFn: async (): Promise<VaultPhoto[]> => {
      const { data, error } = await supabase.from("arrival_vault_photos").select("id, photo_url").eq("sit_id", sitId).order("created_at", { ascending: false });
      if (error) throw error;
      const paths = (data ?? []).map((p) => p.photo_url);
      let signedByPath: Record<string, string> = {};
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(paths, 300);
        signedByPath = Object.fromEntries((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]));
      }
      return (data ?? []).map((p) => ({ id: p.id, path: p.photo_url, signedUrl: signedByPath[p.photo_url] ?? null }));
    },
    enabled: open && isNomadReviewer && step === 3,
  });

  const resetForm = () => {
    setStep(1);
    setText("");
    setRatings({});
    setAgain(null);
    setPicks([]);
    setFlagAnswers({});
    setFlagEvidence({});
    setDraftRestored(false);
    setTipOpen(false);
  };

  const handleSubmit = async () => {
    if (!user || !allRated) return;

    setLoading(true);
    try {
      const overallRating = Math.round(overallValue);
      const insertPayload: Record<string, unknown> = {
        sit_id: sitId,
        reviewer_user_id: user.id,
        reviewee_user_id: revieweeUserId,
        rating: overallRating,
        text: text.trim() || null,
        would_again: again,
        highlights: picks,
      };
      for (const c of categories) insertPayload[c.key] = ratings[c.key];
      Object.assign(insertPayload, flagPayload());
      // Nomads only: stored privately, raises an admin-only flag on "no".
      const homeownerAnswer = flagAnswers[HOMEOWNER_QUESTION.column];
      if (isNomadReviewer && homeownerAnswer) insertPayload[HOMEOWNER_QUESTION.column] = homeownerAnswer;

      const { data: insertedReview, error } = await supabase.from("reviews").insert(insertPayload as never).select("id").single();
      if (error) throw error;

      // Write evidence rows only for flags that are still raised at submit
      // time — un-flagging a question just means its draft is never persisted.
      const reviewId = (insertedReview as { id: string }).id;
      for (const q of flagQuestions) {
        if (!isFlagRaised(q.column, flagAnswers[q.column])) continue;
        const draft = flagEvidence[q.column];
        let photoPath: string | null = draft?.vaultPhotoPath || null;
        if (!photoPath && draft?.photoFile) {
          // Resized and re-encoded on the device: no location or other metadata.
          const blob = await resizeImage(draft.photoFile, 1600, 0.85);
          const path = `${user.id}/${reviewId}/${crypto.randomUUID()}.jpg`;
          const { error: uploadError } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, blob, { upsert: false, contentType: "image/jpeg" });
          if (uploadError) console.error("Error uploading flag evidence photo:", uploadError.message);
          else photoPath = path;
        }
        const { error: evidenceError } = await supabase.from("review_flag_evidence").insert({
          review_id: reviewId,
          flag_key: q.column,
          reason_text: draft?.reasonText.trim() || null,
          photo_url: photoPath,
        });
        if (evidenceError) {
          console.error("Error saving flag evidence:", evidenceError.code);
          // The review is posted; only this private note wasn't kept.
          const filtered = wordFilterMessage(evidenceError);
          if (filtered) toast({ title: "Your note to the team wasn't saved", description: filtered });
        }
      }

      // The reviewee is told by the database (notify_review_received). If the
      // other member already wrote theirs, both are now published.
      const { data: status } = await supabase.rpc("get_my_review_status", { p_sit_id: sitId });
      const st = (status ?? {}) as { published?: boolean; publish_by?: string | null };
      setPosted({ published: !!st.published, publishBy: st.publish_by ?? null, overall });

      for (const key of ["member-reviews", "member-review-summary", "member-rating", "sits", "has-reviewed", "my-waiting-reviews", "dashboard-summary"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      try {
        sessionStorage.removeItem(draftStorageKey(sitId));
      } catch {
        // Non-critical — the draft just lingers until it's overwritten or expires with the tab.
      }
      onReviewSubmitted?.();
    } catch (error: unknown) {
      const e = error as { code?: string; message?: string };
      console.error("Error submitting review:", e?.code);
      toast({
        variant: "destructive",
        title: "Review not posted",
        description:
          e?.code === "23505"
            ? "You already reviewed this sit."
            : wordFilterMessage(error) ??
              (e?.code === "42501" ? "Reviews for this sit are closed." : "Please try again."),
      });
    } finally {
      setLoading(false);
    }
  };

  const close = (next: boolean) => {
    setOpen(next);
    if (!next && posted) {
      setPosted(null);
      resetForm();
    }
  };

  const togglePick = (key: string) =>
    setPicks((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < 3 ? [...p, key] : p));

  const firstName = sitCard?.myName ?? "";

  const stepTitle = ["How did it go?", "Tell others about it", "A few private questions"][step - 1];

  return (
    <Dialog open={open} onOpenChange={close}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm" className="gap-2">
              <PenLine className="h-4 w-4" />
              Write Review
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none md:h-auto md:max-h-[90vh] md:max-w-[680px] md:rounded-[26px] md:border [&>button:last-child]:hidden"
        // Selecting a file/photo hands focus to the native OS picker and
        // back; on some mobile browsers that return trips Radix's outside-
        // interaction detection and silently closes the dialog, discarding
        // whatever the reviewer had filled in. This form has no other way
        // to lose unsaved progress, so outside taps are ignored — Escape
        // and the explicit close button still close it.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <RoleTheme role={nomadWriter ? "sitter" : "owner"} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5 md:px-7 md:pt-6">
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="font-display text-[26px] font-normal leading-tight">Review {name}</DialogTitle>
              <DialogDescription className="text-sm font-semibold text-muted-foreground">
                {posted ? "Done" : `Step ${step} of 3`}
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => close(false)}
              aria-label="Close"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex gap-1.5 px-5 md:px-7" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= (posted ? 3 : step) ? "bg-[var(--nn-accent)]" : "bg-muted")} />
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 md:px-7">
            {draftRestored && !posted && (
              <p role="status" className="mb-3 flex items-center gap-2 rounded-[14px] bg-foreground px-3.5 py-3 text-sm font-semibold text-background">
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                Draft restored
              </p>
            )}

            {posted ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-[var(--nn-accent)] text-primary-foreground">
                  <Check className="h-10 w-10" aria-hidden="true" />
                </span>
                <h2 className="font-display text-[28px] font-normal">Review submitted!</h2>
                <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">
                  {posted.published
                    ? "Both reviews are now on your profiles."
                    : `Thank you${firstName ? `, ${firstName}` : ""}. Your review for ${name} appears on their profile when ${name} reviews you too, or on ${
                        dayMonth(posted.publishBy) ?? "the day reviews close"
                      } at the latest. Until then, neither of you can see the other’s review.`}
                </p>
                <div className="flex flex-col items-center gap-1 rounded-2xl bg-muted px-6 py-3">
                  <span className="text-sm font-semibold text-muted-foreground">Your rating</span>
                  <span className="flex items-center gap-1.5 text-xl font-bold">
                    <Star className="h-5 w-5 fill-[#E8B53E] text-[#E8B53E]" aria-hidden="true" />
                    {posted.overall}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">Your private answers went only to the NomadNest team.</p>
                <Link to="/dashboard" onClick={() => close(false)} className={nnButton("primary", "mt-1 h-[52px] w-full max-w-sm rounded-[14px] text-base")}>
                  Back to dashboard
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* The sit, on every step */}
                <div className="flex items-center gap-3 rounded-[18px] border border-[var(--nn-border)] p-3">
                  <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[17px] font-bold">
                    {sitCard?.avatar ? <img src={sitCard.avatar} alt="" className="h-full w-full object-cover" /> : name.charAt(0)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-bold">Your sit with {name}</span>
                    <span className="text-sm text-muted-foreground">
                      {[sitCard?.place, sitCard?.dates, sitCard?.nights ? `${sitCard.nights} ${sitCard.nights === 1 ? "night" : "nights"}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </div>
                {sitCard?.daysLeft != null && (
                  <div className="-mt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      aria-expanded={tipOpen}
                      aria-controls="review-window-tip"
                      onClick={() => setTipOpen(!tipOpen)}
                      className="inline-flex min-h-11 items-center self-start rounded-full bg-[var(--nn-tip-bg)] px-3.5 text-sm font-bold text-[var(--nn-tip-text)]"
                    >
                      {sitCard.daysLeft === 0 ? "Last day to review" : `${sitCard.daysLeft} ${sitCard.daysLeft === 1 ? "day" : "days"} left to review`}
                    </button>
                    {tipOpen && (
                      <p id="review-window-tip" className="rounded-[14px] bg-muted p-3 text-sm">
                        {REVIEW_WINDOW_TIP}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <h3 className="font-display text-[24px] font-normal">{stepTitle}</h3>
                  {step === 1 && (
                    <p className="text-[15px] text-muted-foreground">
                      Rate your experience with this {nomadWriter ? "Pet Parent" : "Nomad"} across the categories below.
                    </p>
                  )}
                  {step === 2 && <p className="text-[15px] text-muted-foreground">What would you tell a friend about {name}? You can skip this.</p>}
                  {step === 3 && <p className="text-[15px] text-muted-foreground">Quick yes or no answers.</p>}
                </div>

                {step === 1 && (
                  <>
                    <div className="flex flex-col gap-4">
                      {categories.map((c) => {
                        const value = ratings[c.key] ?? 0;
                        return (
                          <fieldset key={c.key} className="flex flex-col gap-1">
                            <legend className="sr-only">{c.label}</legend>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[16px] font-bold">{c.label}</span>
                              <span className="text-sm font-semibold text-muted-foreground">{value ? RATING_WORDS[value] : "Not rated yet"}</span>
                            </div>
                            <span className="text-sm text-muted-foreground">{c.helper}</span>
                            <div role="radiogroup" aria-label={c.label} className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  role="radio"
                                  aria-checked={value === n}
                                  aria-label={`${n} ${n === 1 ? "star" : "stars"}, ${RATING_WORDS[n]}`}
                                  onClick={() => setRatings((r) => ({ ...r, [c.key]: n }))}
                                  className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-muted"
                                >
                                  <Star className={cn("h-8 w-8", n <= value ? "fill-[#E8B53E] text-[#E8B53E]" : "text-[var(--nn-border)]")} aria-hidden="true" />
                                </button>
                              ))}
                            </div>
                          </fieldset>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-muted px-4 py-3">
                      <span className="flex flex-col">
                        <span className="text-[16px] font-bold">Overall</span>
                        <span className="text-sm text-muted-foreground">The average of your ratings</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-2xl font-bold" aria-live="polite">
                        <Star className="h-6 w-6 fill-[#E8B53E] text-[#E8B53E]" aria-hidden="true" />
                        {overall}
                      </span>
                    </div>
                    <fieldset className="flex flex-col gap-2">
                      <legend className="mb-1 text-[16px] font-bold">
                        {nomadWriter ? `Would you sit for ${name} again?` : `Would you have ${name} look after your home again?`}
                      </legend>
                      <div role="radiogroup" aria-label="Again" className="grid grid-cols-2 gap-2">
                        {[true, false].map((v) => (
                          <button key={String(v)} type="button" role="radio" aria-checked={again === v} onClick={() => setAgain(again === v ? null : v)} className={choiceClass(again === v)}>
                            {v ? "Yes" : "No"}
                          </button>
                        ))}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        A Yes shows on your review. Every answer counts towards the percentage on {name}’s profile. You can skip this.
                      </span>
                    </fieldset>
                  </>
                )}

                {step === 2 && (
                  <>
                    <fieldset className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <legend className="text-[16px] font-bold">What stood out?</legend>
                        <span className="text-sm text-muted-foreground">Optional · {picks.length} of 3</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {HIGHLIGHTS[side].map((h) => {
                          const on = picks.includes(h.key);
                          return (
                            <button
                              key={h.key}
                              type="button"
                              aria-pressed={on}
                              onClick={() => togglePick(h.key)}
                              disabled={!on && picks.length >= 3}
                              className={cn(
                                "min-h-11 rounded-full px-3.5 text-sm disabled:opacity-50",
                                on ? "border-[1.5px] border-[var(--nn-accent)] bg-[var(--nn-tint)] font-bold" : "border-[1.5px] border-[var(--nn-border)] font-semibold",
                              )}
                            >
                              {on ? "✓ " : ""}
                              {h.label}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="review-text" className="text-[16px] font-bold">
                        Your review (optional)
                      </label>
                      <Textarea
                        id="review-text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={`Tell others about your experience with ${name}...`}
                        rows={6}
                        maxLength={1000}
                        className="min-h-[170px] text-[16px]"
                      />
                      <span className="text-right text-sm text-muted-foreground">{text.length} / 1000</span>
                      <p className="text-sm text-muted-foreground">
                        Your review, your picks above and your Yes or No are public on {name}’s profile with your first name, the city, how long the sit was and the pets.
                      </p>
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="flex gap-3 rounded-[18px] bg-muted p-4">
                      <Lock className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
                      <span className="flex flex-col gap-1">
                        <span className="text-[15px] font-bold">Only the NomadNest team sees these</span>
                        <span className="text-sm text-muted-foreground">{PRIVATE_TIP}</span>
                      </span>
                    </div>
                    {flagQuestions.map((q) => {
                      const answer = flagAnswers[q.column];
                      const flagged = isFlagRaised(q.column, answer);
                      const evidence = flagEvidence[q.column];
                      const showVaultPicker = isNomadReviewer && VAULT_ELIGIBLE_COLUMNS.has(q.column) && !!vaultPhotos?.length;
                      return (
                        <fieldset key={q.column} className="flex flex-col gap-2">
                          <legend className="mb-1 text-[16px] font-bold">{q.question}</legend>
                          <div role="radiogroup" aria-label={q.question} className="grid grid-cols-2 gap-2">
                            {(["yes", "no"] as const).map((option) => (
                              <button
                                key={option}
                                type="button"
                                role="radio"
                                aria-checked={answer === option}
                                onClick={() => setFlagAnswers((prev) => ({ ...prev, [q.column]: option }))}
                                className={choiceClass(answer === option)}
                              >
                                {option === "yes" ? "Yes" : "No"}
                              </button>
                            ))}
                          </div>
                          {flagged && (
                            <div className="flex flex-col gap-3 rounded-[18px] border border-[var(--nn-border)] bg-muted/50 p-4">
                              <span className="text-[15px] font-bold">Thanks for telling us. What happened?</span>
                              {showVaultPicker && (
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-sm font-semibold">Attach from your Arrival Check-In photos</span>
                                  <div className="flex flex-wrap gap-2">
                                    {vaultPhotos!.map((vp) => (
                                      <button
                                        key={vp.id}
                                        type="button"
                                        onClick={() =>
                                          setFlagEvidence((prev) => ({
                                            ...prev,
                                            [q.column]: { reasonText: prev[q.column]?.reasonText || "", vaultPhotoPath: vp.path, photoFile: undefined },
                                          }))
                                        }
                                        className={cn(
                                          "h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 bg-muted",
                                          evidence?.vaultPhotoPath === vp.path ? "border-[var(--nn-accent)]" : "border-transparent",
                                        )}
                                        aria-label="Attach this Arrival Check-In photo"
                                        aria-pressed={evidence?.vaultPhotoPath === vp.path}
                                      >
                                        {vp.signedUrl && <img src={vp.signedUrl} alt="" className="h-full w-full object-cover" />}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex flex-col gap-1">
                                <label htmlFor={`evidence-reason-${q.column}`} className="text-sm font-semibold">
                                  Reason (optional)
                                </label>
                                <Textarea
                                  id={`evidence-reason-${q.column}`}
                                  value={evidence?.reasonText || ""}
                                  onChange={(e) =>
                                    setFlagEvidence((prev) => ({
                                      ...prev,
                                      [q.column]: { reasonText: e.target.value, vaultPhotoPath: prev[q.column]?.vaultPhotoPath, photoFile: prev[q.column]?.photoFile },
                                    }))
                                  }
                                  placeholder="What happened?"
                                  rows={3}
                                  maxLength={500}
                                  className="text-[15px]"
                                />
                                <span className="text-right text-sm text-muted-foreground">{(evidence?.reasonText || "").length} / 500</span>
                              </div>
                              {evidence?.photoFile ? (
                                <div className="flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-2">
                                  <span className="min-w-0 truncate text-sm">{evidence.photoFile.name}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFlagEvidence((prev) => ({
                                        ...prev,
                                        [q.column]: { ...prev[q.column], reasonText: prev[q.column]?.reasonText || "", photoFile: undefined },
                                      }))
                                    }
                                    aria-label="Remove photo"
                                    className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                </div>
                              ) : (
                                <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--nn-border)] px-4 text-sm font-semibold text-muted-foreground hover:bg-card">
                                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                                  Add photo
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      setFlagEvidence((prev) => ({
                                        ...prev,
                                        [q.column]: { reasonText: prev[q.column]?.reasonText || "", photoFile: file, vaultPhotoPath: undefined },
                                      }));
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          )}
                        </fieldset>
                      );
                    })}
                    {isNomadReviewer && (
                      <fieldset className="flex flex-col gap-2">
                        <legend className="mb-1 text-[16px] font-bold">{HOMEOWNER_QUESTION.question}</legend>
                        <div role="radiogroup" aria-label={HOMEOWNER_QUESTION.question} className="grid grid-cols-3 gap-2">
                          {HOMEOWNER_QUESTION.options.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-checked={flagAnswers[HOMEOWNER_QUESTION.column] === option.value}
                              onClick={() => setFlagAnswers((prev) => ({ ...prev, [HOMEOWNER_QUESTION.column]: option.value }))}
                              className={choiceClass(flagAnswers[HOMEOWNER_QUESTION.column] === option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {!posted && (
            <div className="flex flex-col gap-2 border-t border-[var(--nn-border)] px-5 py-3 md:px-7 md:py-4">
              {step === 1 && !allRated && (
                <span className="text-center text-sm font-semibold text-muted-foreground" aria-live="polite">
                  Rate all 5 to continue · {rated} of 5 done
                </span>
              )}
              <div className="flex gap-2">
                {step > 1 && (
                  <button type="button" onClick={() => setStep(step - 1)} className={nnButton("secondary", "h-[52px] rounded-[14px] px-6 text-base")}>
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (step === 3 ? void handleSubmit() : setStep(step + 1))}
                  disabled={(step === 1 && !allRated) || loading}
                  aria-disabled={step === 1 && !allRated}
                  className={cn(
                    nnButton("primary", "h-[52px] flex-1 rounded-[14px] text-base"),
                    step === 1 && !allRated && "bg-muted text-muted-foreground opacity-100",
                  )}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {step === 3 ? "Post review" : step === 2 && !text.trim() ? "Skip" : "Next"}
                </button>
              </div>
            </div>
          )}
        </RoleTheme>
      </DialogContent>
    </Dialog>
  );
};

export default WriteReviewDialog;
