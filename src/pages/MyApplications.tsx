import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NN_LIST, NN_MAIN, EmptyState, PageHeader, PillTabs, RoleTheme, SectionCard, StatusChip, nnButton, shortRange } from "@/components/nn/ui";
import { useSitterApplications, useWithdrawApplication, type SitterApplication } from "@/hooks/useSitterApplications";
import { useSits } from "@/hooks/useSits";
import { applicationChip, groupApplications } from "@/lib/applicationGroups";
import { resolveListingConversation } from "@/lib/conversations";
import { useAuth } from "@/contexts/AuthContext";

type Tab = "all" | "accepted" | "pending" | "past";
const PAST_PAGE = 3;

const ApplicationRow = ({
  app,
  sitId,
  onWithdraw,
}: {
  app: SitterApplication;
  sitId?: string;
  onWithdraw?: (app: SitterApplication) => void;
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const chip = applicationChip(app);
  const owner = app.owner?.first_name;
  const accepted = chip.tone === "green";

  const message = async () => {
    if (!app.listing || !app.owner || !user) return;
    try {
      const id = await resolveListingConversation({
        listingId: app.listing_id,
        ownerUserId: app.owner.id,
        sitterUserId: user.id,
      });
      navigate(id ? `/inbox?conversation=${id}` : "/inbox");
    } catch {
      navigate("/inbox");
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--nn-line)] py-3 first:border-t-0">
      <Link to={`/listing/${app.listing_id}`} className="flex items-center gap-3">
        <span className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px] bg-[#CDB79E]">
          {app.listing?.photos?.[0] && <img src={app.listing.photos[0]} alt="" className="h-full w-full object-cover" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-bold">{app.listing?.title ?? "A sit"}</span>
          <span className="truncate text-[13px] text-[#656B74]">
            {[app.sit_dates && shortRange(app.sit_dates.start_date, app.sit_dates.end_date), owner].filter(Boolean).join(" · ")}
          </span>
        </span>
        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
      </Link>
      {accepted && (
        <div className="flex gap-2">
          {sitId && (
            <Link to={`/sits/${sitId}`} className={nnButton("primary", "flex-1")}>
              Open sit
            </Link>
          )}
          {owner && (
            <button type="button" onClick={message} className={nnButton("secondary", "flex-1")}>
              Message {owner}
            </button>
          )}
        </div>
      )}
      {onWithdraw && (app.status === "applied" || app.status === "shortlisted") && (
        <button type="button" onClick={() => onWithdraw(app)} className={nnButton("ghost", "self-start px-3")}>
          Withdraw application
        </button>
      )}
    </div>
  );
};

/** My applications (design: Applications.dc.html). */
const MyApplications = () => {
  const [params, setParams] = useSearchParams();
  const initial = params.get("tab");
  const [tab, setTab] = useState<Tab>(
    initial === "accepted" || initial === "pending" || initial === "past" ? initial : "all",
  );
  const [showAllPast, setShowAllPast] = useState(false);
  const [withdrawing, setWithdrawing] = useState<SitterApplication | null>(null);
  const { data: apps = [], isLoading } = useSitterApplications();
  const { data: sits = [] } = useSits();
  const withdraw = useWithdrawApplication();
  const groups = useMemo(() => groupApplications(apps), [apps]);

  const sitFor = (app: SitterApplication) =>
    sits.find((s) => s.sit_dates_id === app.sit_dates_id && s.status !== "cancelled")?.id;

  const pick = (t: Tab) => {
    setTab(t);
    setParams(t === "all" ? {} : { tab: t }, { replace: true });
  };

  const past = showAllPast ? groups.past : groups.past.slice(0, PAST_PAGE);
  const show = (g: Tab) => tab === "all" || tab === g;

  const group = (title: string, list: SitterApplication[], empty: React.ReactNode, extra?: React.ReactNode, withdrawable = false) => (
    <SectionCard className="p-[18px]">
      <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#656B74]">
        {title} · {list === past ? groups.past.length : list.length}
      </h2>
      {list.length === 0 ? (
        empty
      ) : (
        list.map((a) => (
          <ApplicationRow key={a.id} app={a} sitId={sitFor(a)} onWithdraw={withdrawable ? setWithdrawing : undefined} />
        ))
      )}
      {extra}
    </SectionCard>
  );

  return (
    <RoleTheme role="sitter" className="min-h-screen">
      <Navbar wide />
      <main className={NN_MAIN}>
        <PageHeader title="My applications" fallback="/dashboard" />
        <div className={NN_LIST}>
        <PillTabs
          label="Filter applications"
          value={tab}
          onChange={pick}
          tabs={[
            { id: "all", label: "All", count: groups.all.length },
            { id: "accepted", label: "Accepted", count: groups.accepted.length },
            { id: "pending", label: "Pending", count: groups.pending.length },
            { id: "past", label: "Past", count: groups.past.length },
          ]}
        />

        {isLoading ? (
          <Skeleton className="h-40 w-full rounded-[24px]" />
        ) : groups.all.length === 0 ? (
          <EmptyState
            title="No applications yet"
            text="Find a sit you'd love and apply. Your applications show up here."
            action={
              <Link to="/browse-sits" className={nnButton("primary")}>
                Browse sits
              </Link>
            }
          />
        ) : (
          <>
            {show("accepted") &&
              group(
                "Accepted",
                groups.accepted,
                <p className="py-2 text-sm text-[#656B74]">Nothing accepted yet.</p>,
              )}
            {show("pending") &&
              group(
                "Waiting to hear back",
                groups.pending,
                <div className="flex flex-col items-start gap-2 py-2">
                  <p className="text-sm text-[#656B74]">Nothing pending right now.</p>
                  <Link to="/browse-sits" className={nnButton("secondary")}>
                    Browse sits
                  </Link>
                </div>,
                undefined,
                true,
              )}
            {show("past") &&
              group(
                "Past",
                past,
                <p className="py-2 text-sm text-[#656B74]">No past applications.</p>,
                !showAllPast && groups.past.length > PAST_PAGE ? (
                  <button type="button" onClick={() => setShowAllPast(true)} className={nnButton("ghost", "mt-1 w-full")}>
                    Show {groups.past.length - PAST_PAGE} more past applications
                  </button>
                ) : null,
              )}
          </>
        )}
        </div>
      </main>

      <AlertDialog open={!!withdrawing} onOpenChange={(open) => !open && setWithdrawing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this application?</AlertDialogTitle>
            <AlertDialogDescription>
              {withdrawing?.owner?.first_name ?? "The Pet Parent"} will see that you've withdrawn. You can apply again later
              if the dates are still open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (withdrawing) withdraw.mutate(withdrawing.id);
                setWithdrawing(null);
              }}
            >
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RoleTheme>
  );
};

export default MyApplications;
