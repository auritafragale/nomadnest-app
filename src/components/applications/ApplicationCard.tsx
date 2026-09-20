import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import PetTypeIcons from "@/components/browse/PetTypeIcons";
import {
  Calendar,
  ChevronDown,
  MapPin,
  MoreVertical,
  Star,
  Check,
  X,
  Bookmark,
  MessageCircle,
  User,
  Loader2,
} from "lucide-react";
import type { Application } from "@/hooks/useApplications";
import { useStartConversation } from "@/hooks/useConversations";
import { useToast } from "@/hooks/use-toast";
import CommunityWarningModal from "@/components/trust/CommunityWarningModal";
import { useCommunityWarning } from "@/hooks/useCommunityWarning";
import { cn } from "@/lib/utils";

interface ApplicationCardProps {
  application: Application;
  onStatusChange: (status: "shortlisted" | "declined") => void;
  onAccept: () => void;
  isUpdating?: boolean;
}

const statusColors: Record<string, string> = {
  applied: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  shortlisted: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  declined: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  withdrawn: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

export const ApplicationCard = ({
  application,
  onStatusChange,
  onAccept,
  isUpdating,
}: ApplicationCardProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const startConversation = useStartConversation();
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const nomadWarning = useCommunityWarning("user", application.sitter_user_id);

  const sitter = application.sitter_user;
  const sitterProfile = application.sitter_profile;

  const handleMessageSitter = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!application.sitter_user_id) return;
    setIsStartingChat(true);
    try {
      const { conversationId } = await startConversation.mutateAsync({
        otherUserId: application.sitter_user_id,
        listingId: application.listing_id,
      });
      navigate(`/inbox?conversation=${conversationId}`);
    } catch {
      toast({ title: "Error", description: "Could not open conversation.", variant: "destructive" });
    } finally {
      setIsStartingChat(false);
    }
  };
  const initials = sitter
    ? `${sitter.first_name?.[0] || ""}${sitter.last_name?.[0] || ""}`
    : "?";

  const canModify = ["applied", "shortlisted"].includes(application.status);

  return (
    <Card className="overflow-hidden">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-3 cursor-pointer">
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarImage src={sitter?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {initials.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/sitter/${application.sitter_user_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold text-foreground hover:text-primary transition-colors block truncate"
                >
                  {sitter?.first_name} {sitter?.last_name}
                </Link>
                {sitter?.city && (
                  <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 min-w-0">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {sitter.city}{sitter.country ? `, ${sitter.country}` : ""}
                    </span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 min-w-0">
                  <Star className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {application.review_count > 0
                      ? `${application.avg_rating?.toFixed(1)} · ${application.review_count} review${application.review_count === 1 ? "" : "s"}`
                      : "No reviews yet"}
                  </span>
                </p>
              </div>

              {/* Just the badge and chevron here — the Shortlist/Decline menu
                  only appears once expanded (in the Actions row below), so
                  the always-visible header has one less fixed-width element
                  competing with the name/location/rating column for space. */}
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={statusColors[application.status]}>
                  {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                </Badge>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                    expanded && "rotate-180"
                  )}
                />
              </div>
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
        <CardContent className="space-y-4">
        {/* Listing & Dates */}
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="text-sm font-medium text-foreground">
            {application.listing?.title}
          </p>
          {application.sit_dates && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(application.sit_dates.start_date), "MMM d")} -{" "}
              {format(new Date(application.sit_dates.end_date), "MMM d, yyyy")}
            </p>
          )}
        </div>

        {/* Sitter Info */}
        {sitterProfile?.headline && (
          <p className="text-sm text-muted-foreground">{sitterProfile.headline}</p>
        )}

        <PetTypeIcons petTypes={sitterProfile?.pet_types} />

        {/* Application Message */}
        {application.message && (
          <div className="p-3 rounded-lg border border-border bg-background">
            <p className="text-sm text-muted-foreground italic">
              "{application.message}"
            </p>
          </div>
        )}

        {/* Highlights */}
        {application.highlights && application.highlights.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {application.highlights.map((highlight, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                {highlight}
              </Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        {canModify && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={() => (nomadWarning.hasWarning ? setWarningOpen(true) : onAccept())}
              disabled={isUpdating}
            >
              <Check className="h-4 w-4 mr-2" />
              Accept
            </Button>
            <CommunityWarningModal
              open={warningOpen}
              onOpenChange={setWarningOpen}
              labels={nomadWarning.labels}
              audience="nomad"
              continueLabel="Accept Nomad"
              onContinue={() => {
                setWarningOpen(false);
                onAccept();
              }}
            />
            <Button variant="outline" asChild>
              <Link to={`/sitter/${application.sitter_user_id}`}>
                <User className="h-4 w-4 mr-2" />
                View
              </Link>
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="shrink-0"
                onClick={handleMessageSitter}
                disabled={isStartingChat}
              >
                {isStartingChat ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4 mr-2" />
                )}
                Message
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0" disabled={isUpdating}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {application.status !== "shortlisted" && (
                    <DropdownMenuItem onClick={() => onStatusChange("shortlisted")}>
                      <Bookmark className="h-4 w-4 mr-2" />
                      Shortlist
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onStatusChange("declined")}>
                    <X className="h-4 w-4 mr-2" />
                    Decline
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {/* Applied date */}
        <p className="text-xs text-muted-foreground">
          Applied {format(new Date(application.created_at), "MMM d, yyyy 'at' h:mm a")}
        </p>
        </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
