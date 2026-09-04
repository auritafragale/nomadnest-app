import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MapPin, Calendar, Edit, Eye, Users, MoreVertical, Pause, Play, Trash2, Copy, ChevronDown, RotateCcw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { OwnerListing } from "@/hooks/useOwnerListings";
import { useUpdateListingStatus, useDeleteListing } from "@/hooks/useOwnerListingActions";
import { useDuplicateListing } from "@/hooks/useDuplicateListing";
import { useReopenSitDate } from "@/hooks/useReopenSitDate";

interface OwnerListingCardProps {
  listing: OwnerListing;
}

const statusColors = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-primary/10 text-primary",
  paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
};

export const OwnerListingCard = ({ listing }: OwnerListingCardProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDatesOpen, setShowDatesOpen] = useState(false);
  const updateStatus = useUpdateListingStatus();
  const deleteListing = useDeleteListing();
  const duplicateListing = useDuplicateListing();
  const reopenSitDate = useReopenSitDate();

  const todayIso = new Date().toISOString().slice(0, 10);
  const nextDate = listing.sit_dates.find((d) => d.status === "open" && d.end_date >= todayIso);
  const datesExpired = !nextDate && listing.status === "published";
  const closedDates = listing.sit_dates.filter((d) => d.status === "closed" || d.status === "booked");
  const petNames = listing.pets.map((p) => p.name || p.type).join(", ");

  const handlePause = () => {
    updateStatus.mutate({ listingId: listing.id, status: "paused" });
  };

  const handleUnpause = () => {
    updateStatus.mutate({ listingId: listing.id, status: "published" });
  };

  const handleDelete = () => {
    deleteListing.mutate(listing.id);
    setShowDeleteDialog(false);
  };

  const handleDuplicate = () => {
    duplicateListing.mutate(listing.id);
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex gap-3 sm:gap-4">
            {/* Thumbnail + primary actions */}
            <div className="w-20 sm:w-24 flex-shrink-0 space-y-2">
              <div className="w-full h-20 sm:h-24 rounded-lg bg-muted overflow-hidden">
                {listing.photos && listing.photos.length > 0 ? (
                  <img
                    src={listing.photos[0]}
                    alt={listing.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px] text-muted-foreground">
                    No image
                  </div>
                )}
              </div>
              <Link to={`/edit-listing/${listing.id}`} className="block">
                <Button size="sm" variant="outline" className="w-full h-7 px-1 text-xs">
                  <Edit className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              </Link>
              {listing.status === "published" && (
                <Link to={`/listing/${listing.id}`} className="block">
                  <Button size="sm" variant="ghost" className="w-full h-7 px-1 text-xs">
                    <Eye className="w-3 h-3 mr-1" />
                    View
                  </Button>
                </Link>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground truncate">
                    {listing.title}
                  </h3>
                  {listing.city && listing.country && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{listing.city}, {listing.country}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge className={`${statusColors[listing.status]} text-[11px] px-2`}>

                    {listing.status}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {listing.status === "published" && (
                        <DropdownMenuItem onClick={handlePause}>
                          <Pause className="w-4 h-4 mr-2" />
                          Pause Listing
                        </DropdownMenuItem>
                      )}
                      {listing.status === "paused" && (
                        <DropdownMenuItem onClick={handleUnpause}>
                          <Play className="w-4 h-4 mr-2" />
                          Unpause Listing
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={handleDuplicate}>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate Listing
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Listing
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-3">
                {petNames && (
                  <span className="flex items-center gap-1">
                    🐾 {petNames}
                  </span>
                )}
                {nextDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(nextDate.start_date), "MMM d")} -{" "}
                    {format(new Date(nextDate.end_date), "MMM d, yyyy")}
                  </span>
                )}
                {datesExpired && (
                  <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <Calendar className="w-3 h-3" />
                    Dates expired — add new dates to appear in Browse
                  </span>
                )}
                {listing._count.applications > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {listing._count.applications} application
                    {listing._count.applications !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <Link to={`/edit-listing/${listing.id}`}>
                  <Button size="sm" variant="outline">
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                </Link>
                {listing.status === "published" && (
                  <Link to={`/listing/${listing.id}`}>
                    <Button size="sm" variant="ghost">
                      <Eye className="w-3 h-3 mr-1" />
                      View
                    </Button>
                  </Link>
                )}
              </div>

              {/* Closed/Booked Dates - Reopen Option */}
              {closedDates.length > 0 && (
                <Collapsible open={showDatesOpen} onOpenChange={setShowDatesOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full mt-2 text-muted-foreground">
                      <ChevronDown className={`w-3 h-3 mr-1 transition-transform ${showDatesOpen ? 'rotate-180' : ''}`} />
                      {closedDates.length} closed date{closedDates.length !== 1 ? 's' : ''}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {closedDates.map((date) => (
                      <div key={date.id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          <span>
                            {format(new Date(date.start_date), "MMM d")} - {format(new Date(date.end_date), "MMM d, yyyy")}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {date.status}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reopenSitDate.mutate(date.id)}
                          disabled={reopenSitDate.isPending}
                        >
                          {reopenSitDate.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3 mr-1" />
                          )}
                          Reopen
                        </Button>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
