import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Calendar, Flag, Home, Loader2, Lock, MapPin, PawPrint, RefreshCw, Star } from "lucide-react";
import { toast } from "sonner";
import { BackButton } from "@/components/layout/BackButton";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { NN_MAIN, RoleTheme, nnButton } from "@/components/nn/ui";
import ReviewReportDialog from "@/components/reviews/ReviewReportDialog";
import ReviewsDropdown, { type DropdownOption } from "@/components/reviews/ReviewsDropdown";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { publicProfiles } from "@/lib/publicProfile";
import { cn } from "@/lib/utils";
import { wordFilterMessage } from "@/lib/wordFilter";
import {
  REVIEW_CATEGORIES,
  dayMonth,
  highlightLabel,
  monthYear,
  petsSummary,
  useMemberReviewSummary,
  useMemberReviews,
  useMyWaitingReviews,
  type MemberReview,
  type ReviewFilter,
  type ReviewSide,
  type ReviewSort,
} from "@/lib/reviews";

const FILTERS: DropdownOption<ReviewFilter>[] = [
  { id: "all", label: "All reviews" },
  { id: "5", label: "5 stars" },
  { id: "4", label: "4 stars" },
  { id: "3", label: "3 stars and below" },
  { id: "written", label: "With written reviews" },
];

// Same ordering as before: "recent" by date, "relevant" puts recent reviews
// with more detail first.
const SORTS: DropdownOption<ReviewSort>[] = [
  { id: "recent", label: "Newest first" },
  { id: "relevant", label: "Most helpful", hint: "Recent reviews with more detail first" },
];

const Stars = ({ value, className }: { value: number; className?: string }) => {
  const n = Math.round(value);
  return (
    <span role="img" aria-label={`${value.toFixed(1)} out of 5 stars`} className={cn("flex gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={cn("h-4 w-4", s <= n ? "fill-[#E8B53E] text-[#E8B53E]" : "text-muted-foreground")} aria-hidden="true" />
      ))}
    </span>
  );
};

const Bar = ({ label, value, track = "bg-[var(--nn-chip)]" }: { label: string; value: number; track?: string }) => (
  <div className="flex min-h-[34px] items-center gap-2.5 text-sm">
    <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
    <span aria-hidden="true" className={cn("flex h-2 w-24 shrink-0 overflow-hidden rounded-full", track)}>
      <span className="rounded-full bg-[var(--nn-accent)]" style={{ width: `${Math.max(0, Math.min(100, (value / 5) * 100))}%` }} />
    </span>
    <span className="w-8 shrink-0 text-right font-bold">{value.toFixed(1)}</span>
  </div>
);

const Pill = ({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) => (
  <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-[13px] font-semibold">
    <Icon className="h-[15px] w-[15px] shrink-0 text-muted-foreground" aria-hidden="true" />
    {children}
  </span>
);

const StateCard = ({
  icon: Icon,
  title,
  text,
  action,
  warn,
}: {
  icon: typeof Star;
  title: string;
  text: string;
  action?: React.ReactNode;
  warn?: boolean;
}) => (
  <section className="mt-3 flex flex-col items-center gap-3 rounded-[24px] bg-muted px-5 py-7 text-center md:max-w-2xl">
    <span
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-full",
        warn ? "bg-[var(--nn-tip-bg)] text-[var(--nn-tip-text)]" : "bg-card text-muted-foreground",
      )}
    >
      <Icon className="h-[30px] w-[30px]" aria-hidden="true" />
    </span>
    <h2 className="font-display text-[26px] font-normal leading-tight">{title}</h2>
    <p className="max-w-md text-[15px] text-muted-foreground">{text}</p>
    {action}
  </section>
);

