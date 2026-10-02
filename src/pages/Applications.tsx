import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import { BackButton } from "@/components/layout/BackButton";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { fetchMyProfile } from "@/lib/myProfile";
import { useStartConversation } from "@/hooks/useConversations";
import { useGuideCompletion } from "@/hooks/useWelcomeGuide";
import {
  type Applicant,
  useConfirmApplicant,
  useDeclineApplicant,
  useListingApplicants,
  useMarkApplicantsSeen,
  useMyListings,
  useToggleShortlist,
} from "@/hooks/useListingApplicants";
import ApplicantCard from "@/components/applications/ApplicantCard";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import {
  ApplicantFilterGroups,
  ApplicantFilterSheet,
  ConfirmApplicantSheet,
  DEFAULT_FILTERS,
  DeclineApplicantSheet,
  SORT_LABEL,
  filtersActive,
  type ApplicantFilters,
} from "@/components/applications/ApplicantSheets";
import { NN_PAGE, RoleTheme, nnButton, shortRange } from "@/components/nn/ui";
import { canonicalPetType } from "@/lib/petTypes";
import { cn } from "@/lib/utils";

type Tab = "applied" | "shortlisted" | "accepted" | "past";
const TABS: { id: Tab; label: string }[] = [
  { id: "applied", label: "New" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "accepted", label: "Confirmed" },
  { id: "past", label: "Past" },
];
// Confirmed = an accepted application whose sit is still ahead or under way.
// A finished or cancelled sit moves to Past with the rest.
const tabOf = (a: Pick<Applicant, "status" | "sit_status">): Tab =>
  a.status === "applied"
    ? "applied"
    : a.status === "shortlisted"
      ? "shortlisted"
      : a.status === "accepted" && a.sit_status !== "completed" && a.sit_status !== "cancelled"
        ? "accepted"
        : "past";

/** Today's date (YYYY-MM-DD) where the home is. */
const todayIn = (timezone: string | null | undefined) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || undefined }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};
// Old links used ?status=declined or cancelled; both live under Past now.
const tabFromParam = (v: string | null): Tab =>
  v === "shortlisted" || v === "accepted" || v === "past" ? v : v === "declined" || v === "cancelled" || v === "withdrawn" ? "past" : "applied";

const EMPTY: Record<Tab, [string, string]> = {
  applied: ["No new applicants", "New applications for these dates show here. Inviting Nomads you like often helps."],
  shortlisted: ["No one shortlisted yet", "Tap the star on an applicant to keep them here."],
  accepted: ["No one confirmed yet", "When you confirm a Nomad for these dates, they show here."],
  past: ["Nothing here", "Finished sits and declined, withdrawn and cancelled applications show here."],
};

