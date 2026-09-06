import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MapPin, Calendar, Eye, Check, X, User } from "lucide-react";
import { SitterInvite, useUpdateInviteStatus } from "@/hooks/useSitterInvites";
import { useToast } from "@/hooks/use-toast";

interface SitterInviteCardProps {
  invite: SitterInvite;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "New", className: "bg-blue-100 text-blue-700" },
  viewed: { label: "Viewed", className: "bg-gray-100 text-gray-700" },
  applied: { label: "Applied", className: "bg-green-100 text-green-700" },
  declined: { label: "Declined", className: "bg-red-100 text-red-700" },
};

export const SitterInviteCard = ({ invite }: SitterInviteCardProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const updateStatus = useUpdateInviteStatus();

  const ownerName = invite.owner_profile
    ? `${invite.owner_profile.first_name || ""} ${invite.owner_profile.last_name || ""}`.trim()
    : "Pet Owner";
  const ownerInitials = ownerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const location = [invite.listing?.city, invite.listing?.country]
    .filter(Boolean)
    .join(", ");

  const handleViewListing = () => {
    if (invite.status === "pending") {
      updateStatus.mutate({ inviteId: invite.id, status: "viewed" });
    }
    navigate(`/listing/${invite.listing_id}`);
  };

  const handleDecline = () => {
    updateStatus.mutate(
      { inviteId: invite.id, status: "declined" },
      {
        onSuccess: () => {
          toast({ title: "Invite declined" });
        },
        onError: () => {
          toast({
            title: "Could not decline invite",
            description: "Please check your connection and try again.",
            variant: "destructive",
          });
        },
      }
    );
  };


  const status = statusConfig[invite.status] || statusConfig.pending;

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Listing Image */}
          <div className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-muted">
            {invite.listing?.photos?.[0] ? (
              <img
                src={invite.listing.photos[0]}
                alt={invite.listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No Image
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-lg truncate">
                {invite.listing?.title || "Listing"}
              </h3>
              <Badge className={status.className}>{status.label}</Badge>
            </div>

            {location && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                <MapPin className="h-3 w-3" />
                {location}
              </div>
            )}

            {invite.sit_dates && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                <Calendar className="h-3 w-3" />
                {format(new Date(invite.sit_dates.start_date), "MMM d")} -{" "}
                {format(new Date(invite.sit_dates.end_date), "MMM d, yyyy")}
              </div>
            )}

            {/* Owner Info */}
            <div className="flex items-center gap-2 mb-3">
              <Avatar className="h-6 w-6">
                <AvatarImage src={invite.owner_profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {ownerInitials || <User className="h-3 w-3" />}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">
                Invited by {ownerName}
              </span>
            </div>

            {/* Message */}
            {invite.message && (
              <p className="text-sm text-muted-foreground italic line-clamp-2 mb-3">
                "{invite.message}"
              </p>
            )}

            {/* Actions */}
            {invite.status === "pending" || invite.status === "viewed" ? (
              <div className="flex items-center justify-start gap-2 min-w-0">
                <Button size="sm" onClick={handleViewListing} className="min-w-0 px-3">
                  <Eye className="h-4 w-4 mr-1" />
                  View & Apply
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDecline}
                  disabled={updateStatus.isPending}
                  className="h-9 w-9 shrink-0 p-0"
                  aria-label="Decline invitation"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={handleViewListing}>
                <Eye className="h-4 w-4 mr-1" />
                View Listing
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
