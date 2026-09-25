import { useState, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  Calendar,
  Check,
  ChevronLeft,
  Loader2,
  Lock,
  MapPin,
  PawPrint,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApplicationSubmission, MAX_ACTIVE_APPLICANTS } from "@/hooks/useApplicationSubmission";
import {
  useAiCowriter,
  AiCowriterError,
  AI_COWRITER_NOTE_MAX_LENGTH,
  AI_COWRITER_MAX_HIGHLIGHTS,
} from "@/hooks/useAiCowriter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";

interface SitDate {
  id: string;
  start_date: string;
  end_date: string;
  flexibility: string | null;
}

interface ApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingTitle: string;
  /** Date ranges the nomad picked on the listing page — pre-selected here; one application per ticked range. */
  sitDates: SitDate[];
  onSuccess?: () => void;
  /** Optional listing summary shown on the message step. */
  listingPhoto?: string | null;
  listingLocation?: string | null;
  petNames?: string[];
}

const AI_DRAFT_STATUS_MESSAGES = [
  "Reading the listing…",
  "Getting to know the pets…",
  "Writing your draft…",
  "Almost there…",
];
const AI_DRAFT_STATUS_INTERVAL_MS = 4000;

const HIGHLIGHT_OPTIONS = [
  "Experienced with this pet type",
  "Flexible schedule",
  "Work from home",
  "Pet first aid trained",
  "Have references",
  "Local to the area",
  "Long-term availability",
  "Previous housesitting experience",
];

const WHO_OPTIONS = ["Just me", "Couple", "Family", "Friends", "Other"] as const;

type Step = 1 | 2;
const STEP_TITLES: Record<Step, string> = { 1: "Dates and you", 2: "Your message" };

