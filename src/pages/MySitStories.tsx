import { useState } from "react";
import { Link } from "react-router-dom";
import { BookHeart, ChevronRight, Loader2 } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { NN_LIST, NN_MAIN, EmptyState, PageHeader, PillTabs, RoleTheme, SectionCard, SerifTitle, StatusChip, type ChipTone } from "@/components/nn/ui";
import { useMySitStories, type MySitStory } from "@/hooks/useSitStories";
import { useUpdatePhotoUrls } from "@/hooks/useDailyUpdates";

type Tab = "all" | "profile" | "waiting";

const status = (s: MySitStory): { label: string; tone: ChipTone } => {
  switch (s.portfolio_status) {
    case "approved":
      return { label: "On my profile", tone: "green" };
    case "requested":
      return { label: `Waiting for ${s.other_first_name}`, tone: "accent" };
    case "declined":
      return { label: `${s.other_first_name} kept it private`, tone: "grey" };
    case "revoked":
      return { label: "Removed by the Pet Parent", tone: "grey" };
    default:
      return { label: "Private", tone: "grey" };
  }
};

const STEPS: [string, string][] = [
  ["Send daily updates during your sit", "A few photos and taps each day."],
  ["Your Sit Story arrives when the sit ends", "You and the Pet Parent both get it."],
  ["Ask to show it on your profile", "Once the Pet Parent approves, future hosts can read it."],
];

/** Sit Stories, Nomad side (design: SitStories.dc.html). */
const MySitStories = () => {
  const { data: all = [], isLoading } = useMySitStories();
  const mine = all.filter((s) => s.role === "sitter");
  const ready = mine.filter((s) => s.status === "ready");
  const [tab, setTab] = useState<Tab>("all");
  const onProfile = ready.filter((s) => s.portfolio_status === "approved");
  const waiting = ready.filter((s) => s.portfolio_status === "requested");
  const list = tab === "profile" ? onProfile : tab === "waiting" ? waiting : mine;
  const { data: urls = {} } = useUpdatePhotoUrls(list.map((s) => s.photo_path).filter((p): p is string => !!p));

  return (
    <RoleTheme role="sitter" className="min-h-screen">
      <Navbar wide />
      <main className={NN_MAIN}>
        <PageHeader
          title="Sit Stories"
          intro="Stories from your sits. Choose which ones future hosts see on your profile."
          fallback="/dashboard"
        />
        <div className={NN_LIST}>
        <PillTabs<Tab>
          label="Filter Sit Stories"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: "All", count: mine.length },
            { id: "profile", label: "On my profile", count: onProfile.length },
            { id: "waiting", label: "Waiting", count: waiting.length },
          ]}
        />

        {isLoading ? (
          <Skeleton className="h-40 w-full rounded-[24px]" />
        ) : list.length === 0 ? (
          <EmptyState
            title={tab === "all" ? "Your first story is on its way" : tab === "profile" ? "None on your profile yet" : "Nothing waiting"}
            text={
              tab === "all"
                ? "When your next sit ends, you'll both get a Sit Story made from your daily updates."
                : tab === "profile"
                  ? "Open a story and ask the Pet Parent to show it on your profile."
                  : "Stories you've asked to show on your profile wait here for the Pet Parent."
            }
          />
        ) : (
          <SectionCard className="p-[18px]">
            {list.map((s) =>
              s.status !== "ready" ? (
                <div key={s.id} className="flex items-center gap-3 border-t border-[var(--nn-line)] py-3 first:border-t-0">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm text-muted-foreground">
                    Your story with {s.other_first_name} is being written.
                  </span>
                </div>
              ) : (
                <Link key={s.id} to={`/stories/${s.id}`} className="flex items-center gap-3 border-t border-[var(--nn-line)] py-3 first:border-t-0">
                  <span className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px] bg-[var(--nn-soft)]">
                    {s.photo_path && urls[s.photo_path] ? (
                      <img src={urls[s.photo_path]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <BookHeart className="m-3.5 h-6 w-6 text-[var(--nn-accent-dark)]" aria-hidden="true" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-[15px] font-bold">{s.title}</span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      With {s.other_first_name}
                      {s.city ? ` · ${s.city}` : ""}
                    </span>
                    <span>
                      <StatusChip tone={status(s).tone}>{status(s).label}</StatusChip>
                    </span>
                  </span>
                  <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              ),
            )}
          </SectionCard>
        )}

        <SectionCard label="How it works" className="flex flex-col gap-3 p-[18px]">
          <SerifTitle>How it works</SerifTitle>
          <ol className="flex flex-col gap-3">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--nn-tint)] text-sm font-bold text-[var(--nn-accent-dark)]">
                  {i + 1}
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold">{title}</span>
                  <span className="text-[13px] text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </SectionCard>
        </div>
      </main>
    </RoleTheme>
  );
};

export default MySitStories;
