import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { format, parseISO } from "date-fns";
import { Calendar, MapPin, ArrowRight, Home, X, Loader2 } from "lucide-react";
import type { SitterApplication } from "@/hooks/useSitterApplications";
import { useWithdrawApplication } from "@/hooks/useSitterApplications";
import { useToast } from "@/hooks/use-toast";

interface SitterApplicationCardProps {
  application: SitterApplication;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  applied: {
    label: "Pending",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  shortlisted: {
    label: "Shortlisted",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  accepted: {
    label: "Accepted",
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  declined: {
    label: "Declined",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  withdrawn: {
    label: "Withdrawn",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
};


export const SitterApplicationCard = ({ application }: SitterApplicationCardProps) => {
  const { listing, sit_dates, owner, status } = application;
  const statusInfo = statusConfig[status] || statusConfig.applied;
  const { toast } = useToast();
  const withdrawMutation = useWithdrawApplication();
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);

  const canWithdraw = status === "applied" || status === "shortlisted";

  const handleWithdraw = async () => {
    try {
      await withdrawMutation.mutateAsync(application.id);
      toast({
        title: "Application withdrawn",
        description: "Your application has been withdrawn.",
      });
      setWithdrawDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to withdraw application.",
        variant: "destructive",
      });
    }
  };

  const ownerInitials = owner
    ? `${owner.first_name?.[0] || ""}${owner.last_name?.[0] || ""}`
    : "?";

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Listing Image */}
          <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
            {listing?.photos?.[0] ? (
              <img
                src={listing.photos[0]}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Home className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <Link
                to={`/listing/${application.listing_id}`}
                className="font-semibold text-foreground hover:text-primary transition-colors truncate"
              >
                {listing?.title || "Listing"}
              </Link>
              <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
            </div>

            {listing?.city && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                <MapPin className="h-3 w-3" />
                {listing.city}{listing.country ? `, ${listing.country}` : ""}
              </p>
            )}

            {sit_dates && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                <Calendar className="h-3 w-3" />
                {format(parseISO(sit_dates.start_date), "MMM d")} -{" "}
                {format(parseISO(sit_dates.end_date), "MMM d, yyyy")}
              </p>
            )}

            {/* Owner */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarImage src={owner?.avatar_url || undefined} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {ownerInitials.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground truncate">
                  {[owner?.first_name, owner?.last_name].filter(Boolean).join(" ")}
                </span>
              </div>


              <div className="flex items-center gap-1">
                {canWithdraw && (
                  <AlertDialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <X className="h-3 w-3 mr-1" />
                        Withdraw
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Withdraw application?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to withdraw your application for "{listing?.title}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleWithdraw}
                          disabled={withdrawMutation.isPending}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {withdrawMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          Withdraw
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/listing/${application.listing_id}`}>
                    View
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
