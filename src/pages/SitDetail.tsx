import { useParams, Navigate, Link } from "react-router-dom";
import { Camera, ChevronRight } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useSitCheckins } from "@/hooks/useSitCheckins";
import { useSitUpdateContext } from "@/hooks/useDailyUpdates";
import { SitProgressHeader } from "@/components/sit-updates/SitProgressHeader";
import { DailyUpdateComposer } from "@/components/sit-updates/DailyUpdateComposer";
import { UpdatesTimeline } from "@/components/sit-updates/UpdatesTimeline";

/**
 * A sit's daily updates. The Nomad sends today's update (photos first, quick
 * taps, a short message); both see the story feed, newest day first. The
 * private Arrival Check-In stays on its own page, linked here for the Nomad
 * only (the Pet Parent never sees it).
 */
const SitDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { data: context, isLoading } = useSitUpdateContext(id);
  const { data: updates = [] } = useSitCheckins(context ? id : undefined);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  const todays = context ? updates.filter((u) => u.local_day === context.today) : [];
  const sentToday = todays.length > 0;
  // Chips already sent today (old one-tap "Meds Given" check-ins count as meds).
  const todayChips = todays.flatMap((u) => [...(u.chips ?? []), ...(u.kind === "meds_given" ? ["meds"] : [])]);
  // During the sit's dates only (in the home's time zone).
  const showComposer = !!context?.can_post && context.day_number !== null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container max-w-2xl flex-1 px-4 pb-10 pt-20">
        {isLoading ? (
          <div className="space-y-4 pt-4">
            <Skeleton className="h-44 w-full rounded-3xl" />
            <Skeleton className="h-72 w-full rounded-3xl" />
          </div>
        ) : !context ? (
          <div className="mt-8 rounded-3xl border p-10 text-center text-muted-foreground">This sit could not be found.</div>
        ) : (
          <div className="space-y-6 pt-2">
            <SitProgressHeader context={context} sentToday={sentToday} />
            {context.role === "sitter" && (
              <Link
                to={`/sits/${id}/arrival-vault`}
                state={{ from: `/sits/${id}` }}
                className="flex min-h-[56px] items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-terracotta-light text-primary">
                  <Camera className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-bold">Arrival Check-In</span>
                  <span className="text-xs text-muted-foreground">Photograph the home as you found it. Only you can see these.</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            )}
            {showComposer && <DailyUpdateComposer context={context} todayChips={todayChips} />}
            <section aria-labelledby="updates-heading" className="space-y-3">
              <h2 id="updates-heading" className="font-display text-xl font-bold">
                {context.role === "owner" ? `Updates from ${context.sitter.first_name}` : "Your updates"}
              </h2>
              <UpdatesTimeline updates={updates} context={context} />
            </section>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default SitDetail;
