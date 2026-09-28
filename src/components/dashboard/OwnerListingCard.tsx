import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  MapPin,
  Calendar,
  Edit,
  Eye,
  Users,
  MoreVertical,
  Pause,
  Play,
  Trash2,
  ChevronDown,
  RotateCcw,
  Loader2,
  BookOpen,
  CalendarPlus,
  Home,
} from "lucide-react";
import { format } from "date-fns";
import { OwnerListing } from "@/hooks/useOwnerListings";
import { useUpdateListingStatus, useDeleteListing } from "@/hooks/useOwnerListingActions";
import { useReopenSitDate } from "@/hooks/useReopenSitDate";
import { useGuideCompletion } from "@/hooks/useWelcomeGuide";
import { ProgressRing } from "./ProgressRing";
import { cn } from "@/lib/utils";

interface OwnerListingCardProps {
  listing: OwnerListing;
  /** New (not yet answered) applicants for this listing. */
  newApplicants?: number;
}

const statusStyles = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-primary/10 text-primary",
  paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
};

/**
 * "Your home": one primary action (Add new dates); everything else in the ⋮
 * menu, with the Welcome Guide progress and new applicants at a glance.
 */
export const OwnerListingCard = ({ listing, newApplicants = 0 }: OwnerListingCardProps) => {
  const { data: guideCompletion } = useGuideCompletion(listing.id);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDatesOpen, setShowDatesOpen] = useState(false);
  const updateStatus = useUpdateListingStatus();
  const deleteListing = useDeleteListing();
  const reopenSitDate = useReopenSitDate();

  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingOpenDates = listing.sit_dates.filter((d) => d.status === "open" && d.end_date >= todayIso);
  const nextDate = upcomingOpenDates[0];
  const extraOpenDatesCount = upcomingOpenDates.length - 1;
  const datesExpired = !nextDate && listing.status === "published";
  const closedDates = listing.sit_dates.filter(
    (d) => (d.status === "closed" || d.status === "booked") && d.end_date >= todayIso,
  );
  const petNames = listing.pets.map((p) => p.name || p.type).join(", ");
  const guidePercent = guideCompletion?.percent ?? 0;

  const handleDelete = () => {
    deleteListing.mutate(listing.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="flex gap-3 p-4">
          <Link
            to={`/listing/${listing.id}`}
            className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted sm:h-24 sm:w-24"
            aria-label={`View ${listing.title}`}
          >
            {listing.photos?.[0] ? (
              <img src={listing.photos[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <Home className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              </span>
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-display text-base font-bold">
                  <Link to={`/listing/${listing.id}`} className="hover:text-primary">
                    {listing.title}
                  </Link>
                </h3>
                {listing.city && (
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {listing.city}
                      {listing.country ? `, ${listing.country}` : ""}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge className={cn("px-2 text-[11px] capitalize", statusStyles[listing.status])}>{listing.status}</Badge>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions for this listing">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link to={`/listing/${listing.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        View listing
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to={`/edit-listing/${listing.id}`}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit listing
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to={`/listing/${listing.id}/welcome-guide`}>
                        <BookOpen className="mr-2 h-4 w-4" />
                        Welcome Guide
                      </Link>
                    </DropdownMenuItem>
                    {listing.status === "published" && (
                      <DropdownMenuItem onSelect={() => updateStatus.mutate({ listingId: listing.id, status: "paused" })}>
                        <Pause className="mr-2 h-4 w-4" />
                        Pause listing
                      </DropdownMenuItem>
                    )}
                    {listing.status === "paused" && (
                      <DropdownMenuItem onSelect={() => updateStatus.mutate({ listingId: listing.id, status: "published" })}>
                        <Play className="mr-2 h-4 w-4" />
                        Unpause listing
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setShowDeleteDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete listing
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {petNames && <p className="truncate">🐾 {petNames}</p>}
              {nextDate && (
                <p className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  {format(new Date(nextDate.start_date), "MMM d")} – {format(new Date(nextDate.end_date), "MMM d, yyyy")}
                  {extraOpenDatesCount > 0 && (
                    <Badge variant="muted" className="ml-1 h-4 px-1.5 py-0 text-[10px] leading-none">
                      +{extraOpenDatesCount} more
                    </Badge>
                  )}
                </p>
              )}
              {datesExpired && (
                <p className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  No upcoming dates: add new dates to appear in Browse
                </p>
              )}
            </div>
          </div>
        </div>

        {/* At a glance: Welcome Guide progress and new applicants */}
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          <Link
            to={`/listing/${listing.id}/welcome-guide`}
            className="flex items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 text-xs font-medium hover:border-primary/40"
          >
            <ProgressRing percent={guidePercent} size={28} stroke={3} label={`Welcome Guide ${guidePercent}% complete`}>
              <BookOpen className="h-3 w-3 text-primary" aria-hidden="true" />
            </ProgressRing>
            Guide {guidePercent}%
          </Link>
          {newApplicants > 0 && (
            <Link
              to="/applications"
              className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {newApplicants} new applicant{newApplicants === 1 ? "" : "s"}
            </Link>
          )}
        </div>

        {closedDates.length > 0 && (
          <Collapsible open={showDatesOpen} onOpenChange={setShowDatesOpen} className="px-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground">
                <ChevronDown className={cn("mr-1 h-3 w-3 transition-transform", showDatesOpen && "rotate-180")} />
                {closedDates.length} closed date{closedDates.length !== 1 ? "s" : ""}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pb-2">
              {closedDates.map((date) => (
                <div key={date.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-2 text-sm">
                  <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>
                    {format(new Date(date.start_date), "MMM d")} – {format(new Date(date.end_date), "MMM d, yyyy")}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {date.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 px-2 text-xs"
                    onClick={() => reopenSitDate.mutate(date.id)}
                    disabled={reopenSitDate.isPending}
                  >
                    {reopenSitDate.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1 h-3 w-3" />
                    )}
                    Reopen
                  </Button>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="px-4 pb-4">
          <Button asChild className="w-full rounded-full">
            <Link to={`/edit-listing/${listing.id}?focus=dates`}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Add new dates
            </Link>
          </Button>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{listing.title}" and all associated data including
              pets, sit dates, and applications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
