import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, WifiOff } from "lucide-react";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useWelcomeGuide } from "@/hooks/useWelcomeGuide";
import { useOwnerListings } from "@/hooks/useOwnerListings";

/**
 * Shows the Pet Parent's single reusable Welcome Guide from the dashboard,
 * with a quick status and an Edit button. One guide per Pet Parent, shared
 * across all listings.
 */
const OwnerWelcomeGuideCard = () => {
  const { user } = useAuth();
  const { data: listings = [] } = useOwnerListings();
  const { guide, isLoading, isOffline } = useWelcomeGuide(user?.id);

  const firstListingId = listings[0]?.id;
  const editTo = firstListingId ? `/listing/${firstListingId}/welcome-guide` : null;

  const filled = guide
    ? [guide.wifi_info, guide.feeding_schedule, guide.vet_info, guide.emergency_contacts, guide.house_notes].filter(
        (v) => (v || "").trim().length > 0,
      ).length
    : 0;
  const complete = filled > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Welcome Guide
            <HelpTooltip
              label="About the Welcome Guide"
              content="One guide is shared across all your listings. Nomads you confirm can see it on the listing and open it offline."
            />
          </span>
          {complete && (
            <Badge variant="secondary" className="shrink-0 text-sm font-medium">
              {filled}/5 fields filled
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : complete ? (
          isOffline ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <WifiOff className="w-3 h-3" /> Offline copy
            </span>
          ) : null
        ) : (
          <p className="text-sm text-muted-foreground">
            Add your WiFi, feeding schedule, vet, emergency contacts and house notes so your Nomad is set on day one.
          </p>
        )}

        {editTo ? (
          <Link to={editTo}>
            <Button size="sm" variant={complete ? "outline" : "default"} className="w-full sm:w-auto">
              {complete ? "Edit guide" : "Add your guide"}
            </Button>
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">Create a listing to start your guide.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default OwnerWelcomeGuideCard;
