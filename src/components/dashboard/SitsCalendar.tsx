import { useMemo, useState, useEffect } from "react";
import { differenceInCalendarDays, format, isSameMonth, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval, parseISO, isAfter, isBefore, startOfToday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, CalendarClock, ChevronLeft, ChevronRight, MapPin, User, MessageSquare, CheckCircle, XCircle, Star, Bone } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { DateRange } from "react-day-picker";
import { useSits, Sit, useUpdateSitStatus } from "@/hooks/useSits";
import {
  useSitRescheduleRequest,
  useLatestDeclinedReschedule,
  useProposeSitReschedule,
  useRespondToSitReschedule,
} from "@/hooks/useSitReschedule";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DatePickerCalendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import WriteReviewDialog from "@/components/reviews/WriteReviewDialog";
import { supabase } from "@/integrations/supabase/client";
import { resolveListingConversation } from "@/lib/conversations";

interface SitsCalendarProps {
  viewAs: "sitter" | "owner";
}

const statusColors: Record<string, string> = {
  confirmed: "bg-primary/20 text-primary border-primary/30",
  in_progress: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30",
  completed: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  cancelled: "bg-destructive/20 text-destructive border-destructive/30",
};

/**
 * Propose/respond UI for a confirmed or in-progress sit's dates. Only ever
 * rendered by SitCard for those two statuses.
 */
