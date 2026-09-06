import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSitterInvites, usePendingInvitesCount } from "@/hooks/useSitterInvites";
import { Skeleton } from "@/components/ui/skeleton";
import { SitterInviteCard } from "./SitterInviteCard";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

export const SitterInvitesSection = () => {
  const { data: invites = [], isLoading } = useSitterInvites();
  const { data: pendingCount = 0 } = usePendingInvitesCount();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Invitations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Invitations
          <HelpTooltip label="About invitations" content="Sit invitations from Pet Parents" />
          {pendingCount > 0 && (
            <Badge className="ml-auto">
              {pendingCount} new
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {invites.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No invitations yet</p>
            <p className="text-sm mt-1">Owners can invite you to sit for their pets</p>
            <Link to="/browse-sits">
              <Button className="mt-4">
                Browse Sits
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {invites.slice(0, 5).map((invite) => (
              <SitterInviteCard key={invite.id} invite={invite} />
            ))}
            {invites.length > 5 && (
              <p className="text-sm text-muted-foreground text-center pt-2">
                And {invites.length - 5} more invitations...
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