/** Applicants (design: ApplicantsPhone, ApplicantsTabletDark, ApplicantsDesktop). */
const Applications = () => {
  const { user, loading, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<ApplicantFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [earlierOpen, setEarlierOpen] = useState(false);

  const listingsQuery = useMyListings();
  const listings = listingsQuery.data ?? [];
  const listing = listings.find((l) => l.id === params.get("listing")) ?? listings.find((l) => l.status === "published") ?? listings[0];
  const applicantsQuery = useListingApplicants(listing?.id);
  const applicants = useMemo(() => applicantsQuery.data ?? [], [applicantsQuery.data]);
  const { data: completion } = useGuideCompletion(listing?.id, !!listing);

  // Your own first name (for the decline note) and country (Near me / Abroad).
  const { data: me } = useQuery({
    queryKey: ["applicants-me", user?.id],
    queryFn: async () => {
      const { data } = await fetchMyProfile();
      return data ? { first_name: data.first_name, country: data.country } : null;
    },
    enabled: !!user,
  });

  const toggleShortlist = useToggleShortlist();
  const confirm = useConfirmApplicant();
  const decline = useDeclineApplicant();
  const markSeen = useMarkApplicantsSeen();
  const startConversation = useStartConversation();

  const today = todayIn(listing?.timezone);
  // Every range on the listing, with how many applicants are waiting.
  const allRanges = useMemo(() => {
    if (!listing) return [];
    return [...listing.sit_dates]
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .map((d) => ({
        ...d,
        waiting: applicants.filter((a) => a.sit_dates_id === d.id && (a.status === "applied" || a.status === "shortlisted")).length,
      }));
  }, [listing, applicants]);
  // Chips: current and upcoming ranges. Past ones sit behind "Earlier dates".
  const ranges = allRanges.filter((r) => r.end_date >= today);
  const pastRanges = allRanges.filter((r) => r.end_date < today).reverse();

  const rangeParam = params.get("range");
  const range =
    allRanges.find((r) => r.id === rangeParam) ?? ranges.find((r) => r.waiting > 0) ?? ranges[0] ?? undefined;
  const pickedPast = !!range && range.end_date < today;
  const tab = tabFromParam(params.get("status"));

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const inRange = applicants.filter((a) => a.sit_dates_id === range?.id);
  const counts = Object.fromEntries(TABS.map((t) => [t.id, inRange.filter((a) => tabOf(a) === t.id).length])) as Record<Tab, number>;

  const visible = inRange
    .filter((a) => tabOf(a) === tab)
    .filter((a) => {
      if (filters.place === "any") return true;
      const same = !!me?.country && !!a.country && a.country.toLowerCase() === me.country.toLowerCase();
      return filters.place === "near" ? same : !same;
    })
    .filter((a) => {
      if (filters.pet === "any") return true;
      const types = a.pet_types.map(canonicalPetType);
      return filters.pet === "other" ? types.some((t) => !["dogs", "cats", "birds", "rabbits"].includes(t)) : types.includes(filters.pet);
    })
    .sort((a, b) => {
      if (filters.sort === "reviews") return b.review_count - a.review_count;
      if (filters.sort === "rating") return (Number(b.avg_rating) || -1) - (Number(a.avg_rating) || -1);
      if (filters.sort === "recent") return b.created_at.localeCompare(a.created_at);
      return a.start_date.localeCompare(b.start_date) || b.created_at.localeCompare(a.created_at);
    });

  // Welcome Guide nudge: only for a confirmed sit that hasn't started yet.
  const upcoming = applicants
    .filter((a) => a.status === "accepted" && a.sit_status === "confirmed" && a.start_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const showNudge = !!upcoming && !!completion && completion.percent < 100;

  // Keep a stale ?range= from pointing nowhere.
  useEffect(() => {
    if (rangeParam && allRanges.length > 0 && !allRanges.some((r) => r.id === rangeParam)) setParam("range", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeParam, allRanges]);

  if (loading) {
    return (
      <RoleTheme role="owner" className="min-h-screen">
        <Navbar wide />
        <main className={cn(NN_PAGE, "flex flex-col gap-4 pt-20 md:pt-24")}>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full rounded-[22px]" />
        </main>
      </RoleTheme>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (role !== "owner" && role !== "both") return <Navigate to="/dashboard" replace />;

  const find = (id: string | null) => applicants.find((a) => a.application_id === id);
  const confirmTarget = find(confirmId);
  const declineTarget = find(declineId);
  const nameOf = (a: Applicant | undefined) => a?.first_name || "this Nomad";
  const seen = (a: Applicant) => {
    if (!a.owner_seen && a.status === "applied") markSeen.mutate([a.application_id]);
  };
  const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

  const onStar = async (a: Applicant) => {
    seen(a);
    const shortlist = a.status !== "shortlisted";
    try {
      await toggleShortlist.mutateAsync({ applicationId: a.application_id, shortlist });
      toast({ title: shortlist ? `${nameOf(a)} is on your shortlist. We let them know.` : `${nameOf(a)} is back in New.` });
    } catch (e) {
      toast({ title: "That didn't work", description: errorText(e), variant: "destructive" });
    }
  };

  const onConfirm = async () => {
    if (!confirmTarget) return;
    try {
      const { declinedCount } = await confirm.mutateAsync(confirmTarget.application_id);
      setConfirmId(null);
      toast({
        title: `${nameOf(confirmTarget)} is confirmed. We told ${declinedCount || "no"} other ${declinedCount === 1 ? "applicant" : "applicants"}.`,
      });
      setParam("status", "accepted");
    } catch (e) {
      toast({ title: "Couldn't confirm", description: errorText(e), variant: "destructive" });
    }
  };

  const onDecline = async (note: string) => {
    if (!declineTarget) return;
    try {
      await decline.mutateAsync({ applicationId: declineTarget.application_id, note });
      setDeclineId(null);
      toast({ title: `We let ${nameOf(declineTarget)} know, kindly.` });
    } catch (e) {
      toast({ title: "Couldn't decline", description: errorText(e), variant: "destructive" });
    }
  };

  const onMessage = async (a: Applicant) => {
    seen(a);
    setMessagingId(a.application_id);
    try {
      const { conversationId } = await startConversation.mutateAsync({ otherUserId: a.sitter_user_id, listingId: listing?.id });
      navigate(`/inbox?conversation=${conversationId}`);
    } catch {
      toast({ title: "Couldn't open the chat", description: "Please try again.", variant: "destructive" });
    } finally {
      setMessagingId(null);
    }
  };

  const others = confirmTarget
    ? applicants.filter(
        (a) =>
          a.sit_dates_id === confirmTarget.sit_dates_id &&
          a.application_id !== confirmTarget.application_id &&
          (a.status === "applied" || a.status === "shortlisted"),
      ).length
    : 0;

  const header = (
    <div className="flex flex-col gap-1">
      <BackButton fallback="/dashboard" label="Dashboard" className="h-11 self-start" />
      <h1 className="font-display text-[32px] font-normal leading-tight lg:text-[38px]">Applicants</h1>
      <p className="text-[15px] text-muted-foreground">Nomads who would love to look after your pets.</p>
    </div>
  );

  const failed = listingsQuery.isError || applicantsQuery.isError;
  const loadingData = listingsQuery.isLoading || (!!listing && applicantsQuery.isLoading);

  const invite = (
    <div className="flex flex-col gap-2 rounded-[20px] border border-[var(--nn-border)] bg-card p-4">
      <p className="text-[15px] font-semibold">Want more choice? Invite Nomads you like.</p>
      <Link to="/browse-sitters" className={nnButton("secondary", "self-start")}>
        Browse Nomads
      </Link>
    </div>
  );

  return (
    <RoleTheme role="owner" className="flex min-h-screen flex-col">
      <Navbar wide />
      <main className={cn(NN_PAGE, "flex flex-1 flex-col gap-5 pb-24 pt-20 md:pt-24")}>
        {header}

        {loadingData ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full rounded-[18px]" />
            <Skeleton className="h-72 w-full rounded-[22px]" />
          </div>
        ) : failed ? (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-[22px] border border-border p-8 text-center">
            <p className="text-[17px] font-bold">We couldn't load your applicants</p>
            <p className="text-[15px] text-muted-foreground">Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => {
                listingsQuery.refetch();
                applicantsQuery.refetch();
              }}
              className={nnButton("primary")}
            >
              Try again
            </button>
          </div>
        ) : !listing ? (
          <div className="flex flex-col items-center gap-3 rounded-[22px] border border-dashed border-border p-8 text-center">
            <p className="text-[17px] font-bold">No listing yet</p>
            <p className="max-w-md text-[15px] text-muted-foreground">
              Create your listing and Nomads can start applying. You can also invite Nomads you like.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/create-listing" className={nnButton("primary")}>
                Create my listing
              </Link>
              <Link to="/browse-sitters" className={nnButton("secondary")}>
                Browse Nomads
              </Link>
            </div>
          </div>
        ) : (
          <>
            {listings.length > 1 && (
              <div role="group" aria-label="Your listings" className="flex flex-wrap gap-2">
                {listings.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={l.id === listing.id}
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.set("listing", l.id);
                      next.delete("range");
                      setParams(next, { replace: true });
                    }}
                    className={cn(
                      "min-h-11 rounded-full border-[1.5px] px-4 text-sm",
                      l.id === listing.id ? "border-[var(--nn-accent)] bg-[var(--nn-tint)] font-bold" : "border-border bg-card font-semibold",
                    )}
                  >
                    {l.title}
                  </button>
                ))}
              </div>
            )}

            <section aria-labelledby="ranges-title" className="flex flex-col gap-2">
              <h2 id="ranges-title" className="font-sans text-[15px] font-semibold text-muted-foreground">
                {listing.title} · pick your dates
              </h2>
              {ranges.length === 0 && (
                <p className="text-[15px] text-muted-foreground">
                  No upcoming dates.{" "}
                  <Link to={`/edit-listing/${listing.id}?focus=dates`} className="font-bold text-[var(--nn-accent-dark)] underline underline-offset-2">
                    Add new dates
                  </Link>
                </p>
              )}
              {(ranges.length > 0 || pastRanges.length > 0) && (
                <div role="group" aria-label="Date ranges" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
                  {[...ranges, ...(pickedPast && range ? [range] : [])].map((r) => {
                    const on = r.id === range?.id;
                    const past = r.end_date < today;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setParam("range", r.id)}
                        className={cn(
                          "flex min-h-[56px] shrink-0 flex-col items-start justify-center rounded-2xl px-4 py-2 text-left",
                          on ? "border-2 border-[var(--nn-accent)] bg-[var(--nn-tint)]" : "border-[1.5px] border-border bg-card",
                        )}
                      >
                        <span className="text-[15px] font-bold">{shortRange(r.start_date, r.end_date)}</span>
                        <span className={cn("text-sm font-semibold", on ? "text-[var(--nn-accent-dark)]" : "text-muted-foreground")}>
                          {past ? "Earlier" : `${r.waiting} waiting`}
                        </span>
                      </button>
                    );
                  })}
                  {pastRanges.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEarlierOpen(true)}
                      aria-haspopup="dialog"
                      className="flex min-h-[56px] shrink-0 flex-col items-start justify-center rounded-2xl border-[1.5px] border-dashed border-border bg-card px-4 py-2 text-left"
                    >
                      <span className="text-[15px] font-bold">Earlier dates</span>
                      <span className="text-sm font-semibold text-muted-foreground">
                        {pastRanges.length} {pastRanges.length === 1 ? "range" : "ranges"}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </section>

            {range && (
            <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-8">
              {/* Desktop: the filters stay open on the left. */}
              <aside className="hidden flex-col gap-5 lg:sticky lg:top-24 lg:flex" aria-label="Sort and filter">
                <ApplicantFilterGroups value={filters} onChange={setFilters} />
                {invite}
              </aside>

              <div className="flex min-w-0 flex-col gap-4">
                <div role="tablist" aria-label="Applicants by status" className="grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => setParam("status", t.id === "applied" ? null : t.id)}
                      className={cn(
                        "flex min-h-[52px] flex-col items-center justify-center rounded-xl text-[13px] sm:text-sm",
                        tab === t.id ? "bg-card font-bold shadow-sm" : "font-semibold text-muted-foreground",
                      )}
                    >
                      <span>{t.label}</span>
                      <span>{counts[t.id]}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3 lg:hidden">
                  <p className="text-[15px] text-muted-foreground">
                    {visible.length} {visible.length === 1 ? "applicant" : "applicants"} · {SORT_LABEL[filters.sort].toLowerCase()}
                  </p>
                  <button type="button" onClick={() => setFiltersOpen(true)} className={nnButton("secondary", "relative shrink-0")}>
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                    Sort and filter
                    {filtersActive(filters) && (
                      <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[var(--nn-accent)]">
                        <span className="sr-only">Filters are on</span>
                      </span>
                    )}
                  </button>
                </div>

                {showNudge && tab === "accepted" && (
                  <div className="flex flex-col gap-2 rounded-[20px] border border-[var(--nn-border)] bg-[var(--nn-soft)] p-4">
                    <p className="flex items-center gap-2 text-[16px] font-bold">
                      <BookOpen className="h-5 w-5 text-[var(--nn-accent-dark)]" aria-hidden="true" />
                      Get ready for {upcoming.first_name || "your Nomad"}
                    </p>
                    <p className="text-[15px]">
                      Your Welcome Guide is {completion!.percent}% done. {upcoming.first_name || "Your Nomad"} sees it 48 hours before they
                      arrive.
                    </p>
                    <Link to={`/listing/${listing.id}/welcome-guide`} className={nnButton("primary", "self-start")}>
                      Finish
                    </Link>
                  </div>
                )}

                {visible.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-[22px] border border-dashed border-border p-8 text-center">
                    <p className="text-[17px] font-bold">{EMPTY[tab][0]}</p>
                    <p className="max-w-md text-[15px] text-muted-foreground">{EMPTY[tab][1]}</p>
                    <Link to="/browse-sitters" className={nnButton("secondary", "mt-1")}>
                      Invite Nomads
                    </Link>
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {visible.map((a) => (
                      <ApplicantCard
                        key={a.application_id}
                        applicant={a}
                        listingCity={listing.city}
                        busy={toggleShortlist.isPending || confirm.isPending || decline.isPending}
                        messaging={messagingId === a.application_id}
                        onStar={() => onStar(a)}
                        onConfirm={() => {
                          seen(a);
                          setConfirmId(a.application_id);
                        }}
                        onDecline={() => {
                          seen(a);
                          setDeclineId(a.application_id);
                        }}
                        onMessage={() => onMessage(a)}
                        onSeen={() => seen(a)}
                      />
                    ))}
                  </div>
                )}

                <div className="lg:hidden">{invite}</div>
              </div>
            </div>
            )}
          </>
        )}
      </main>

      <ResponsiveSheet open={earlierOpen} onOpenChange={setEarlierOpen} title="Earlier dates" description="Pick an earlier date range to see its applicants">
        <ul className="flex flex-col gap-2">
          {pastRanges.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setParam("range", r.id);
                  setEarlierOpen(false);
                }}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl border-[1.5px] border-border bg-card px-4 text-left"
              >
                <span className="text-[16px] font-bold">{`${shortRange(r.start_date, r.end_date)} ${r.end_date.slice(0, 4)}`}</span>
                <span className="text-sm text-muted-foreground">
                  {applicants.filter((x) => x.sit_dates_id === r.id).length} applicants
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ResponsiveSheet>
      <ApplicantFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} value={filters} onApply={setFilters} />
      <ConfirmApplicantSheet
        open={!!confirmTarget}
        onOpenChange={(o) => !o && setConfirmId(null)}
        name={nameOf(confirmTarget)}
        dates={confirmTarget ? shortRange(confirmTarget.start_date, confirmTarget.end_date) : ""}
        sitterUserId={confirmTarget?.sitter_user_id}
        others={others}
        pending={confirm.isPending}
        onConfirm={onConfirm}
      />
      <DeclineApplicantSheet
        open={!!declineTarget}
        onOpenChange={(o) => !o && setDeclineId(null)}
        name={nameOf(declineTarget)}
        ownerFirstName={me?.first_name ?? null}
        pending={decline.isPending}
        onDecline={onDecline}
      />
    </RoleTheme>
  );
};

export default Applications;
