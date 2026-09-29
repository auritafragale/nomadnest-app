import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, Image as ImageIcon, Info, Link2, Loader2, Share2, Sparkles, X } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BackButton } from "@/components/layout/BackButton";
import WriteReviewDialog from "@/components/reviews/WriteReviewDialog";
import ReportDialog from "@/components/reports/ReportDialog";
import { PhotoPicker, ShareCardMaker } from "@/components/stories/StoryShare";
import { SerifTitle, nnButton, shortRange } from "@/components/nn/ui";
import { useSitStoryActions, type SitStory } from "@/hooks/useSitStories";
import { useSits } from "@/hooks/useSits";
import { useOwnerListings } from "@/hooks/useOwnerListings";
import { useCreateInvite } from "@/hooks/useSitterInvites";
import { resolveListingConversation } from "@/lib/conversations";
import { cn } from "@/lib/utils";

const dayLabel = (iso: string, index: number) => {
  const d = new Date(`${iso}T12:00:00`);
  return `Day ${index + 1} · ${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`;
};

const run = (p: Promise<unknown>, ok: string) =>
  p.then(() => toast.success(ok)).catch((err: Error) => toast.error(err.message || "That didn't work. Please try again."));

/** Invite the same Nomad again, to one of your open date ranges. */
const InviteAgainDialog = ({ story, open, onOpenChange }: { story: SitStory; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const { data: listings = [] } = useOwnerListings();
  const createInvite = useCreateInvite();
  const today = new Date().toISOString().slice(0, 10);
  const options = listings
    .filter((l) => l.status === "published")
    .flatMap((l) => l.sit_dates.filter((d) => d.status === "open" && d.end_date >= today).map((d) => ({ listing: l, date: d })));
  const [picked, setPicked] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const choice = options.find((o) => o.date.id === picked) ?? options[0];

  const send = () => {
    if (!choice || !story.sitter_user_id || !story.owner_user_id) return;
    createInvite.mutate(
      {
        listing_id: choice.listing.id,
        sit_dates_id: choice.date.id,
        owner_user_id: story.owner_user_id,
        sitter_user_id: story.sitter_user_id,
        message: `${story.sitter_first_name}, we loved having you. Would you sit for us again?`,
        listingTitle: choice.listing.title,
        startDate: choice.date.start_date,
        endDate: choice.date.end_date,
      },
      {
        onSuccess: () => {
          setSent(true);
          onOpenChange(false);
          toast.success(`Invitation sent to ${story.sitter_first_name}`);
        },
        onError: (err) => toast.error((err as Error).message || "The invitation couldn't be sent."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogTitle className="font-display text-2xl font-normal">Invite {story.sitter_first_name} again</DialogTitle>
        {options.length === 0 ? (
          <>
            <DialogDescription>Add open dates to your listing first, then invite {story.sitter_first_name} to them.</DialogDescription>
            <Link to={`/edit-listing/${listings[0]?.id ?? ""}?focus=dates`} className={nnButton("primary")}>
              Add new dates
            </Link>
          </>
        ) : (
          <>
            <DialogDescription>Choose the dates to invite {story.sitter_first_name} to.</DialogDescription>
            <div role="radiogroup" aria-label="Dates" className="flex flex-col gap-2">
              {options.map((o) => {
                const on = (choice?.date.id ?? null) === o.date.id;
                return (
                  <button
                    key={o.date.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPicked(o.date.id)}
                    className={cn(
                      "flex min-h-[52px] items-center justify-between rounded-2xl border-[1.5px] px-4 text-left",
                      on ? "border-brand-teal bg-[#F3F8F6]" : "border-[#D3E7E1]",
                    )}
                  >
                    <span>
                      <span className="block text-[15px] font-bold">{shortRange(o.date.start_date, o.date.end_date)}</span>
                      <span className="block text-xs text-[#656B74]">{o.listing.title}</span>
                    </span>
                    {on && <Check className="h-5 w-5 text-brand-teal-text" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={send} disabled={createInvite.isPending || sent} className={nnButton("primary", "h-[52px]")}>
              {createInvite.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Send invitation
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** Sit Story, Pet Parent view (design: ParentSitStory.dc.html). */
export const ParentStoryView = ({
  story,
  urls,
  paragraphs,
  onReviewed,
}: {
  story: SitStory;
  urls: Record<string, string>;
  paragraphs: string[];
  onReviewed: () => void;
}) => {
  const navigate = useNavigate();
  const { decidePortfolio, removePortfolioPhoto, withdrawPortfolio, createShareLink, disableShareLink } = useSitStoryActions(story.id);
  const { data: sits = [] } = useSits();
  const sit = sits.find((s) => s.id === story.sit_id);
  const nomad = story.sitter_first_name;
  const status = story.portfolio_status;
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const coverPath = story.photo_paths.find((p) => urls[p]);
  const cover = coverPath ? urls[coverPath] : undefined;
  const altOf = (p: string) => story.photo_alt?.[p] ?? "";
  const nights =
    story.start_date && story.end_date
      ? Math.round((new Date(`${story.end_date}T12:00:00`).getTime() - new Date(`${story.start_date}T12:00:00`).getTime()) / 86_400_000) + 1
      : null;
  const shownPhotos = status === "approved" ? story.portfolio_photo_paths ?? [] : [];

  const openChat = async () => {
    if (!sit) return navigate("/inbox");
    try {
      const id = await resolveListingConversation({
        listingId: sit.listing_id,
        ownerUserId: sit.owner_user_id,
        sitterUserId: sit.sitter_user_id,
      });
      navigate(id ? `/inbox?conversation=${id}` : "/inbox");
    } catch {
      navigate("/inbox");
    }
  };

  const copyLink = async () => {
    try {
      const token = story.share_link?.token ?? (await createShareLink.mutateAsync());
      const url = `${window.location.origin}/s/${token}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
    } catch (err) {
      toast.error((err as Error).message || "The link couldn't be created.");
    }
  };

  const profileText =
    status === "approved"
      ? `Future Pet Parents can read this story on ${nomad}'s profile. You can take it off at any time.`
      : status === "requested"
        ? `${nomad} asked to show this story on their profile. Choose up to 2 photos to show with it, or none.`
        : status === "revoked"
          ? `You took this story off ${nomad}'s profile. It can't be added again.`
          : status === "declined"
            ? `You kept this story private.`
            : `${nomad} hasn't asked to show it on their profile.`;

  return (
    <div className="flex flex-col gap-[18px] pb-8 md:max-w-3xl lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-8 lg:gap-y-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="order-1 flex items-center justify-between lg:order-none lg:col-span-2">
        <BackButton fallback="/dashboard" className="h-11" />
        <button
          type="button"
          aria-label="Share your story"
          onClick={() => {
            setShareOpen(true);
            window.setTimeout(() => document.getElementById("share-options")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-[#CFE3DD]"
        >
          <Share2 className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
      <div className="relative order-2 -mx-5 h-[240px] bg-[#D6B98F] sm:mx-0 sm:rounded-[24px] sm:overflow-hidden lg:order-none lg:h-[340px]">
        {cover && <img src={cover} alt={coverPath ? altOf(coverPath) : ""} className="h-full w-full object-cover" />}
        <span className="absolute bottom-3.5 left-4 inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-brand-teal-text">
          Sit Story
        </span>
      </div>

      <section aria-label="About this sit" className="order-3 flex flex-col gap-3 lg:order-none">
        <h1 className="font-display text-[32px] font-normal leading-[1.08] lg:text-[40px]">{story.title}</h1>
        <p className="text-sm text-[#656B74]">
          {[sit?.listing?.title, story.start_date && story.end_date && shortRange(story.start_date, story.end_date), nights && `${nights} ${nights === 1 ? "day" : "days"}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {story.sitter_user_id && (
          <div className="flex items-center gap-3 rounded-[18px] border border-[#D3E7E1] px-3.5 py-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D8C3B0] text-base font-bold text-[#5A4636]">
              {story.sitter_avatar_url ? <img src={story.sitter_avatar_url} alt="" className="h-full w-full object-cover" /> : nomad.slice(0, 1)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-bold">{nomad}</span>
              <span className="text-[13px] text-[#656B74]">Your Nomad for this sit</span>
            </span>
            <button type="button" onClick={openChat} className="inline-flex h-11 items-center rounded-full border-[1.5px] border-[#CFE3DD] px-3.5 text-[13px] font-bold">
              Message
            </button>
          </div>
        )}
      </section>

        <section aria-label="The story" className="order-5 flex flex-col gap-4 lg:order-none">
          {story.story_days && story.story_days.length > 0
            ? story.story_days.map((d, i) => (
                <div key={d.date} className="flex flex-col gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-teal-text">{dayLabel(d.date, i)}</span>
                  <p className="text-[15px] leading-relaxed text-[#2B2722]">{d.text}</p>
                </div>
              ))
            : paragraphs.map((p, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-[#2B2722]">
                  {p}
                </p>
              ))}
          {typeof story.updates_sent === "number" && story.updates_sent > 0 && (
            <div className="flex items-center gap-2.5 rounded-[14px] border border-[#D3E7E1] px-3.5 py-3 text-[13px] text-[#3F444B]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-teal text-white">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <strong className="text-[#1F1B16]">
                  {story.updates_expected
                    ? `${Math.min(story.updates_sent, story.updates_expected)} of ${story.updates_expected} daily updates sent.`
                    : `${story.updates_sent} daily ${story.updates_sent === 1 ? "update" : "updates"} sent.`}
                </strong>{" "}
                This story was made from them.
              </span>
            </div>
          )}
        </section>

        <p className="order-8 flex items-start gap-2 text-xs leading-snug text-[#656B74] lg:order-none">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Written by NomadNest AI from {nomad}'s daily updates. Something not right?{" "}
            <button type="button" onClick={() => setReportOpen(true)} className="min-h-[44px] font-bold text-brand-teal-text underline-offset-2 hover:underline">
              Report it
            </button>
          </span>
        </p>

      </div>

      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
        {story.sitter_user_id && (
          <section aria-label={`Show on ${nomad}'s profile`} className="order-4 flex flex-col gap-3 rounded-[22px] bg-[#F2F8F6] p-4 lg:order-none">
            <div className="flex items-start gap-3">
              <span className="flex flex-1 flex-col gap-1">
                <span className="text-[15px] font-bold">Show on {nomad}'s profile</span>
                <span className="text-[13px] leading-snug text-[#3F444B]">{profileText}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={status === "approved"}
                aria-label={`Show this story on ${nomad}'s profile`}
                disabled={status !== "approved"}
                onClick={() => setConfirmWithdraw(true)}
                className={cn(
                  "relative h-8 w-[52px] shrink-0 rounded-full transition-colors before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-[''] disabled:cursor-not-allowed disabled:opacity-60",
                  status === "approved" ? "bg-brand-teal" : "bg-[#C9BDB8]",
                )}
              >
                <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-white", status === "approved" ? "left-6" : "left-1")} />
              </button>
            </div>

            {status === "requested" && (
              <div className="flex flex-col gap-3">
                <PhotoPicker paths={story.photo_paths} urls={urls} selected={picked} max={2} onChange={setPicked} />
                <p className="rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-[#1F1B16]">
                  Every NomadNest member will be able to read this.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={decidePortfolio.isPending}
                    onClick={() => run(decidePortfolio.mutateAsync({ decision: "approve", photoPaths: picked }), "Approved")}
                    className={nnButton("primary", "flex-1")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={decidePortfolio.isPending}
                    onClick={() => run(decidePortfolio.mutateAsync({ decision: "decline" }), "Kept private")}
                    className={nnButton("secondary", "flex-1")}
                  >
                    Keep private
                  </button>
                </div>
              </div>
            )}

            <p className="flex items-start gap-2 border-t border-[#D3E7E1] pt-2.5 text-xs leading-snug text-[#3F444B]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Your address, door codes and Welcome Guide are never shown. Only the story and the photos you leave on.
            </p>
          </section>
        )}

        <section aria-label="Photos" className="order-6 flex flex-col gap-2.5 lg:order-none">
          <div className="flex items-baseline justify-between">
            <SerifTitle>Photos</SerifTitle>
            <span className="text-[13px] text-[#656B74]">
              {status === "approved" ? `${shownPhotos.length} on ${nomad}'s profile` : `${story.photo_paths.length} in this story`}
            </span>
          </div>
          <p className="text-[13px] leading-snug text-[#656B74]">
            {status === "approved"
              ? `Remove a photo from ${nomad}'s profile at any time. You'll always see every photo here.`
              : "You choose which photos appear if the story goes on your Nomad's profile."}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {story.photo_paths.map((p) => {
              const shown = shownPhotos.includes(p);
              return (
                <div key={p} className="relative h-[130px] overflow-hidden rounded-2xl bg-[#DCCDBB]">
                  {urls[p] && <img src={urls[p]} alt={altOf(p)} className="h-full w-full object-cover" />}
                  {status === "approved" && (
                    <span
                      className={cn(
                        "absolute right-2 top-2 inline-flex h-6 items-center rounded-full px-2 text-[11px] font-bold",
                        shown ? "bg-brand-teal text-white" : "bg-white text-[#3F444B]",
                      )}
                    >
                      {shown ? "On profile" : "Not shown"}
                    </span>
                  )}
                  {shown && (
                    <button
                      type="button"
                      onClick={() => setRemoving(p)}
                      className="absolute bottom-2 left-1/2 flex h-11 -translate-x-1/2 items-center gap-1 rounded-full bg-white px-3 text-xs font-bold shadow"
                      aria-label={`Remove this photo from ${nomad}'s profile`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section aria-label="What next" className="order-7 flex flex-col gap-2 lg:order-none">
          <button
            type="button"
            onClick={() => setShareOpen((v) => !v)}
            aria-expanded={shareOpen}
            className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-brand-teal text-[15px] font-bold text-white"
          >
            <Share2 className="h-[18px] w-[18px]" aria-hidden="true" />
            Share your story
          </button>
          {shareOpen && (
            <div id="share-options" role="group" aria-label="Share options" className="flex flex-col rounded-[20px] border border-[#D3E7E1] px-3.5 pb-3 pt-1.5">
              <button type="button" onClick={() => setImageOpen(true)} className="flex min-h-[56px] items-center gap-3 py-2 text-left">
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[#E4F0EC] text-brand-teal-text">
                  <ImageIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-bold">Save as a story image</span>
                  <span className="text-xs text-[#656B74]">Story-sized for Instagram, TikTok and WhatsApp</span>
                </span>
              </button>
              <button
                type="button"
                onClick={copyLink}
                disabled={createShareLink.isPending}
                className="flex min-h-[56px] items-center gap-3 border-t border-[#E4F0EC] py-2 text-left"
              >
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[#E4F0EC] text-brand-teal-text">
                  {createShareLink.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Link2 className="h-5 w-5" aria-hidden="true" />}
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-bold">{copied ? "Link copied" : "Copy a share link"}</span>
                  <span className="text-xs text-[#656B74]">Anyone with the link can read it. You can switch it off.</span>
                </span>
              </button>
              {story.share_link && (
                <button
                  type="button"
                  onClick={() => run(disableShareLink.mutateAsync().then(() => setCopied(false)), "Share link switched off")}
                  disabled={disableShareLink.isPending}
                  className="flex min-h-[44px] items-center gap-2 border-t border-[#E4F0EC] py-2 text-left text-sm font-bold text-brand-coral-text"
                >
                  Switch off the share link
                  <span className="text-xs font-normal text-[#656B74]">
                    ({story.share_link.views} {story.share_link.views === 1 ? "view" : "views"})
                  </span>
                </button>
              )}
              <p className="mt-1.5 flex items-start gap-2 text-xs leading-snug text-[#3F444B]">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Shared stories show the city only, first names only, and just the photos on {nomad}'s profile.
              </p>
            </div>
          )}
          {story.sitter_user_id && (
            <button type="button" onClick={() => setInviteOpen(true)} className={nnButton("secondary", "h-[50px] rounded-2xl text-[15px]")}>
              Invite {nomad} to sit again
            </button>
          )}
          {story.can_review && story.sitter_user_id && (
            <button type="button" onClick={() => setReviewOpen(true)} className={nnButton("secondary", "h-[50px] rounded-2xl text-[15px]")}>
              Leave a review for {nomad}
            </button>
          )}
        </section>

      </div>

      <AlertDialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take this story off {nomad}'s profile?</AlertDialogTitle>
            <AlertDialogDescription>
              It comes off straight away and {nomad} will be told. This can't be undone: the story can't be added to their
              profile again. Any share link is switched off too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(withdrawPortfolio.mutateAsync(), `Taken off ${nomad}'s profile`)}>Take it off</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this photo from {nomad}'s profile?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone. The photo stays in your story here.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing) run(removePortfolioPhoto.mutateAsync(removing), `Removed from ${nomad}'s profile`);
                setRemoving(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={imageOpen} onOpenChange={setImageOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl font-normal">Save as a story image</SheetTitle>
          </SheetHeader>
          <div className="pt-3">
            <ShareCardMaker story={story} urls={urls} defaultSize="story" />
          </div>
        </SheetContent>
      </Sheet>

      <InviteAgainDialog story={story} open={inviteOpen} onOpenChange={setInviteOpen} />

      {story.can_review && story.sitter_user_id && (
        <WriteReviewDialog
          sitId={story.sit_id}
          revieweeUserId={story.sitter_user_id}
          revieweeName={nomad}
          reviewType="sitter"
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          onReviewSubmitted={onReviewed}
        />
      )}

      <ReportDialog targetType="sit_story" targetId={story.id} targetLabel="Sit Story" open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
};