const formatRange = (d: SitDate) => {
  const start = parseISO(d.start_date);
  const end = parseISO(d.end_date);
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${format(start, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
};

const formatShortRange = (d: SitDate) =>
  `${format(parseISO(d.start_date), "d MMM")} – ${format(parseISO(d.end_date), "d MMM")}`;

const nightsBetween = (d: SitDate) =>
  Math.max(0, differenceInCalendarDays(parseISO(d.end_date), parseISO(d.start_date)));

export const ApplyDialog = ({
  open,
  onOpenChange,
  listingId,
  listingTitle,
  sitDates,
  onSuccess,
  listingPhoto,
  listingLocation,
  petNames,
}: ApplyDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    hasAccess,
    membershipLoading,
    verificationData,
    verificationLoading,
    checkApplicability,
    submitApplications,
  } = useApplicationSubmission();

  const [step, setStep] = useState<Step>(1);
  const [message, setMessage] = useState("");
  const [whoChoice, setWhoChoice] = useState("");
  const [whoOther, setWhoOther] = useState("");
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>([]);
  const [customHighlight, setCustomHighlight] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState<Set<string>>(new Set());
  const [fullDates, setFullDates] = useState<Set<string>>(new Set());
  const [checkingApplication, setCheckingApplication] = useState(false);
  const [hadPastApplication, setHadPastApplication] = useState(false);
  const [selectedDateIds, setSelectedDateIds] = useState<Set<string>>(new Set());
  const { visible: aiVisible, remaining: aiRemaining, draft: aiDraft } = useAiCowriter();
  const [aiNote, setAiNote] = useState("");
  const [hasAiDraft, setHasAiDraft] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [aiStatusIndex, setAiStatusIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // "Who's applying" is stored as plain text, exactly as before.
  const whoApplying = whoChoice === "Other" ? whoOther : whoChoice;

  // Step through the status messages while a draft is generating, then hold
  // on the last one ("Almost there…") rather than looping back to the start.
  useEffect(() => {
    if (!aiDraft.isPending) {
      setAiStatusIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setAiStatusIndex((i) => Math.min(i + 1, AI_DRAFT_STATUS_MESSAGES.length - 1));
    }, AI_DRAFT_STATUS_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [aiDraft.isPending]);

  const applicableDates = sitDates.filter(
    (d) => !alreadyApplied.has(d.id) && !fullDates.has(d.id),
  );
  const hasExistingApplication = sitDates.length > 0 && applicableDates.length === 0;
  // Only the ranges the Nomad keeps ticked are submitted (and sent to the AI).
  const datesToSubmit = applicableDates.filter((d) => selectedDateIds.has(d.id));

  // Check for existing applications / full rounds when dialog opens
  useEffect(() => {
    const checkExisting = async () => {
      if (!open || !user || sitDates.length === 0) return;

      setCheckingApplication(true);
      const result = await checkApplicability(listingId, sitDates);
      setAlreadyApplied(result.alreadyApplied);
      setFullDates(result.fullDates);
      setHadPastApplication(result.hadPastApplication);
      setCheckingApplication(false);
    };

    checkExisting();
  }, [open, user, listingId, sitDates, checkApplicability]);

  // Pre-select every range picked on the listing page that can still be applied for.
  useEffect(() => {
    setSelectedDateIds(
      new Set(
        sitDates.filter((d) => !alreadyApplied.has(d.id) && !fullDates.has(d.id)).map((d) => d.id),
      ),
    );
  }, [sitDates, alreadyApplied, fullDates]);

  // Every time the dialog opens, start on step 1.
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  // Move focus to the current heading when the step changes, and when the
  // screen swaps (e.g. "Checking your dates…" → step 1, or a gate appearing).
  const screenKey = `${membershipLoading}-${verificationLoading}-${checkingApplication}-${step}`;
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [screenKey, open]);

  const toggleDate = (id: string) => {
    setSelectedDateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleHighlight = (highlight: string) => {
    setSelectedHighlights((prev) =>
      prev.includes(highlight)
        ? prev.filter((h) => h !== highlight)
        : [...prev, highlight]
    );
  };

  const addCustomHighlight = () => {
    if (customHighlight.trim() && !selectedHighlights.includes(customHighlight.trim())) {
      setSelectedHighlights((prev) => [...prev, customHighlight.trim()]);
      setCustomHighlight("");
    }
  };

  // Fills the message box with an AI draft for the Nomad to edit. Never submits.
  const generateAiDraft = async () => {
    try {
      const result = await aiDraft.mutateAsync({
        listingId,
        sitDateIds: datesToSubmit.map((d) => d.id),
        note: aiNote,
        highlights: selectedHighlights.slice(0, AI_COWRITER_MAX_HIGHLIGHTS),
      });
      setMessage(result.draft);
      setHasAiDraft(true);
    } catch (error) {
      const status = error instanceof AiCowriterError ? error.status : null;
      toast({
        title:
          status === 429
            ? "Daily AI draft limit reached"
            : status === 504
              ? "Taking longer than usual"
              : "Couldn't draft your application",
        description:
          error instanceof AiCowriterError
            ? error.message
            : "Please try again in a moment, or write it yourself.",
        variant: "destructive",
      });
    }
  };

  const handleAiDraftClick = () => {
    if (message.trim()) {
      setConfirmReplaceOpen(true);
      return;
    }
    generateAiDraft();
  };

  const handleSubmit = async () => {
    if (!user || datesToSubmit.length === 0) return;
    if (!message.trim()) {
      toast({
        title: "Message required",
        description: "Please introduce yourself to the Pet Parent before applying.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await submitApplications({
        listingId,
        listingTitle,
        dates: datesToSubmit,
        message,
        whoApplying,
        highlights: selectedHighlights,
      });

      toast({
        title:
          datesToSubmit.length > 1
            ? `${datesToSubmit.length} applications sent!`
            : "Application sent!",
        description: "The Pet Parent will review your application soon.",
      });

      setMessage("");
      setAiNote("");
      setHasAiDraft(false);
      setWhoChoice("");
      setWhoOther("");
      setSelectedHighlights([]);
      setStep(1);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error applying:", error);
      toast({
        title: "Failed to apply",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Which screen to show ──────────────────────────────────────────────────

  const showMembershipGate = !membershipLoading && !hasAccess("sitter");
  const showVerificationGate =
    !showMembershipGate && !verificationLoading && !verificationData?.id_verified;
  const showForm =
    !showMembershipGate && !showVerificationGate && !checkingApplication && !hasExistingApplication;

  const step1Valid = datesToSubmit.length > 0;
  const step2Valid = message.trim().length > 0;
  const customHighlights = selectedHighlights.filter((h) => !HIGHLIGHT_OPTIONS.includes(h));

  const goTo = (next: Step) => setStep(next);

  // ─── Pieces ────────────────────────────────────────────────────────────────

  const heading = (text: string, className?: string) => (
    <h2
      ref={headingRef}
      tabIndex={-1}
      className={cn(
        "font-display text-xl font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm",
        className,
      )}
    >
      {text}
    </h2>
  );

  const gateCard = ({
    icon,
    title,
    body,
    action,
  }: {
    icon: ReactNode;
    title: string;
    body: string;
    action?: { label: string; onClick: () => void };
  }) => (
    <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        {heading(title, "text-lg")}
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        {action && (
          <Button className="mt-6 w-full" size="lg" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );

  const progress = (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>Step {step} of 2</span>
        <span className="truncate pl-4 pr-8 sm:pr-6">{listingTitle}</span>
      </div>
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={2}
        aria-valuenow={step}
        aria-label={`Step ${step} of 2`}
      >
        {[1, 2].map((s) => (
          <div
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              s <= step ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
      {heading(STEP_TITLES[step])}
      {step === 2 && (
        <p className="-mt-1 text-sm text-muted-foreground">
          {aiVisible
            ? "Write it yourself, or let AI write a first draft you can edit."
            : "Tell the Pet Parent a little about you and why you'd love this sit."}
        </p>
      )}
    </div>
  );

  const sectionLabel = (text: string, extra?: ReactNode, htmlFor?: string) => (
    <div className="flex items-center gap-1.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
          {text}
        </Label>
      ) : (
        <h3 className="text-sm font-semibold text-foreground">{text}</h3>
      )}
      {extra}
    </div>
  );

  const stepOne = (
    <div className="space-y-8">
      {/* Dates */}
      <section className="space-y-3" aria-label="Dates">
        {sectionLabel(
          "Dates",
          applicableDates.length > 1 ? (
            <HelpTooltip
              label="About multiple date ranges"
              content="A separate application is sent for each date range you keep ticked."
            />
          ) : undefined,
        )}
        <div className="grid gap-3">
          {sitDates.map((d) => {
            const unavailable = alreadyApplied.has(d.id) || fullDates.has(d.id);
            const selected = selectedDateIds.has(d.id);
            const nights = nightsBetween(d);
            return (
              <button
                key={d.id}
                type="button"
                role="checkbox"
                aria-checked={unavailable ? false : selected}
                aria-disabled={unavailable}
                disabled={unavailable}
                onClick={() => toggleDate(d.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  unavailable
                    ? "cursor-not-allowed border-dashed bg-muted/40 text-muted-foreground"
                    : selected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "bg-card hover:border-primary/40",
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    unavailable ? "bg-muted" : "bg-primary/10 text-primary",
                  )}
                >
                  <Calendar className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{formatRange(d)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {nights} night{nights === 1 ? "" : "s"}
                    </span>
                    {d.flexibility && (
                      <Badge variant="secondary" className="font-normal capitalize">
                        {d.flexibility.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {unavailable && (
                      <Badge variant="outline" className="font-normal">
                        {alreadyApplied.has(d.id) ? "Already applied" : "Full"}
                      </Badge>
                    )}
                  </div>
                </div>
                {!unavailable && (
                  <div
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                    )}
                    aria-hidden="true"
                  >
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {hadPastApplication && (
          <p className="text-xs text-muted-foreground">
            You applied for these dates before. You're welcome to apply again.
          </p>
        )}
        {fullDates.size > 0 && (
          <p className="text-xs text-muted-foreground">
            "Full" means {MAX_ACTIVE_APPLICANTS} Nomads are already under review for that range.
          </p>
        )}
      </section>

      {/* Who's coming */}
      <section className="space-y-3" aria-label="Who's coming">
        {sectionLabel(
          "Who's coming?",
          <span className="text-xs font-normal text-muted-foreground">Optional</span>,
        )}
        <ToggleGroup
          type="single"
          value={whoChoice}
          onValueChange={(v) => setWhoChoice(v)}
          className="flex flex-wrap justify-start gap-2"
          aria-label="Who's coming"
        >
          {WHO_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              variant="outline"
              className="h-10 rounded-full px-4 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {option}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {whoChoice === "Other" && (
          <Input
            aria-label="Who's coming"
            placeholder="e.g., Me and my sister"
            value={whoOther}
            onChange={(e) => setWhoOther(e.target.value)}
            className="max-w-sm"
          />
        )}
      </section>

      {/* Highlights */}
      <section className="space-y-3" aria-label="Why you're a great fit">
        {sectionLabel(
          "Why you're a great fit",
          <span className="text-xs font-normal text-muted-foreground">Optional</span>,
        )}
        <div className="flex flex-wrap gap-2">
          {HIGHLIGHT_OPTIONS.map((highlight) => {
            const on = selectedHighlights.includes(highlight);
            return (
              <button
                key={highlight}
                type="button"
                aria-pressed={on}
                onClick={() => toggleHighlight(highlight)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-foreground hover:border-primary/40",
                )}
              >
                {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                {highlight}
              </button>
            );
          })}
          {customHighlights.map((highlight) => (
            <button
              key={highlight}
              type="button"
              onClick={() => toggleHighlight(highlight)}
              aria-label={`Remove ${highlight}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary px-3.5 py-2 text-sm text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {highlight}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="flex max-w-sm gap-2">
          <Input
            aria-label="Add your own highlight"
            placeholder="Add your own"
            value={customHighlight}
            onChange={(e) => setCustomHighlight(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomHighlight())}
          />
          <Button
            type="button"
            variant="outline"
            onClick={addCustomHighlight}
            disabled={!customHighlight.trim()}
            className="shrink-0 gap-1"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </Button>
        </div>
      </section>
    </div>
  );

  const summaryParts = [
    datesToSubmit.map(formatShortRange).join(", "),
    whoApplying.trim() || null,
    selectedHighlights.length > 0
      ? `${selectedHighlights.length} highlight${selectedHighlights.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  const stepTwo = (
    <div className="space-y-6">
      {/* Slim summary of step 1 */}
      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3 text-sm">
        <p className="min-w-0 text-muted-foreground">
          <span className="sr-only">Your choices: </span>
          {summaryParts.join(" · ")}
        </p>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto shrink-0 p-0"
          onClick={() => goTo(1)}
        >
          Edit<span className="sr-only"> dates and details</span>
        </Button>
      </div>

      {/* Listing summary */}
      {(listingPhoto || listingLocation || (petNames && petNames.length > 0)) && (
        <div className="flex items-center gap-4 rounded-xl border bg-card p-3 shadow-sm">
          {listingPhoto ? (
            <img
              src={listingPhoto}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
              <PawPrint className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="truncate font-medium text-foreground">{listingTitle}</p>
            {listingLocation && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{listingLocation}</span>
              </p>
            )}
            {petNames && petNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {petNames.map((name) => (
                  <Badge key={name} variant="secondary" className="gap-1 font-normal">
                    <PawPrint className="h-3 w-3" aria-hidden="true" />
                    {name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Co-Writer */}
      {aiVisible && (
        <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Draft it with AI</h3>
            {aiRemaining !== null && (
              <span className="ml-auto text-xs text-muted-foreground">
                {aiRemaining === 0 ? "None left today" : `${aiRemaining} left today`}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-note" className="text-xs font-normal text-muted-foreground">
              Optional: anything you'd like mentioned?
            </Label>
            <Input
              id="ai-note"
              value={aiNote}
              onChange={(e) => setAiNote(e.target.value.slice(0, AI_COWRITER_NOTE_MAX_LENGTH))}
              maxLength={AI_COWRITER_NOTE_MAX_LENGTH}
              placeholder="e.g., mention I work remotely"
              disabled={aiDraft.isPending}
              className="bg-background"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleAiDraftClick}
            disabled={aiDraft.isPending || aiRemaining === 0}
            className="w-full gap-2 bg-background"
          >
            {aiDraft.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span aria-live="polite">{AI_DRAFT_STATUS_MESSAGES[aiStatusIndex]}</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Write my draft with AI
              </>
            )}
          </Button>
          {aiRemaining === 0 && (
            <p className="text-xs text-muted-foreground">
              You've used all your AI drafts for today. More will be available within 24 hours.
            </p>
          )}
        </div>
      )}

      {/* Divider: AI is one option, writing it yourself is the other */}
      {aiVisible && (
        <div className="flex items-center gap-3" role="separator" aria-label="or write it yourself">
          <div className="h-px flex-1 bg-border" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">or write it yourself</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {/* Message */}
      <section className="space-y-2">
        {sectionLabel(
          "Your message",
          <>
            <span className="text-destructive" aria-hidden="true">*</span>
            <HelpTooltip
              label="Tips for your message"
              content="Introduce yourself, share your experience with pets, and say why this sit suits you. A personal message helps your application stand out."
            />
          </>,
          "message",
        )}
        <Textarea
          id="message"
          placeholder="Hi, I'm... Tell them about you, your experience and why this sit suits you."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          readOnly={aiDraft.isPending}
          aria-required="true"
          rows={isMobile ? 9 : hasAiDraft ? 12 : 8}
          className="resize-none rounded-xl text-base leading-relaxed sm:text-sm"
        />
        {hasAiDraft && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            AI draft. Please review and make it your own before sending.
          </p>
        )}
      </section>
    </div>
  );

  // ─── Footer (one primary action per step) ──────────────────────────────────

  const footerHint =
    step === 1 && !step1Valid
      ? "Pick at least one date range."
      : step === 2 && !step2Valid
        ? "Write a short message to send."
        : null;

  const footer = (
    <div className="border-t bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      {footerHint && (
        <p className="mb-2 text-center text-xs text-muted-foreground sm:text-right" aria-live="polite">
          {footerHint}
        </p>
      )}
      <div className="flex items-center gap-3">
        {step === 2 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => goTo(1)}
            disabled={isSubmitting}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Button>
        )}
        {step === 1 ? (
          <Button
            type="button"
            size="lg"
            className="ml-auto w-full sm:w-auto sm:min-w-40"
            onClick={() => goTo(2)}
            disabled={!step1Valid}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="ml-auto flex-1 sm:flex-none sm:min-w-48"
            onClick={handleSubmit}
            disabled={!step1Valid || !step2Valid || isSubmitting || aiDraft.isPending}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : datesToSubmit.length > 1 ? (
              `Send ${datesToSubmit.length} applications`
            ) : (
              "Send application"
            )}
          </Button>
        )}
      </div>
    </div>
  );

  // ─── Body ──────────────────────────────────────────────────────────────────

  let body: ReactNode;
  if (showMembershipGate) {
    body = gateCard({
      icon: <Lock className="h-6 w-6" aria-hidden="true" />,
      title: "Become a Nomad member",
      body: "A Nomad or Combined membership lets you apply for sits.",
      action: {
        label: "View membership plans",
        onClick: () => { onOpenChange(false); navigate("/membership"); },
      },
    });
  } else if (showVerificationGate) {
    body = gateCard({
      icon: <ShieldCheck className="h-6 w-6" aria-hidden="true" />,
      title: "Verify your ID to apply",
      body: "It takes about 5 minutes and keeps the community safe.",
      action: {
        label: "Verify my identity",
        onClick: () => { onOpenChange(false); navigate("/verify-identity"); },
      },
    });
  } else if (checkingApplication) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        {heading("Checking your dates…", "text-base font-medium text-muted-foreground")}
      </div>
    );
  } else if (hasExistingApplication) {
    body = gateCard({
      icon: <Star className="h-6 w-6" aria-hidden="true" />,
      title: "These dates aren't available",
      body: `You've already applied, or ${MAX_ACTIVE_APPLICANTS} Nomads are already under review. Try other dates or check back soon.`,
      action: { label: "Choose other dates", onClick: () => onOpenChange(false) },
    });
  } else {
    body = (
      <>
        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-5 sm:px-6">
          {progress}
          <div className="mt-6">{step === 1 ? stepOne : stepTwo}</div>
        </div>
        {footer}
      </>
    );
  }

  const content = (
    <>
      {body}
      <AlertDialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your message?</AlertDialogTitle>
            <AlertDialogDescription>
              The AI draft will replace what you've already written in the message box.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my message</AlertDialogCancel>
            <AlertDialogAction onClick={generateAiDraft}>Replace with AI draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  // Focus the visible heading on open instead of the first input.
  const focusHeading = (e: Event) => {
    e.preventDefault();
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          onOpenAutoFocus={focusHeading}
          className="flex h-[100dvh] flex-col gap-0 p-0"
        >
          <SheetTitle className="sr-only">Apply for {listingTitle}</SheetTitle>
          <SheetDescription className="sr-only">
            {showForm ? `Step ${step} of 2: ${STEP_TITLES[step]}` : "Application"}
          </SheetDescription>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={focusHeading}
        className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Apply for {listingTitle}</DialogTitle>
        <DialogDescription className="sr-only">
          {showForm ? `Step ${step} of 2: ${STEP_TITLES[step]}` : "Application"}
        </DialogDescription>
        {content}
      </DialogContent>
    </Dialog>
  );
};