const SitRescheduleSection = ({
  sit,
  isOwner,
  isSitter,
}: {
  sit: Sit;
  isOwner: boolean;
  isSitter: boolean;
}) => {
  const { data: pendingRequest, isLoading } = useSitRescheduleRequest(sit.id);
  const proposeReschedule = useProposeSitReschedule();
  const respondToReschedule = useRespondToSitReschedule();
  const [proposedRange, setProposedRange] = useState<DateRange | undefined>(undefined);
  const [proposeNote, setProposeNote] = useState("");

  if (isLoading) return null;

  const listingTitle = sit.listing?.title || "your sit";

  const handlePropose = () => {
    if (!proposedRange?.from || !proposedRange?.to) return;
    proposeReschedule.mutate({
      sitId: sit.id,
      sitterUserId: sit.sitter_user_id,
      listingTitle,
      proposedStartDate: format(proposedRange.from, "yyyy-MM-dd"),
      proposedEndDate: format(proposedRange.to, "yyyy-MM-dd"),
      note: proposeNote,
    });
    setProposedRange(undefined);
    setProposeNote("");
  };

  const handleRespond = (accept: boolean) => {
    if (!pendingRequest) return;
    respondToReschedule.mutate({
      requestId: pendingRequest.id,
      sitId: sit.id,
      accept,
      ownerUserId: sit.owner_user_id,
      listingTitle,
    });
  };

  // Owner, no pending request yet — offer to propose new dates.
  if (isOwner && !pendingRequest) {
    return (
      <div className="mt-3 pt-2 border-t">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="w-full">
              <CalendarClock className="w-3 h-3 mr-1" />
              Propose New Dates
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Propose new dates</AlertDialogTitle>
              <AlertDialogDescription>
                Suggest new dates for this sit. The Nomad will be notified and can accept
                or decline.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <Calendar className="w-4 h-4 mr-2" />
                  {proposedRange?.from ? (
                    proposedRange.to ? (
                      `${format(proposedRange.from, "MMM d")} - ${format(proposedRange.to, "MMM d, yyyy")}`
                    ) : (
                      format(proposedRange.from, "MMM d, yyyy")
                    )
                  ) : (
                    "Select new dates"
                  )}
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
            <Textarea
              value={proposeNote}
              onChange={(e) => setProposeNote(e.target.value)}
              placeholder="Add a short note (optional)"
              rows={2}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={
                  !proposedRange?.from || !proposedRange?.to || proposeReschedule.isPending
                }
                onClick={handlePropose}
              >
                Propose Dates
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Owner, pending request already out — quiet status, no cancel-your-own
  // proposal action for now.
  if (isOwner && pendingRequest) {
    return (
      <div className="mt-3 pt-2 border-t">
        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
          <CalendarClock className="w-3 h-3" />
          Reschedule proposed, awaiting response
        </p>
      </div>
    );
  }

  // Sitter, a pending proposal exists — show the new dates with Accept/Decline.
  if (isSitter && pendingRequest) {
    return (
      <div className="mt-3 pt-2 border-t">
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 space-y-2">
          <p className="text-xs font-medium flex items-center gap-1">
            <CalendarClock className="w-3 h-3" />
            New dates proposed
          </p>
          <p className="text-xs">
            {format(parseISO(pendingRequest.proposed_start_date), "MMM d")} –{" "}
            {format(parseISO(pendingRequest.proposed_end_date), "MMM d, yyyy")}
          </p>
          {pendingRequest.note && (
            <p className="text-xs text-muted-foreground italic">"{pendingRequest.note}"</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={respondToReschedule.isPending}
              onClick={() => handleRespond(true)}
            >
              <CheckCircle className="w-3 h-3 mr-1" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={respondToReschedule.isPending}
              onClick={() => handleRespond(false)}
            >
              <XCircle className="w-3 h-3 mr-1" />
              Decline
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export const SitCard = ({ sit, viewAs, userId }: { sit: Sit; viewAs: "sitter" | "owner"; userId: string }) => {
  const isOwner = sit.owner_user_id === userId;
  const isSitter = sit.sitter_user_id === userId;
  const otherParty = isOwner ? sit.sitter_profile : sit.owner_profile;
  const otherPartyLabel = isOwner ? "Sitter" : "Owner";
  const { mutate: updateStatus, isPending } = useUpdateSitStatus();
  const { data: declinedRequest } = useLatestDeclinedReschedule(sit.id);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [reopenChoice, setReopenChoice] = useState<"original" | "proposed">("proposed");
  const [openingChat, setOpeningChat] = useState(false);
  const navigate = useNavigate();

  // Open the single chat thread that belongs to THIS sit's home, creating it if
  // needed. Never falls back to another home's chat with the same person.
  const openConversation = async () => {
    if (openingChat) return;
    setOpeningChat(true);
    try {
      const conversationId = await resolveListingConversation({
        listingId: sit.listing_id,
        ownerUserId: sit.owner_user_id,
        sitterUserId: sit.sitter_user_id,
      });
      navigate(conversationId ? `/inbox?conversation=${conversationId}` : "/inbox");
    } catch {
      navigate("/inbox");
    } finally {
      setOpeningChat(false);
    }

  };

  // A declined reschedule proposal means the sit's original dates aren't
  // necessarily what should reopen for a new Nomad — let the owner pick.
  const handleCancel = () => {
    if (!cancelReason.trim()) return;
    let reopenWith: { start_date: string; end_date: string } | undefined;
    if (declinedRequest) {
      reopenWith =
        reopenChoice === "proposed"
          ? {
              start_date: declinedRequest.proposed_start_date,
              end_date: declinedRequest.proposed_end_date,
            }
          : sit.sit_dates
            ? { start_date: sit.sit_dates.start_date, end_date: sit.sit_dates.end_date }
            : undefined;
    }
    updateStatus({
      sitId: sit.id,
      sitDatesId: sit.sit_dates_id,
      status: "cancelled",
      reason: cancelReason.trim(),
      reopenWith,
    });
  };

  // Status is derived live from the dates so the badge is right even before the
  // nightly job promotes the row (confirmed -> in progress -> completed).
  const start = sit.sit_dates?.start_date ? parseISO(sit.sit_dates.start_date) : null;
  const end = sit.sit_dates?.end_date ? parseISO(sit.sit_dates.end_date) : null;
  const todayDate = startOfToday();
  const isCurrent =
    (sit.status === "confirmed" || sit.status === "in_progress") &&
    !!start &&
    !!end &&
    start <= todayDate &&
    end >= todayDate;
  const isFinished =
    (sit.status === "confirmed" || sit.status === "in_progress") && !!end && end < todayDate;
  const displayStatus = isCurrent
    ? "in_progress"
    : isFinished
      ? "completed"
      : sit.status;

  const canCompleteSit = isOwner && sit.status === "in_progress" && !isFinished;
  const canCancelSit = (sit.status === "confirmed" || sit.status === "in_progress") && !isFinished;
  // Reviews stay open for 14 days after the sit's end date.
  const REVIEW_WINDOW_DAYS = 14;
  const daysSinceEnd = sit.sit_dates?.end_date
    ? differenceInCalendarDays(startOfToday(), parseISO(sit.sit_dates.end_date))
    : null;
  const reviewDaysLeft =
    daysSinceEnd === null ? null : Math.max(0, REVIEW_WINDOW_DAYS - daysSinceEnd);
  const reviewWindowOpen = reviewDaysLeft === null || reviewDaysLeft > 0;
  const canReview = sit.status === "completed" && !hasReviewed && reviewWindowOpen;

  // Check if user has already reviewed for this sit
  useEffect(() => {
    const checkReview = async () => {
      if (sit.status !== "completed") return;
      
      const { data } = await supabase
        .from("reviews")
        .select("id")
        .eq("sit_id", sit.id)
        .eq("reviewer_user_id", userId)
        .maybeSingle();
      
      setHasReviewed(!!data);
    };
    
    checkReview();
  }, [sit.id, sit.status, userId]);

  return (
    <div className="p-3 rounded-lg border bg-card hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {sit.listing?.photos?.[0] ? (
          <img
            src={sit.listing.photos[0]}
            alt={sit.listing.title}
            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <Calendar className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{sit.listing?.title || "Untitled Sit"}</h4>
          {sit.listing?.city && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />
              {sit.listing.city}{sit.listing.country && `, ${sit.listing.country}`}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant="outline" className={cn("text-xs", statusColors[displayStatus])}>
              {isCurrent ? "Current" : displayStatus.replace("_", " ")}
            </Badge>
          </div>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {sit.sit_dates && format(parseISO(sit.sit_dates.start_date), "MMM d")} - {sit.sit_dates && format(parseISO(sit.sit_dates.end_date), "MMM d, yyyy")}
        </span>
        <span className="flex items-center gap-1">
          <User className="w-3 h-3" />
          {otherPartyLabel}: {otherParty?.first_name || "Unknown"}
        </span>
      </div>

      {/* Sit actions */}
      {(canCompleteSit || canCancelSit || isCurrent || sit.status === "confirmed") && (
        <div className="mt-3 pt-2 border-t space-y-2">
          <div className="flex gap-2 flex-wrap">
          {(sit.status === "confirmed" || sit.status === "in_progress") && (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              disabled={openingChat}
              onClick={openConversation}
            >
              <MessageSquare className="w-3 h-3 mr-1" />
              Message
            </Button>
          )}
          {isCurrent && isSitter && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={openingChat}
              onClick={openConversation}
            >
              <Bone className="w-3 h-3 mr-1" />
              Daily check-in
            </Button>
          )}
          {isCurrent && isOwner && (
            <Button size="sm" variant="outline" className="flex-1" asChild>
              <Link to={`/sits/${sit.id}`}>
                <Bone className="w-3 h-3 mr-1" />
                Care log
              </Link>
            </Button>
          )}
          {canCompleteSit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="secondary" className="flex-1" disabled={isPending}>
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Complete Sit
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Complete this sit?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark the sit as "completed". The sitter has finished and the sit has ended successfully.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => updateStatus({ sitId: sit.id, status: "completed" })}>
                    Complete Sit
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canCancelSit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={isPending}>
                  <XCircle className="w-3 h-3 mr-1" />
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this sit?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will cancel the sit and re-open the dates. Please tell the other
                    party why — a reason is required.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {declinedRequest && sit.sit_dates && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Which dates should become available for a new Nomad?
                    </p>
                    <RadioGroup
                      value={reopenChoice}
                      onValueChange={(v) => setReopenChoice(v as "original" | "proposed")}
                    >
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
                          Your proposed dates (
                          {format(parseISO(declinedRequest.proposed_start_date), "MMM d")} –{" "}
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
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Sit</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!cancelReason.trim()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleCancel}
                  >
                    Cancel Sit
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          </div>
        </div>
      )}

      {/* Propose/respond to new dates */}
      {(sit.status === "confirmed" || sit.status === "in_progress") && (
        <SitRescheduleSection sit={sit} isOwner={isOwner} isSitter={isSitter} />
      )}

      {/* Review Button for Completed Sits */}
      {canReview && (
        <div className="mt-3 pt-2 border-t">
          <WriteReviewDialog
            sitId={sit.id}
            revieweeUserId={isOwner ? sit.sitter_user_id : sit.owner_user_id}
            revieweeName={otherParty?.first_name || "Unknown"}
            reviewType={isOwner ? "sitter" : "owner"}
            onReviewSubmitted={() => setHasReviewed(true)}
            trigger={
              <Button size="sm" variant="outline" className="w-full gap-2">
                <Star className="w-3 h-3" />
                Review {otherPartyLabel}
              </Button>
            }
          />
          {reviewDaysLeft !== null && (
            <p className="text-[11px] text-muted-foreground text-center mt-1.5">
              {reviewDaysLeft === 1
                ? "Last day to leave your review"
                : `${reviewDaysLeft} days left to leave your review`}
            </p>
          )}
        </div>
      )}

      {sit.status === "completed" && !hasReviewed && !reviewWindowOpen && (
        <div className="mt-3 pt-2 border-t">
          <p className="text-xs text-muted-foreground text-center">
            The {REVIEW_WINDOW_DAYS}-day review window for this sit has closed
          </p>
        </div>
      )}

      {sit.status === "completed" && hasReviewed && (
        <div className="mt-3 pt-2 border-t">
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            You reviewed this {otherPartyLabel.toLowerCase()}
          </p>
        </div>
      )}
    </div>
  );
};

export const SitsCalendar = ({ viewAs }: SitsCalendarProps) => {
  const { user } = useAuth();
  const { data: sits = [], isLoading } = useSits();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const today = startOfToday();

  const filteredSits = useMemo(() => {
    if (!user) return [];
    return sits.filter((sit) => {
      if (viewAs === "sitter") {
        return sit.sitter_user_id === user.id;
      }
      return sit.owner_user_id === user.id;
    });
  }, [sits, user, viewAs]);

  const upcomingSits = useMemo(() => {
    return filteredSits
      .filter((sit) => {
        if (!sit.sit_dates) return false;
        const startDate = parseISO(sit.sit_dates.start_date);
        return (sit.status === "confirmed" || sit.status === "in_progress") && 
               (isAfter(startDate, today) || isSameDay(startDate, today) || 
                (sit.sit_dates && isWithinInterval(today, { start: parseISO(sit.sit_dates.start_date), end: parseISO(sit.sit_dates.end_date) })));
      })
      .sort((a, b) => {
        const dateA = a.sit_dates ? parseISO(a.sit_dates.start_date) : new Date();
        const dateB = b.sit_dates ? parseISO(b.sit_dates.start_date) : new Date();
        return dateA.getTime() - dateB.getTime();
      });
  }, [filteredSits, today]);

  const pastSits = useMemo(() => {
    return filteredSits
      .filter((sit) => {
        if (!sit.sit_dates) return false;
        const endDate = parseISO(sit.sit_dates.end_date);
        // Cancelled sits never happened — they only show in the Cancelled application tabs.
        if (sit.status === "cancelled") return false;
        return sit.status === "completed" || isBefore(endDate, today);
      })

      .sort((a, b) => {
        const dateA = a.sit_dates ? parseISO(a.sit_dates.end_date) : new Date();
        const dateB = b.sit_dates ? parseISO(b.sit_dates.end_date) : new Date();
        return dateB.getTime() - dateA.getTime();
      });
  }, [filteredSits, today]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getSitsForDay = (day: Date) => {
    return filteredSits.filter((sit) => {
      if (!sit.sit_dates) return false;
      // Cancelled sits never happened, so they must not mark the calendar.
      if (sit.status === "cancelled") return false;

      const startDate = parseISO(sit.sit_dates.start_date);
      const endDate = parseISO(sit.sit_dates.end_date);
      return isWithinInterval(day, { start: startDate, end: endDate }) || 
             isSameDay(day, startDate) || 
             isSameDay(day, endDate);
    });
  };

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev);
      newMonth.setMonth(prev.getMonth() + (direction === "next" ? 1 : -1));
      return newMonth;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mini Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {format(currentMonth, "MMMM yyyy")}
            </CardTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => navigateMonth("prev")}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigateMonth("next")}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="py-1">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before the start of the month */}
            {Array.from({ length: calendarDays[0].getDay() }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8" />
            ))}
            {calendarDays.map((day) => {
              const daySits = getSitsForDay(day);
              const isToday = isSameDay(day, today);
              const hasActiveSit = daySits.some((s) => s.status === "confirmed" || s.status === "in_progress");
              const hasCompletedSit = daySits.some((s) => s.status === "completed");

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "h-8 flex items-center justify-center text-sm rounded-md relative",
                    isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    hasActiveSit && "bg-primary/20 text-primary font-medium",
                    hasCompletedSit && !hasActiveSit && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  {format(day, "d")}
                  {daySits.length > 0 && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Sits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Upcoming Sits
            {upcomingSits.length > 0 && (
              <Badge variant="secondary" className="ml-auto">{upcomingSits.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingSits.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No upcoming sits</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingSits.slice(0, 5).map((sit) => (
                <SitCard key={sit.id} sit={sit} viewAs={viewAs} userId={user?.id || ""} />
              ))}
              {upcomingSits.length > 5 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{upcomingSits.length - 5} more upcoming sits
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Past Sits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Past Sits
            {pastSits.length > 0 && (
              <Badge variant="outline" className="ml-auto">{pastSits.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pastSits.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No past sits yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pastSits.slice(0, 3).map((sit) => (
                <SitCard key={sit.id} sit={sit} viewAs={viewAs} userId={user?.id || ""} />
              ))}
              {pastSits.length > 3 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{pastSits.length - 3} more past sits
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
