import { useMemo } from "react";
import { parseISO, isAfter, isBefore, isSameDay, isWithinInterval, startOfToday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSits } from "@/hooks/useSits";
import { useAuth } from "@/contexts/AuthContext";
import { SitCard } from "./SitsCalendar";

interface UpcomingPastSitsProps {
  viewAs: "sitter" | "owner";
}

export const UpcomingPastSits = ({ viewAs }: UpcomingPastSitsProps) => {
  const { user } = useAuth();
  const { data: sits = [], isLoading } = useSits();
  const today = startOfToday();

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
        <Tabs defaultValue="upcoming">
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
                  <SitCard key={sit.id} sit={sit} viewAs={viewAs} userId={user?.id || ""} />
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
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
