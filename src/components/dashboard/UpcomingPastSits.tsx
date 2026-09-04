import { useMemo } from "react";
import { parseISO, isAfter, isBefore, isSameDay, isWithinInterval, startOfToday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, XCircle } from "lucide-react";
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

  const cancelledSits = useMemo(
    () =>
      filteredSits
        .filter((sit) => sit.status === "cancelled")
        .sort((a, b) => {
          const dateA = a.sit_dates ? parseISO(a.sit_dates.start_date) : new Date();
          const dateB = b.sit_dates ? parseISO(b.sit_dates.start_date) : new Date();
          return dateB.getTime() - dateA.getTime();
        }),
    [filteredSits],
  );

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      {/* Upcoming Sits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Upcoming Sits
            {upcomingSits.length > 0 && (
              <Badge variant="secondary" className="ml-auto">{upcomingSits.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Past Sits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Past Sits
            {pastSits.length > 0 && (
              <Badge variant="outline" className="ml-auto">{pastSits.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Cancelled Sits — never happened, so kept out of history */}
      {cancelledSits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Cancelled Sits
              <Badge variant="outline" className="ml-auto">{cancelledSits.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cancelledSits.slice(0, 3).map((sit) => (
                <SitCard key={sit.id} sit={sit} viewAs={viewAs} userId={user?.id || ""} />
              ))}
              {cancelledSits.length > 3 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{cancelledSits.length - 3} more cancelled sits
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
