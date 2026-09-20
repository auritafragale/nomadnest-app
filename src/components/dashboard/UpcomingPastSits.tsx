import { useEffect, useMemo, useState } from "react";
import { parseISO, isAfter, isBefore, isSameDay, isWithinInterval, startOfToday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSits } from "@/hooks/useSits";
import { useAuth } from "@/contexts/AuthContext";
import { SitCard } from "./SitsCalendar";

interface UpcomingPastSitsProps {
  viewAs: "sitter" | "owner";
  /** Sit id to auto-open the review dialog for (deep-linked from a review reminder). */
  openReview?: string | null;
  /** Called once the deep-linked dialog has auto-opened, so the caller can clear openReview. */
  onAutoOpened?: (sitId: string) => void;
}

export const UpcomingPastSits = ({ viewAs, openReview, onAutoOpened }: UpcomingPastSitsProps) => {
  const { user } = useAuth();
  const { data: sits = [], isLoading } = useSits();
  const today = startOfToday();
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  const filteredSits = useMemo(() => {
    if (!user) return [];
    return sits.filter((sit) =>
      viewAs === "sitter" ? sit.sitter_user_id === user.id : sit.owner_user_id === user.id
    );
  }, [sits, user, viewAs]);

  const upcomingSits = useMemo(() => {
    return filteredSits
      .filter((sit) => {
        if (!sit.sit_dates) return false;
        const startDate = parseISO(sit.sit_dates.start_date);
        return (
          (sit.status === "confirmed" || sit.status === "in_progress") &&
          (isAfter(startDate, today) ||
            isSameDay(startDate, today) ||
            isWithinInterval(today, {
              start: parseISO(sit.sit_dates.start_date),
              end: parseISO(sit.sit_dates.end_date),
            }))
        );
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
        if (sit.status === "cancelled") return false;
        return sit.status === "completed" || isBefore(endDate, today);
      })
      .sort((a, b) => {
        const dateA = a.sit_dates ? parseISO(a.sit_dates.end_date) : new Date();
        const dateB = b.sit_dates ? parseISO(b.sit_dates.end_date) : new Date();
        return dateB.getTime() - dateA.getTime();
      });
  }, [filteredSits, today]);

  // openReview is cleared back to null by the parent (via onAutoOpened) the
  // instant the matching SitCard consumes it — otherwise it's a one-shot
  // trigger, not a durable "this sit is the target" flag. But this
  // component's own membership logic below (which tab is active, whether
  // the target sit is kept visible past the usual truncation) needs that
  // fact to stay true for the rest of this mount, or the target's SitCard
  // — and the review dialog it just auto-opened — would disappear the
  // moment the prop clears. Pin it locally so it survives that clear.
  const [pinnedReviewSitId, setPinnedReviewSitId] = useState<string | null>(null);
  useEffect(() => {
    if (openReview) setPinnedReviewSitId(openReview);
  }, [openReview]);

  // A past sit is where a completed sit's review dialog would auto-open —
  // switch to that tab so there's actually something on screen to open.
  useEffect(() => {
    if (pinnedReviewSitId && pastSits.some((sit) => sit.id === pinnedReviewSitId)) {
      setActiveTab("past");
    }
  }, [pinnedReviewSitId, pastSits]);

  const pastSitsToShow = useMemo(() => {
    const firstThree = pastSits.slice(0, 3);
    if (!pinnedReviewSitId || firstThree.some((sit) => sit.id === pinnedReviewSitId)) return firstThree;
    const match = pastSits.find((sit) => sit.id === pinnedReviewSitId);
    return match ? [...firstThree, match] : firstThree;
  }, [pastSits, pinnedReviewSitId]);

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Sits
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "upcoming" | "past")}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="upcoming" className="gap-1.5">
              Upcoming
              {upcomingSits.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {upcomingSits.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="past" className="gap-1.5">
              Past
              {pastSits.length > 0 && (
                <Badge variant="outline" className="h-5 px-1.5 text-xs">
                  {pastSits.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-0">
            {upcomingSits.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No upcoming sits</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingSits.slice(0, 5).map((sit) => (
                  <SitCard key={sit.id} sit={sit} viewAs={viewAs} userId={user?.id || ""} openReview={openReview} onAutoOpened={onAutoOpened} />
                ))}
                {upcomingSits.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center">
                    +{upcomingSits.length - 5} more upcoming sits
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="past" className="mt-0">
            {pastSits.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No past sits yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pastSitsToShow.map((sit) => (
                  <SitCard key={sit.id} sit={sit} viewAs={viewAs} userId={user?.id || ""} openReview={openReview} onAutoOpened={onAutoOpened} />
                ))}
                {pastSits.length > pastSitsToShow.length && (
                  <p className="text-sm text-muted-foreground text-center">
                    +{pastSits.length - pastSitsToShow.length} more past sits
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
