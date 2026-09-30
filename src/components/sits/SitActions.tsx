import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useOpenSitChat } from "@/hooks/useSitActions";
import { differenceInCalendarDays, format, parseISO, startOfToday } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  BookOpen,
  Calendar,
  CalendarClock,
  CalendarDays,
  Camera,
  CheckCircle,
  Eye,
  MessageSquare,
  MoreVertical,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DatePickerCalendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { AskNestSheet } from "@/components/welcome-guide/AskNestSheet";
import { nnButton } from "@/components/nn/ui";
import { useUpdateSitStatus, type Sit } from "@/hooks/useSits";
import {
  useLatestDeclinedReschedule,
  useProposeSitReschedule,
  useRespondToSitReschedule,
  useSitRescheduleRequest,
} from "@/hooks/useSitReschedule";
import { useSendMessage } from "@/hooks/useConversations";
import { useMyGuideWindows } from "@/hooks/useSitterGuide";
import { useAskNestAvailable } from "@/hooks/useAskNest";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveListingConversation } from "@/lib/conversations";
import { NOMAD_FLAG_QUESTIONS } from "@/lib/trustFlags";
import { sitTiming } from "@/lib/sitTiming";
import { cn } from "@/lib/utils";

/**
 * A sit's actions, shared by the dashboard sit cards and My sits (they used
 * to live in the old dashboard Sits card, SitCard).
 */

export type SitMenuItem = "message" | "arrival" | "guide" | "askNest" | "listing" | "propose" | "sitPage" | "mySits";

/**
 * The ⋮ "More actions" menu for a sit. Items only show when they apply to the
 * member (Arrival Check-In, Welcome Guide and Ask the Nest for the Nomad;
 * Propose new dates for the Pet Parent). Cancel sit is always last, in red,
 * with the same flow as before. Nothing shows for a sit whose other member
 * left NomadNest.
 */
