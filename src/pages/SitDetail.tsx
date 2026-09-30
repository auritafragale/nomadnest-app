import { useParams, Navigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { BackButton } from "@/components/layout/BackButton";
import { Skeleton } from "@/components/ui/skeleton";
import { NN_MAIN, RoleTheme, SerifTitle } from "@/components/nn/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSits } from "@/hooks/useSits";
import { useSitCheckins } from "@/hooks/useSitCheckins";
import { useSitUpdateContext } from "@/hooks/useDailyUpdates";
import { SitSummary, SitActions } from "@/components/sit-updates/SitSummary";
import { DailyUpdateComposer } from "@/components/sit-updates/DailyUpdateComposer";
import { UpdatesTimeline } from "@/components/sit-updates/UpdatesTimeline";
import { SitMoreMenu } from "@/components/sits/SitActions";

/**
 * A sit (design: SitNomad, SitParent, SitTabletDark, SitDesktop). The Nomad
 * sends today's update (photos first, quick taps, a short message); both see
 * the updates, newest day first. Phone: one column. Tablet: updates with the
 * summary and actions in a column on the right. Desktop: summary and actions
 * on the left. The private Arrival Check-In is linked for the Nomad only.
 */
const SitDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { data: context, isLoading } = useSitUpdateContext(id);
  const { data: updates = [] } = useSitCheckins(context ? id : undefined);
  const { data: sits = [] } = useSits();
  const sit = sits.find((s) => s.id === id);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  const todays = context ? updates.filter((u) => u.local_day === context.today) : [];
  const sentToday = todays.length > 0;
  // Chips already sent today (old one-tap "Meds Given" check-ins count as meds).
  const todayChips = todays.flatMap((u) => [...(u.chips ?? []), ...(u.kind === "meds_given" ? ["meds"] : [])]);
  // During the sit's dates only (in the home's time zone).
  const showComposer = !!context?.can_post && context.day_number !== null;
  const role = context?.role ?? "sitter";
  const menuItems = role === "owner" ? (["propose", "listing", "mySits"] as const) : (["arrival", "listing", "mySits"] as const);

  return (
    <RoleTheme role={role} className="flex min-h-screen flex-col">
      <Navbar wide />
      <main className={NN_MAIN}>
        <div className="flex items-center justify-between">
          <BackButton fallback="/dashboard" className="h-11" />
          {sit && <SitMoreMenu sit={sit} items={[...menuItems]} keepAfterSit />}
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-44 w-full rounded-[24px]" />
            <Skeleton className="h-72 w-full rounded-[24px]" />
          </div>
        ) : !context ? (
          <div className="rounded-[24px] border border-[var(--nn-border)] p-10 text-center text-muted-foreground">
            This sit could not be found.
          </div>
        ) : (
          <div className="flex flex-col gap-[18px] md:grid md:grid-cols-[minmax(0,1fr)_280px] md:items-start md:gap-5 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-7 xl:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="flex min-w-0 flex-col gap-[18px] md:order-2 md:sticky md:top-24 md:gap-4 lg:order-1">
              <SitSummary context={context} sentToday={sentToday} />
              <SitActions context={context} />
            </aside>
            <div className="flex min-w-0 flex-col gap-[18px] md:order-1 md:gap-5 lg:order-2">
              {showComposer && <DailyUpdateComposer context={context} todayChips={todayChips} />}
              <section aria-labelledby="updates-heading" className="flex flex-col gap-3">
                <SerifTitle as="h2" className="text-[22px]">
                  <span id="updates-heading">{context.role === "owner" ? `Updates from ${context.sitter.first_name}` : "Your updates"}</span>
                </SerifTitle>
                <UpdatesTimeline updates={updates} context={context} />
              </section>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </RoleTheme>
  );
};

export default SitDetail;