/** Reviews of a Nomad (side "sitter") or a Pet Parent (side "owner"). First names only. */
const ReviewsPage = ({ side }: { side: ReviewSide }) => {
  const { userId } = useParams<{ userId: string }>();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const own = !!user && user.id === userId;
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [reporting, setReporting] = useState<MemberReview | null>(null);

  const { data: subject = null } = useQuery({
    queryKey: ["review-subject", userId, own],
    queryFn: async () => {
      const { data } = own
        ? await supabase.from("profiles").select("first_name, city, country").eq("id", userId!).maybeSingle()
        : await publicProfiles("first_name, city, country").eq("id", userId!).maybeSingle();
      return (data as unknown as { first_name: string | null; city: string | null; country: string | null } | null) ?? null;
    },
    enabled: !!user && !!userId,
  });
  const name = subject?.first_name?.trim() || (side === "sitter" ? "this Nomad" : "this Pet Parent");

  const summary = useMemberReviewSummary(userId, side, !!user);
  const list = useMemberReviews(userId, side, filter, sort, !!user);
  const waiting = useMyWaitingReviews(own);
  const reviews = list.data?.pages.flat() ?? [];
  const sum = summary.data;
  const failed = summary.isError || list.isError;
  const loading = authLoading || summary.isLoading || (list.isLoading && !list.data);
  const noReviews = !loading && !failed && (sum?.count ?? 0) === 0;

  const profilePath = side === "sitter" ? `/sitter/${userId}` : `/owner/${userId}`;
  const backTo = own ? `${profilePath}?preview=1` : profilePath;
  const backLabel = own ? "My profile" : subject?.first_name ? `${subject.first_name}'s profile` : "Back";
  const place = [subject?.city, subject?.country].filter(Boolean).join(", ");
  const title = own ? "Reviews about you" : side === "sitter" ? `Reviews for ${name}` : "Reviews from Nomads";
  const subtitle = own
    ? side === "sitter"
      ? "Pet Parents see these on your profile. You can reply once to each review."
      : "Nomads see these on your profile. You can reply once to each review."
    : side === "sitter"
      ? `What Pet Parents said after ${name} looked after their homes and pets.`
      : `Reviews of ${name}'s home and pets${place ? ` in ${place}` : ""}.`;
  const reviewers = side === "sitter" ? "Pet Parents" : "Nomads";
  const myWaiting = (waiting.data ?? []).filter((w) => w.side === side);

  const retry = () => {
    void summary.refetch();
    void list.refetch();
  };

  const refreshAfterReply = () => {
    void queryClient.invalidateQueries({ queryKey: ["member-reviews", userId, side] });
  };

  const header = (
    <>
      <BackButton fallback={backTo} label={backLabel} className="h-11 self-start" />
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[32px] font-normal leading-tight lg:text-[38px]">{title}</h1>
        {user && !failed && !noReviews && <p className="max-w-2xl text-[15px] text-muted-foreground">{subtitle}</p>}
      </div>
    </>
  );

  if (!authLoading && !user) {
    return (
      <RoleTheme role={side} className="flex min-h-screen flex-col">
        <Navbar wide />
        <main className={NN_MAIN}>
          <BackButton fallback={profilePath} label="Back" className="h-11 self-start" />
          <StateCard
            icon={Lock}
            title="Sign in to see these reviews"
            text={
              side === "sitter"
                ? "Nomad profiles are only visible to members, to protect their privacy."
                : "Pet Parent profiles are for members only, to keep homes and families safe."
            }
            action={
              <Link to="/auth" className={nnButton("primary", "h-[52px] w-full max-w-sm text-base")}>
                Log in or join free
              </Link>
            }
          />
        </main>
        <Footer />
      </RoleTheme>
    );
  }

  const summaryCard = sum && sum.count > 0 && (
    <section
      aria-label="Rating summary"
      className="flex flex-col gap-3 rounded-[24px] bg-[var(--nn-tint)] p-5 md:grid md:grid-cols-[240px_minmax(0,1fr)] md:items-center md:gap-6 lg:flex lg:flex-col lg:items-stretch lg:gap-3"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3.5">
          <span className="font-display text-[60px] leading-none">{(sum.average ?? 0).toFixed(1)}</span>
          <span className="flex flex-col gap-1">
            <Stars value={sum.average ?? 0} />
            <span className="text-[15px] font-bold">
              {sum.count} {sum.count === 1 ? "review" : "reviews"}
            </span>
            <span className="text-[13px] leading-snug text-muted-foreground">Every review is from a sit on NomadNest</span>
          </span>
        </div>
        {sum.would_again_pct != null && (
          <div className="flex items-center gap-2.5 rounded-[14px] bg-card/75 px-3 py-2.5">
            <RefreshCw className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="text-sm leading-snug">
              <span className="font-bold">{sum.would_again_pct}%</span>{" "}
              {side === "sitter" ? `of Pet Parents would have ${name} again` : `of Nomads would sit for ${name} again`}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col border-t border-foreground/10 pt-1.5 md:border-t-0 md:pt-0 lg:border-t lg:pt-1.5">
        {REVIEW_CATEGORIES[side].map((c) =>
          sum.categories[c.key] != null ? <Bar key={c.key} label={c.label} value={Number(sum.categories[c.key])} track="bg-card/90" /> : null,
        )}
      </div>
    </section>
  );

  const highlights = (sum?.highlights ?? [])
    .map((h) => ({ label: highlightLabel(side, h.key), n: h.n }))
    .filter((h): h is { label: string; n: number } => !!h.label);
  const aiCard = sum && (sum.ai_summary || highlights.length > 0) && (
    <section aria-label="Summary of reviews" className="flex flex-col gap-2.5 rounded-[20px] border border-[var(--nn-border)] bg-card p-4">
      {sum.ai_summary && (
        <>
          <span className="flex items-center gap-2 text-[16px] font-bold">
            <span aria-hidden="true" className="text-lg text-[var(--nn-tip-text)]">
              ✦
            </span>
            What {reviewers} say
          </span>
          <p className="text-[15px] leading-relaxed">{sum.ai_summary}</p>
          <span className="text-xs text-muted-foreground">
            Written by AI from {sum.ai_review_count ?? sum.count} reviews. It can make mistakes.
          </span>
        </>
      )}
      {highlights.length > 0 && (
        <div className={cn("flex flex-col gap-2.5", sum.ai_summary && "border-t border-[var(--nn-border)] pt-3")}>
          <span className="text-sm font-bold">{reviewers} often mention</span>
          <ul className="flex flex-wrap gap-2">
            {highlights.map((h) => (
              <li key={h.label} className="inline-flex min-h-[34px] items-center gap-0.5 rounded-full bg-[var(--nn-tint)] px-3 text-[13px] font-semibold">
                {h.label} <span className="font-extrabold">· {h.n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );

  const waitingCards = own && myWaiting.length > 0 && (
    <div className="flex flex-col gap-3">
      {myWaiting.map((w) => (
        <section key={w.sit_id} className="flex flex-col gap-2.5 rounded-[20px] bg-[var(--nn-tip-bg)] p-4 text-[var(--nn-tip-text)]">
          <span className="flex gap-2.5">
            <Lock className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[16px] font-bold">A review from {w.reviewer_first_name} is waiting</span>
              <span className="text-sm leading-normal">
                Write yours to see it. Both reviews appear together, or on {dayMonth(w.publish_by)} at the latest.
              </span>
            </span>
          </span>
          <Link
            to={`/dashboard?mode=${w.my_role}&openReview=${w.sit_id}`}
            className={nnButton("primary", "h-12 w-full rounded-[14px] text-[15px] md:w-auto md:self-start md:px-8")}
          >
            Write my review
          </Link>
        </section>
      ))}
    </div>
  );

  const controls = (
    <div className="flex gap-2.5">
      <ReviewsDropdown<ReviewFilter> label="Show" value={filter} options={FILTERS} onChange={setFilter} />
      <ReviewsDropdown<ReviewSort> label="Sort" value={sort} options={SORTS} onChange={setSort} />
    </div>
  );

  const listBody = (
    <div className="flex flex-col gap-4">
      {reviews.map((r) => (
        <ReviewCard
          key={r.id}
          review={r}
          side={side}
          name={name}
          own={own}
          onReport={() => setReporting(r)}
          onReplyChanged={refreshAfterReply}
        />
      ))}
      {!list.isLoading && reviews.length === 0 && (
        <div className="flex flex-col items-center gap-2.5 rounded-[20px] bg-muted p-5 text-center">
          <span className="text-[16px] font-bold">No reviews match</span>
          <button type="button" onClick={() => setFilter("all")} className={nnButton("secondary", "rounded-xl")}>
            Show all reviews
          </button>
        </div>
      )}
      {list.hasNextPage && (
        <button
          type="button"
          onClick={() => void list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
          className={nnButton("secondary", "h-[50px] w-full rounded-[14px] text-[15px]")}
        >
          {list.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Show more reviews
        </button>
      )}
    </div>
  );

  return (
    <RoleTheme role={side} className="flex min-h-screen flex-col">
      <Navbar wide />
      <main className={NN_MAIN}>
        {header}
        {waitingCards}
        {loading ? (
          <Skeleton className="h-72 w-full rounded-[24px]" />
        ) : failed ? (
          <StateCard
            icon={AlertTriangle}
            warn
            title="We couldn't load these reviews"
            text="Check your connection and try again."
            action={
              <button type="button" onClick={retry} className={nnButton("primary", "h-[52px] w-full max-w-sm text-base")}>
                Try again
              </button>
            }
          />
        ) : noReviews ? (
          <StateCard
            icon={Star}
            title="No reviews yet"
            text={
              own
                ? "Reviews appear here after you finish a sit. Every review comes from a real sit on NomadNest."
                : `Reviews appear here after ${name} finishes a sit. Every review comes from a real sit on NomadNest.`
            }
          />
        ) : (
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
            <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24">
              {summaryCard}
              {aiCard}
            </aside>
            <div className="flex min-w-0 flex-col gap-4">
              {controls}
              {listBody}
            </div>
          </div>
        )}
      </main>
      <Footer />
      {reporting && (
        <ReviewReportDialog
          reviewId={reporting.id}
          reviewerName={reporting.reviewer_first_name ?? (reporting.reviewer_gone ? "Former member" : side === "sitter" ? "A Pet Parent" : "A Nomad")}
          open={!!reporting}
          onOpenChange={(o) => !o && setReporting(null)}
        />
      )}
    </RoleTheme>
  );
};

const ReviewCard = ({
  review: r,
  side,
  name,
  own,
  onReport,
  onReplyChanged,
}: {
  review: MemberReview;
  side: ReviewSide;
  name: string;
  own: boolean;
  onReport: () => void;
  onReplyChanged: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const fallback = r.reviewer_gone ? "Former member" : side === "sitter" ? "A Pet Parent" : "A Nomad";
  const reviewerName = r.reviewer_first_name ?? fallback;
  const known = !!r.reviewer_first_name && !r.reviewer_gone;
  const role = known ? (side === "sitter" ? "Pet Parent" : "Nomad") : null;
  const href = side === "sitter" ? (r.link_listing_id ? `/listing/${r.link_listing_id}` : null) : r.link_profile_id ? `/sitter/${r.link_profile_id}` : null;
  const cats = REVIEW_CATEGORIES[side].filter((c) => r.categories[c.key] != null);
  const when = [monthYear(r.sit_month), r.nights ? `${r.nights} ${r.nights === 1 ? "night" : "nights"}` : null].filter(Boolean).join(" · ");
  const pets = petsSummary(r.pets);
  const place = side === "sitter" ? [r.city, r.country].filter(Boolean).join(", ") : "";

  const avatar = (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[17px] font-bold">
      {known && r.reviewer_avatar_url ? <img src={r.reviewer_avatar_url} alt="" className="h-full w-full object-cover" /> : known ? reviewerName.charAt(0) : "?"}
    </span>
  );

  const saveReply = async () => {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = editing
      ? await supabase.from("review_replies").update({ body }).eq("review_id", r.id)
      : await supabase.from("review_replies").insert({ review_id: r.id, author_user_id: auth.user?.id ?? "", body });
    setSaving(false);
    if (error) {
      toast.error(wordFilterMessage(error) ?? "Your reply wasn't posted. Please try again.");
      return;
    }
    toast.success(editing ? "Reply updated" : "Reply posted");
    setComposing(false);
    setEditing(false);
    onReplyChanged();
  };

  const deleteReply = async () => {
    setSaving(true);
    const { error } = await supabase.from("review_replies").delete().eq("review_id", r.id);
    setSaving(false);
    if (error) {
      toast.error("Your reply wasn't deleted. Please try again.");
      return;
    }
    toast.success("Reply deleted");
    onReplyChanged();
  };

  return (
    <article className="flex flex-col gap-3 rounded-[22px] border border-[var(--nn-border)] bg-card p-4 md:p-[18px]">
      <div className="flex items-center gap-3">
        {href && known ? (
          <Link
            to={href}
            aria-label={side === "sitter" ? `See ${reviewerName}'s listing` : `See ${reviewerName}'s profile`}
            className="relative block h-12 w-12 shrink-0 rounded-full"
          >
            {avatar}
            {side === "sitter" && (
              <span
                aria-hidden="true"
                className="absolute -bottom-1 -right-1 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-card bg-brand-teal text-primary-foreground"
              >
                <Home className="h-3 w-3" />
              </span>
            )}
          </Link>
        ) : (
          avatar
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[16px] font-bold">{reviewerName}</span>
            {role && (
              <span
                className={cn(
                  "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold",
                  role === "Pet Parent" ? "bg-brand-teal-light text-brand-teal-text" : "bg-brand-coral-light text-brand-coral-text",
                )}
              >
                {role}
              </span>
            )}
            {r.sits_together >= 2 && (
              <span className="inline-flex h-6 items-center rounded-full bg-[var(--nn-tip-bg)] px-2.5 text-xs font-bold text-[var(--nn-tip-text)]">
                {r.sits_together} sits together
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <Stars value={Number(r.score)} />
            <span className="text-[13px] font-bold">{Number(r.score).toFixed(1)}</span>
          </span>
        </span>
      </div>

      {(place || when || pets) && (
        <div className="flex flex-wrap gap-2">
          {place && <Pill icon={MapPin}>{place}</Pill>}
          {when && <Pill icon={Calendar}>{when}</Pill>}
          {pets && <Pill icon={PawPrint}>{pets}</Pill>}
        </div>
      )}

      {r.text ? (
        <p className="whitespace-pre-line text-[16px] leading-relaxed">“{r.text}”</p>
      ) : (
        <p className="text-[15px] italic text-muted-foreground">No written review for this sit.</p>
      )}

      {r.would_again && (
        <span className="flex items-center gap-1.5 text-sm font-bold text-brand-teal-text">
          <span aria-hidden="true">✓</span>
          {side === "sitter" ? `Would have ${name} again` : `Would sit for ${name} again`}
        </span>
      )}

      {r.reply_body && !editing && (
        <div className="ml-3 flex flex-col gap-1 rounded-r-[14px] border-l-[3px] border-[var(--nn-border)] bg-muted px-3.5 py-3">
          <span className="text-[13px] font-bold">
            Reply from {own ? "you" : name}
            {r.reply_at ? ` · ${dayMonth(r.reply_at)}` : ""}
          </span>
          <span className="whitespace-pre-line text-[15px] leading-normal">{r.reply_body}</span>
          {own && (
            <span className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  setDraft(r.reply_body ?? "");
                  setEditing(true);
                  setComposing(true);
                }}
                className="min-h-11 px-1 text-sm font-bold text-[var(--nn-accent-dark)]"
              >
                Edit reply
              </button>
              <button type="button" onClick={deleteReply} disabled={saving} className="min-h-11 px-2 text-sm font-semibold text-muted-foreground">
                Delete reply
              </button>
            </span>
          )}
        </div>
      )}

      {own && composing && (
        <div className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-[var(--nn-accent)] p-3.5">
          <label htmlFor={`reply-${r.id}`} className="text-sm font-bold">
            Your public reply
          </label>
          <Textarea
            id={`reply-${r.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={3}
            className="min-h-[76px] text-[15px]"
          />
          <span className="flex justify-between gap-2 text-[13px] leading-snug text-muted-foreground">
            <span>Replies show under the review for everyone. One reply per review. You can edit or delete it later.</span>
            <span className="shrink-0">{draft.length} / 500</span>
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setEditing(false);
              }}
              className={nnButton("secondary", "h-[46px] rounded-xl px-[18px] text-[15px]")}
            >
              Cancel
            </button>
            <button type="button" onClick={saveReply} disabled={saving || !draft.trim()} className={nnButton("primary", "h-[46px] flex-1 rounded-xl text-[15px]")}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {editing ? "Save reply" : "Post reply"}
            </button>
          </span>
        </div>
      )}

      {open && cats.length > 0 && (
        <div id={`cats-${r.id}`} className="flex flex-col border-t border-[var(--nn-border)] pt-1 md:grid md:grid-cols-2 md:gap-x-7">
          {cats.map((c) => (
            <Bar key={c.key} label={c.label} value={Number(r.categories[c.key])} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {cats.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`cats-${r.id}`}
            onClick={() => setOpen(!open)}
            className="min-h-11 text-sm font-bold text-[var(--nn-accent-dark)]"
          >
            {open ? "Hide the details" : "See the details"}
          </button>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-1">
          {own && r.can_reply && !composing && (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                setComposing(true);
              }}
              className={nnButton("secondary", "h-11 rounded-xl px-3.5")}
            >
              Reply publicly
            </button>
          )}
          <button
            type="button"
            onClick={onReport}
            aria-label={`Report ${reviewerName}'s review`}
            className="flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-muted-foreground"
          >
            <Flag className="h-4 w-4" aria-hidden="true" />
            Report
          </button>
        </span>
      </div>
    </article>
  );
};

export default ReviewsPage;
