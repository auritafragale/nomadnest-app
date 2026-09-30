import { useState } from "react";
import { Link } from "react-router-dom";
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
  BookOpen,
  Calendar,
  CalendarPlus,
  ChevronDown,
  Edit,
  Eye,
  Home,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import { OwnerListing } from "@/hooks/useOwnerListings";
import { useUpdateListingStatus, useDeleteListing } from "@/hooks/useOwnerListingActions";
import { useReopenSitDate } from "@/hooks/useReopenSitDate";
import { useGuideCompletion } from "@/hooks/useWelcomeGuide";
import { SectionCard, shortRange } from "@/components/nn/ui";
import { cn } from "@/lib/utils";

interface OwnerListingCardProps {
  listing: OwnerListing;
  /** New (not yet answered) applicants for this listing. */
  newApplicants?: number;
}

const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  published: { label: "Published", dot: "bg-brand-teal", text: "text-brand-teal-text" },
  paused: { label: "Paused", dot: "bg-[var(--nn-tip-border)]", text: "text-[var(--nn-tip-text)]" },
  draft: { label: "Draft", dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

/**
 * "Your home" (design: PetParent.dc.html): photo with status and ⋮ menu,
 * Welcome Guide / Applicants / Open dates tiles, and Add new dates.
 */
export const OwnerListingCard = ({ listing, newApplicants = 0 }: OwnerListingCardProps) => {
  const { data: guideCompletion } = useGuideCompletion(listing.id);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const updateStatus = useUpdateListingStatus();
  const deleteListing = useDeleteListing();
  const reopenSitDate = useReopenSitDate();

  const todayIso = new Date().toISOString().slice(0, 10);
  const openDates = listing.sit_dates.filter((d) => d.status === "open" && d.end_date >= todayIso);
  const closedDates = listing.sit_dates.filter(
    (d) => (d.status === "closed" || d.status === "booked") && d.end_date >= todayIso,
  );
  const notInBrowse = listing.status === "published" && openDates.length === 0;
  const petNames = listing.pets.map((p) => p.name || p.type).filter(Boolean).join(", ");
  const guidePercent = guideCompletion?.percent ?? 0;
  const status = STATUS[listing.status] ?? STATUS.draft;

  const tile = "flex min-h-[44px] flex-col gap-1.5 rounded-2xl px-2.5 py-3";

  return (
    <>
      <SectionCard
        label="Your home"
        className="overflow-hidden md:grid md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]"
      >
        <div className="relative h-[190px] bg-[#BFA98F] md:h-auto md:min-h-[300px]">
          {listing.photos?.[0] ? (
            <img src={listing.photos[0]} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center">
              <Home className="h-8 w-8 text-white/80" aria-hidden="true" />
            </span>
          )}
          <span className={cn("absolute left-3 top-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-bold", status.text)}>
            <span className={cn("h-[7px] w-[7px] rounded-full", status.dot)} />
            {status.label}
          </span>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Listing options"
                className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-card"
              >
                <MoreVertical className="h-5 w-5" aria-hidden="true" />
              </button>
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
              <DropdownMenuItem onSelect={() => setShowDeleteDialog(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete listing
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5 p-[18px] md:p-5 xl:p-6">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Your home</span>
            <h2 className="font-display text-[27px] font-normal leading-[1.1]">
              <Link to={`/listing/${listing.id}`}>{listing.title}</Link>
            </h2>
            <span className="text-sm text-muted-foreground">
              {[[listing.city, listing.country].filter(Boolean).join(", "), petNames].filter(Boolean).join(" · ")}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Link to={`/listing/${listing.id}/welcome-guide`} className={cn(tile, "bg-[var(--nn-soft)]")}>
              <span
                className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--nn-chip)] text-brand-teal-text"
                aria-hidden="true"
              >
                <BookOpen className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-bold">{guidePercent}%</span>
              <span className="text-xs text-muted-foreground">Welcome Guide</span>
            </Link>
            <Link to="/applications" className={cn(tile, "bg-[var(--nn-soft)]")}>
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--nn-chip)] text-muted-foreground" aria-hidden="true">
                <Users className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-bold">{newApplicants} new</span>
              <span className="text-xs text-muted-foreground">Applicants</span>
            </Link>
            <Link
              to={`/edit-listing/${listing.id}?focus=dates`}
              className={cn(tile, openDates.length === 0 ? "bg-[var(--nn-warn-bg)]" : "bg-[var(--nn-soft)]")}
            >
              <span
                className={cn(
                  "flex h-[30px] w-[30px] items-center justify-center rounded-full",
                  openDates.length === 0 ? "bg-[var(--nn-warn-bg)] text-brand-coral-text" : "bg-[var(--nn-chip)] text-muted-foreground",
                )}
                aria-hidden="true"
              >
                <Calendar className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-bold">
                {openDates.length === 0 ? "None" : shortRange(openDates[0].start_date, openDates[0].end_date)}
              </span>
              <span className={cn("text-xs", openDates.length === 0 ? "text-brand-coral-text" : "text-muted-foreground")}>
                {openDates.length > 1 ? `Open dates · +${openDates.length - 1}` : "Open dates"}
              </span>
            </Link>
          </div>

          {notInBrowse && (
            <p className="text-sm leading-snug text-brand-coral-text">Your home isn't showing in Browse. Add dates so Nomads can find it.</p>
          )}

          {closedDates.length > 0 && (
            <Collapsible open={showClosed} onOpenChange={setShowClosed}>
              <CollapsibleTrigger asChild>
                <button type="button" className="flex min-h-[44px] w-full items-center justify-center gap-1 text-sm font-semibold text-muted-foreground">
                  <ChevronDown className={cn("h-4 w-4 transition-transform", showClosed && "rotate-180")} aria-hidden="true" />
                  {closedDates.length} closed date{closedDates.length !== 1 ? "s" : ""}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-2 pt-1">
                {closedDates.map((date) => (
                  <div key={date.id} className="flex items-center gap-2 rounded-xl bg-[var(--nn-soft)] p-2 pl-3 text-sm">
                    <span className="flex-1">
                      {shortRange(date.start_date, date.end_date)} · {date.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => reopenSitDate.mutate(date.id)}
                      disabled={reopenSitDate.isPending}
                      className="flex min-h-[44px] items-center gap-1 rounded-full px-3 font-semibold text-brand-teal-text"
                    >
                      {reopenSitDate.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      )}
                      Reopen
                    </button>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          <Link
            to={`/edit-listing/${listing.id}?focus=dates`}
            className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-brand-teal text-[15px] font-bold text-primary-foreground hover:opacity-90"
          >
            <CalendarPlus className="h-[18px] w-[18px]" aria-hidden="true" />
            Add new dates
          </Link>
        </div>
      </SectionCard>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{listing.title}" and all associated data including pets, sit dates, and
              applications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteListing.mutate(listing.id);
                setShowDeleteDialog(false);
              }}
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