export const SitMoreMenu = ({
  sit,
  items,
  className,
  keepAfterSit = false,
}: {
  sit: Sit;
  items: SitMenuItem[];
  className?: string;
  /** The sit page keeps the menu after the sit (View listing, My sits); actions that need a live sit still hide. */
  keepAfterSit?: boolean;
}) => {
  const { user } = useAuth();
  const location = useLocation();
  const isOwner = sit.owner_user_id === user?.id;
  const isSitter = sit.sitter_user_id === user?.id;
  const t = sitTiming(sit);
  const { data: guideWindows = [] } = useMyGuideWindows();
  const guideWindow = isSitter ? guideWindows.find((w) => w.sit_id === sit.id) : undefined;
  const askNestAvailable = useAskNestAvailable();
  const { data: pendingRequest } = useSitRescheduleRequest(sit.id);
  const chat = useOpenSitChat(sit);
  const other = (isOwner ? sit.sitter_profile : sit.owner_profile)?.first_name;
  const [askOpen, setAskOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);

  const live = !t.otherLeft && (sit.status === "confirmed" || sit.status === "in_progress") && !t.isFinished;
  if (!live && !keepAfterSit) return null;
  const has = (i: SitMenuItem) => items.includes(i);
  const from = `${location.pathname}${location.search}${location.hash}`;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More actions for this sit"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--nn-border)] bg-card text-foreground hover:bg-[var(--nn-soft)]",
              className,
            )}
          >
            <MoreVertical className="h-5 w-5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          {has("message") && live && (
            <DropdownMenuItem disabled={chat.opening} onSelect={chat.open} className="min-h-[44px]">
              <MessageSquare className="mr-2 h-4 w-4" />
              Message {other ?? (isOwner ? "your Nomad" : "your Pet Parent")}
            </DropdownMenuItem>
          )}
          {has("sitPage") && (
            <DropdownMenuItem asChild className="min-h-[44px]">
              <Link to={`/sits/${sit.id}`}>
                <Calendar className="mr-2 h-4 w-4" />
                Sit page
              </Link>
            </DropdownMenuItem>
          )}
          {has("arrival") && isSitter && (
            <DropdownMenuItem asChild className="min-h-[44px]">
              <Link to={`/sits/${sit.id}/arrival-vault`} state={{ from }}>
                <Camera className="mr-2 h-4 w-4" />
                Arrival Check-In
              </Link>
            </DropdownMenuItem>
          )}
          {has("guide") && guideWindow && (
            <DropdownMenuItem asChild className="min-h-[44px]">
              <Link to={`/listing/${sit.listing_id}/welcome-guide`}>
                <BookOpen className="mr-2 h-4 w-4" />
                Welcome Guide
              </Link>
            </DropdownMenuItem>
          )}
          {has("askNest") && guideWindow && askNestAvailable && (
            <DropdownMenuItem onSelect={() => setAskOpen(true)} className="min-h-[44px]">
              <Sparkles className="mr-2 h-4 w-4" />
              Ask the Nest
            </DropdownMenuItem>
          )}
          {has("propose") && live && isOwner && !pendingRequest && (
            <DropdownMenuItem onSelect={() => setProposeOpen(true)} className="min-h-[44px]">
              <CalendarClock className="mr-2 h-4 w-4" />
              Propose new dates
            </DropdownMenuItem>
          )}
          {has("listing") && sit.listing_id && (
            <DropdownMenuItem asChild className="min-h-[44px]">
              <Link to={`/listing/${sit.listing_id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View listing
              </Link>
            </DropdownMenuItem>
          )}
          {has("mySits") && (
            <DropdownMenuItem asChild className="min-h-[44px]">
              <Link to={`/my-sits?as=${isOwner ? "owner" : "sitter"}`}>
                <CalendarDays className="mr-2 h-4 w-4" />
                My sits
              </Link>
            </DropdownMenuItem>
          )}
          {t.canCancel && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCancelOpen(true)} className="min-h-[44px] text-destructive focus:text-destructive">
                <XCircle className="mr-2 h-4 w-4" />
                Cancel sit
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {guideWindow && askNestAvailable && (
        <AskNestSheet listingId={sit.listing_id} open={askOpen} onOpenChange={setAskOpen} />
      )}
      {isOwner && <ProposeDatesDialog sit={sit} open={proposeOpen} onOpenChange={setProposeOpen} />}
      {t.canCancel && <CancelSitDialog sit={sit} open={cancelOpen} onOpenChange={setCancelOpen} />}
    </>
  );
};

/** The Pet Parent proposes new dates; the Nomad accepts or declines. */
const ProposeDatesDialog = ({ sit, open, onOpenChange }: { sit: Sit; open: boolean; onOpenChange: (open: boolean) => void }) => {
  const proposeReschedule = useProposeSitReschedule();
  const [proposedRange, setProposedRange] = useState<DateRange | undefined>(undefined);
  const [proposeNote, setProposeNote] = useState("");

  const handlePropose = () => {
    if (!proposedRange?.from || !proposedRange?.to) return;
    proposeReschedule.mutate({
      sitId: sit.id,
      sitterUserId: sit.sitter_user_id,
      listingTitle: sit.listing?.title || "your sit",
      proposedStartDate: format(proposedRange.from, "yyyy-MM-dd"),
      proposedEndDate: format(proposedRange.to, "yyyy-MM-dd"),
      note: proposeNote,
    });
    setProposedRange(undefined);
    setProposeNote("");
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Propose new dates</AlertDialogTitle>
          <AlertDialogDescription>
            Suggest new dates for this sit. The Nomad will be notified and can accept or decline.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start font-normal">
              <Calendar className="mr-2 h-4 w-4" />
              {proposedRange?.from
                ? proposedRange.to
                  ? `${format(proposedRange.from, "MMM d")} - ${format(proposedRange.to, "MMM d, yyyy")}`
                  : format(proposedRange.from, "MMM d, yyyy")
                : "Select new dates"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <DatePickerCalendar
              mode="range"
              selected={proposedRange}
              onSelect={setProposedRange}
              numberOfMonths={2}
              disabled={{ before: new Date() }}
            />
          </PopoverContent>
        </Popover>
        <Textarea value={proposeNote} onChange={(e) => setProposeNote(e.target.value)} placeholder="Add a short note (optional)" rows={2} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!proposedRange?.from || !proposedRange?.to || proposeReschedule.isPending}
            onClick={handlePropose}
          >
            Propose Dates
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/**
 * Cancel a sit. The same flow as before (moved unchanged from the old
 * dashboard Sits card): a required reason, the dates to reopen after a
 * declined reschedule, and for a sit already under way whether to reopen the
 * dates plus the private abandonment question. The reason is also posted in
 * the sit's chat.
 */
const CancelSitDialog = ({ sit, open, onOpenChange }: { sit: Sit; open: boolean; onOpenChange: (open: boolean) => void }) => {
  const { mutate: updateStatus } = useUpdateSitStatus();
  const sendMessage = useSendMessage();
  const { user } = useAuth();
  const other = (sit.owner_user_id === user?.id ? sit.sitter_profile : sit.owner_profile)?.first_name || "The other member";
  // Same rule as the server (handle_sit_cancellation_trust): a strike goes to
  // whoever cancels when the sit starts in 0 to 14 days.
  const daysToStart = sit.sit_dates ? differenceInCalendarDays(parseISO(sit.sit_dates.start_date), startOfToday()) : null;
  const addsStrike = daysToStart !== null && daysToStart >= 0 && daysToStart <= 14;
  const { data: declinedRequest } = useLatestDeclinedReschedule(sit.id);
  const [cancelReason, setCancelReason] = useState("");
  const [reopenChoice, setReopenChoice] = useState<"original" | "proposed">("proposed");
  const [abandonmentAnswer, setAbandonmentAnswer] = useState<"yes" | "no" | undefined>(undefined);
  const [abandonmentNote, setAbandonmentNote] = useState("");
  const [republishDates, setRepublishDates] = useState<"yes" | "no" | undefined>(undefined);

  // Closing the Cancel dialog (whether by submitting, "Keep Sit", or
  // clicking away) always clears its fields, so reopening it never shows
  // a stale reason/answer from a previous attempt.
  const resetCancelDialogState = () => {
    setCancelReason("");
    setAbandonmentAnswer(undefined);
    setAbandonmentNote("");
    setRepublishDates(undefined);
  };

  // A declined reschedule proposal means the sit's original dates aren't
  // necessarily what should reopen for a new Nomad — let the owner pick.
  // "original" means the sit's existing sit_dates row is reopened directly
  // (no reopenWith), rather than inserting a duplicate of the same dates.
  const handleCancel = () => {
    if (!cancelReason.trim()) return;
    if (sit.status === "in_progress" && !republishDates) return;
    let reopenWith: { start_date: string; end_date: string } | undefined;
    if (declinedRequest && reopenChoice === "proposed") {
      reopenWith = {
        start_date: declinedRequest.proposed_start_date,
        end_date: declinedRequest.proposed_end_date,
      };
    }
    const reason = cancelReason.trim();
    const flagAbandonment = sit.status === "in_progress" && abandonmentAnswer === "yes";
    const note = abandonmentNote;
    // Only asked (and only ever "no") for an in-progress cancellation —
    // a pre-start cancel always reopens the dates, same as always.
    const reopenStatus: "open" | "closed" = sit.status === "in_progress" && republishDates === "no" ? "closed" : "open";
    updateStatus(
      {
        sitId: sit.id,
        sitDatesId: sit.sit_dates_id,
        status: "cancelled",
        reason,
        reopenWith,
        reopenStatus,
      },
      {
        onSuccess: async () => {
          if (flagAbandonment) {
            try {
              await supabase.rpc("log_sit_abandonment_flag", {
                p_sit_id: sit.id,
                p_note: note.trim() || null,
              });
            } catch (err) {
              console.warn("Failed to log sit abandonment flag:", err);
            }
          }

          // Post the reason into the actual chat thread too, not just the
          // notification — a failure here must never revert the
          // cancellation, which has already gone through above.
          try {
            const conversationId = await resolveListingConversation({
              listingId: sit.listing_id,
              ownerUserId: sit.owner_user_id,
              sitterUserId: sit.sitter_user_id,
            });
            if (conversationId) {
              await sendMessage.mutateAsync({
                conversationId,
                body: `I've had to cancel this sit. Reason: ${reason}`,
              });
            }
          } catch (err) {
            console.warn("Failed to post cancellation message to chat:", err);
          }
        },
      },
    );
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetCancelDialogState();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this sit?</AlertDialogTitle>
          <p role="note" className="rounded-xl bg-[var(--nn-warn-bg)] px-3.5 py-3 text-left text-sm font-medium text-foreground">
            {addsStrike
              ? `Cancelling within 2 weeks of the start adds a strike to your reliability record. ${other} will be told straight away.`
              : `${other} will be told straight away.`}
          </p>
          <AlertDialogDescription>
            This will cancel the sit and re-open the dates. Please tell the other party why — a reason is required.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {declinedRequest && sit.sit_dates && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Which dates should become available for a new Nomad?</p>
            <RadioGroup value={reopenChoice} onValueChange={(v) => setReopenChoice(v as "original" | "proposed")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="original" id={`reopen-original-${sit.id}`} />
                <Label htmlFor={`reopen-original-${sit.id}`} className="text-sm font-normal">
                  Original dates ({format(parseISO(sit.sit_dates.start_date), "MMM d")} –{" "}
                  {format(parseISO(sit.sit_dates.end_date), "MMM d, yyyy")})
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="proposed" id={`reopen-proposed-${sit.id}`} />
                <Label htmlFor={`reopen-proposed-${sit.id}`} className="text-sm font-normal">
                  Your proposed dates ({format(parseISO(declinedRequest.proposed_start_date), "MMM d")} –{" "}
                  {format(parseISO(declinedRequest.proposed_end_date), "MMM d, yyyy")})
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}
        <Textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Why are you cancelling? (required)"
          rows={3}
        />
        {sit.status === "in_progress" && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Would you like these dates to be open again for a new Nomad to apply?</Label>
            <div className="flex gap-2">
              {(["yes", "no"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={republishDates === option ? "default" : "outline"}
                  className="h-11 flex-1 capitalize"
                  onClick={() => setRepublishDates(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
        )}
        {sit.status === "in_progress" && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm font-semibold">Private question</Label>
              <HelpTooltip
                label="About this question"
                content="This answer is never shown on anyone's profile. It only helps our community team spot repeated patterns."
              />
            </div>
            <Label className="text-sm font-medium">
              {NOMAD_FLAG_QUESTIONS.find((q) => q.category === "abandonment")?.question}
            </Label>
            <div className="flex gap-2">
              {(["yes", "no"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={abandonmentAnswer === option ? "default" : "outline"}
                  className="h-11 flex-1 capitalize"
                  onClick={() => setAbandonmentAnswer(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
            {abandonmentAnswer === "yes" && (
              <div className="space-y-1.5">
                <Label htmlFor={`abandonment-note-${sit.id}`} className="text-xs font-medium">
                  What happened? (optional)
                </Label>
                <Textarea
                  id={`abandonment-note-${sit.id}`}
                  value={abandonmentNote}
                  onChange={(e) => setAbandonmentNote(e.target.value)}
                  placeholder="What happened?"
                  rows={2}
                  maxLength={500}
                />
              </div>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Sit</AlertDialogCancel>
          <AlertDialogAction
            disabled={!cancelReason.trim() || (sit.status === "in_progress" && !republishDates)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleCancel}
          >
            Cancel Sit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/**
 * A pending date change: the Nomad sees the new dates with Accept / Decline;
 * the Pet Parent sees that it's waiting for an answer.
 */
export const SitRescheduleNotice = ({ sit, className }: { sit: Sit; className?: string }) => {
  const { user } = useAuth();
  const isOwner = sit.owner_user_id === user?.id;
  const isSitter = sit.sitter_user_id === user?.id;
  const live = sit.status === "confirmed" || sit.status === "in_progress";
  const { data: pendingRequest, isLoading } = useSitRescheduleRequest(live ? sit.id : "");
  const respond = useRespondToSitReschedule();

  if (!live || isLoading || !pendingRequest) return null;

  const dates = `${format(parseISO(pendingRequest.proposed_start_date), "d MMM")} – ${format(parseISO(pendingRequest.proposed_end_date), "d MMM")}`;
  const other = (isOwner ? sit.sitter_profile : sit.owner_profile)?.first_name || (isOwner ? "Your Nomad" : "Your Pet Parent");

  if (isOwner) {
    return (
      <div className={cn("flex flex-col gap-1 rounded-[16px] bg-muted px-3.5 py-3", className)}>
        <p className="flex items-center gap-2 text-[15px] font-bold">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          You proposed new dates
        </p>
        <p className="text-sm text-muted-foreground">
          {dates}. Waiting for {other} to answer.
        </p>
      </div>
    );
  }
  if (!isSitter) return null;

  const answer = (accept: boolean) =>
    respond.mutate({
      requestId: pendingRequest.id,
      sitId: sit.id,
      accept,
      ownerUserId: sit.owner_user_id,
      listingTitle: sit.listing?.title || "your sit",
    });

  return (
    <div className={cn("flex flex-col gap-2.5 rounded-[16px] border border-[var(--nn-border)] bg-[var(--nn-tint)] px-3.5 py-3", className)}>
      <p className="flex items-center gap-2 text-[15px] font-bold">
        <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
        {other} proposed new dates
      </p>
      <p className="text-sm">
        {dates}.{pendingRequest.note ? <span className="text-muted-foreground"> "{pendingRequest.note}"</span> : null}
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={respond.isPending} onClick={() => answer(true)} className={nnButton("primary", "flex-1")}>
          Accept new dates
        </button>
        <button type="button" disabled={respond.isPending} onClick={() => answer(false)} className={nnButton("secondary", "flex-1")}>
          Decline
        </button>
      </div>
    </div>
  );
};
