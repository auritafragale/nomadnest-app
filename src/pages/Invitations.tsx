import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { NN_LIST, NN_MAIN, EmptyState, PageHeader, PillTabs, RoleTheme, SectionCard, SerifTitle, nightsBetween, nnButton, shortRange } from "@/components/nn/ui";
import { useAcceptInvite, useSitterInvites, useUpdateInviteStatus, type SitterInvite } from "@/hooks/useSitterInvites";
import { useListingPets } from "@/hooks/useListingPets";
import { useMyAvailability } from "@/hooks/useMyAvailability";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveInviteConversation } from "@/lib/conversations";
import { cn } from "@/lib/utils";

type Tab = "waiting" | "accepted" | "past";

const todayIso = () => new Date().toISOString().slice(0, 10);
const ended = (i: SitterInvite) => !!i.sit_dates && i.sit_dates.end_date < todayIso();
const tabOf = (i: SitterInvite): Tab =>
  ended(i) || i.status === "declined" ? "past" : i.status === "applied" ? "accepted" : "waiting";

const EMPTY: Record<Tab, [string, string]> = {
  waiting: ["No invitations waiting", "You'll get a notification the moment a Pet Parent invites you."],
  accepted: ["Nothing accepted yet", "Invitations you accept show here while the Pet Parent confirms your sit."],
  past: ["Nothing here yet", "Invitations you've declined show here."],
};

const InviteCard = ({ invite }: { invite: SitterInvite }) => {
  const navigate = useNavigate();
  const accept = useAcceptInvite();
  const update = useUpdateInviteStatus();
  const { data: pets } = useListingPets(invite.listing_id);
  const owner = invite.owner_profile?.first_name || "The Pet Parent";
  const d = invite.sit_dates;
  const nights = d ? nightsBetween(d.start_date, d.end_date) : 0;

  const onAccept = () =>
    accept.mutate(invite, {
      onSuccess: ({ needsListing }) => {
        if (needsListing) {
          navigate(`/listing/${invite.listing_id}?invite=${invite.id}`);
          return;
        }
        toast.success(`Application sent to ${owner}`);
      },
      onError: (err) => toast.error(err.message || "That didn't work. Please try again."),
    });

  const onDecline = () =>
    update.mutate(
      { inviteId: invite.id, status: "declined" },
      {
        onSuccess: () =>
          toast("Invitation declined", {
            action: { label: "Undo", onClick: () => update.mutate({ inviteId: invite.id, status: "viewed" }) },
          }),
      },
    );

  return (
    <SectionCard className="overflow-hidden">
      <div className="relative flex h-[150px] items-center justify-center bg-[#CDB79E]">
        {invite.listing?.photos?.[0] && (
          <img src={invite.listing.photos[0]} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <span className="absolute left-3 top-3 inline-flex h-7 items-center rounded-full bg-card px-3 text-xs font-bold text-[var(--nn-accent-dark)]">
          New invitation
        </span>
      </div>
      <div className="flex flex-col gap-3.5 p-[18px]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D8C3B0] text-sm font-bold text-[#5A4636]">
            {invite.owner_profile?.avatar_url ? (
              <img src={invite.owner_profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              owner.slice(0, 1)
            )}
          </span>
          <span className="text-sm">
            <strong>{owner}</strong> invited you to sit
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[25px] leading-[1.1]">{invite.listing?.title ?? "A home"}</h2>
          <p className="text-sm text-muted-foreground">
            {[invite.listing?.city, d && shortRange(d.start_date, d.end_date), nights > 0 && `${nights} night${nights === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {pets?.names && (
            <p className="text-sm text-muted-foreground">{[pets.names, pets.summary].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        {invite.message && (
          <blockquote className="rounded-[14px] bg-[var(--nn-soft)] px-3.5 py-3 text-sm italic leading-snug">
            "{invite.message}"
          </blockquote>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onAccept} disabled={accept.isPending} className={nnButton("primary", "h-[52px] flex-[2] rounded-2xl text-[15px]")}>
            {accept.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Accept invitation
          </button>
          <button type="button" onClick={onDecline} disabled={update.isPending} className={nnButton("secondary", "h-[52px] flex-1 rounded-2xl")}>
            Decline
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Accepting sends your application straight to {owner}.</p>
        <Link to={`/listing/${invite.listing_id}`} className={nnButton("ghost", "self-start px-3")}>
          View listing
        </Link>
      </div>
    </SectionCard>
  );
};

const AcceptedCard = ({ invite }: { invite: SitterInvite }) => {
  const navigate = useNavigate();
  const owner = invite.owner_profile?.first_name || "the Pet Parent";
  const d = invite.sit_dates;
  const message = async () => {
    try {
      const id = await resolveInviteConversation({
        listingId: invite.listing_id,
        ownerUserId: invite.owner_user_id,
        sitterUserId: invite.sitter_user_id,
      });
      navigate(id ? `/inbox?conversation=${id}` : "/inbox");
    } catch {
      navigate("/inbox");
    }
  };
  return (
    <SectionCard className="flex flex-col gap-3 p-[18px]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--nn-ok-bg)] text-brand-teal-text">
          <Check className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold">Application sent to {owner}</p>
          <p className="text-sm text-muted-foreground">We'll let you know as soon as they confirm.</p>
        </div>
      </div>
      <div className="border-t border-[var(--nn-line)] pt-3">
        <p className="text-[15px] font-bold">{invite.listing?.title ?? "A home"}</p>
        <p className="text-[13px] text-muted-foreground">{[d && shortRange(d.start_date, d.end_date), owner].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={message} className={nnButton("secondary", "flex-1")}>
          Message {owner}
        </button>
        <Link to="/my-applications?tab=pending" className={nnButton("secondary", "flex-1")}>
          My applications
        </Link>
      </div>
    </SectionCard>
  );
};

const PastRow = ({ invite }: { invite: SitterInvite }) => {
  const update = useUpdateInviteStatus();
  const d = invite.sit_dates;
  const canUndo = invite.status === "declined" && !ended(invite);
  return (
    <div className="flex items-center gap-3 border-t border-[var(--nn-line)] py-3 first:border-t-0">
      <span className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px] bg-[#CDB79E]">
        {invite.listing?.photos?.[0] && <img src={invite.listing.photos[0]} alt="" className="h-full w-full object-cover" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold">{invite.listing?.title ?? "A home"}</span>
        <span className="truncate text-[13px] text-muted-foreground">
          {invite.status === "declined" ? "You declined" : invite.status === "applied" ? "You applied" : "Dates passed"}
          {d ? ` · ${shortRange(d.start_date, d.end_date)}` : ""}
        </span>
      </span>
      {canUndo && (
        <button
          type="button"
          onClick={() => update.mutate({ inviteId: invite.id, status: "viewed" })}
          disabled={update.isPending}
          className={nnButton("secondary", "px-4")}
        >
          Undo
        </button>
      )}
    </div>
  );
};

/** "Get invited more often": what makes Pet Parents invite a Nomad. */
const InviteTips = () => {
  const { user } = useAuth();
  const { data: availability } = useMyAvailability();
  const { data } = useQuery({
    queryKey: ["invite-tips", user?.id],
    queryFn: async () => {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from("profiles").select("avatar_url").eq("id", user!.id).maybeSingle(),
        supabase.from("sitter_profiles").select("bio").eq("user_id", user!.id).maybeSingle(),
      ]);
      return { photo: !!p?.avatar_url, bio: !!s?.bio };
    },
    enabled: !!user,
  });
  const items: [boolean, string, string][] = [
    [!!data?.photo, "A friendly profile photo", "/edit-sitter-profile"],
    [!!data?.bio, "A bio about the pets you've cared for", "/edit-sitter-profile"],
    [(availability?.ranges.length ?? 0) > 0, "Dates you're free to sit", "/availability"],
  ];
  return (
    <SectionCard label="Get invited more often" className="flex flex-col gap-2 p-[18px]">
      <SerifTitle>Get invited more often</SerifTitle>
      <p className="text-sm text-muted-foreground">Pet Parents invite Nomads whose profiles feel complete.</p>
      <ul className="mt-1 flex flex-col">
        {items.map(([done, label, to]) => (
          <li key={label}>
            <Link to={to} className="flex min-h-[44px] items-center gap-3 border-t border-[var(--nn-line)] py-2.5">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px]",
                  done ? "border-brand-teal-text bg-brand-teal-text text-white" : "border-[var(--nn-border)]",
                )}
                aria-hidden="true"
              >
                {done && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className={cn("text-sm", done ? "text-muted-foreground line-through" : "font-semibold")}>{label}</span>
              <span className="sr-only">{done ? "done" : "to do"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
};

/** Invitations (design: Invitations.dc.html). */
const Invitations = () => {
  const { data: invites = [], isLoading } = useSitterInvites();
  const [tab, setTab] = useState<Tab>("waiting");
  const groups = useMemo(() => {
    const g: Record<Tab, SitterInvite[]> = { waiting: [], accepted: [], past: [] };
    for (const i of invites) g[tabOf(i)].push(i);
    return g;
  }, [invites]);
  const list = groups[tab];

  return (
    <RoleTheme role="sitter" className="min-h-screen">
      <Navbar wide />
      <main className={NN_MAIN}>
        <PageHeader
          title="Invitations"
          intro="When a Pet Parent likes your profile, they can invite you straight to their sit. Accept or decline here."
          fallback="/dashboard"
        />
        <div className={NN_LIST}>
        <PillTabs<Tab>
          label="Invitations"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "waiting", label: "Waiting for you", count: groups.waiting.length },
            { id: "accepted", label: "Accepted", count: groups.accepted.length },
            { id: "past", label: "Past", count: groups.past.length },
          ]}
        />

        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-[24px]" />
        ) : list.length === 0 ? (
          <EmptyState
            title={EMPTY[tab][0]}
            text={EMPTY[tab][1]}
            action={
              <Link to="/browse-sits" className={nnButton("secondary")}>
                Browse sits
              </Link>
            }
          />
        ) : tab === "waiting" ? (
          list.map((i) => <InviteCard key={i.id} invite={i} />)
        ) : tab === "accepted" ? (
          list.map((i) => <AcceptedCard key={i.id} invite={i} />)
        ) : (
          <SectionCard className="p-[18px]">
            {list.map((i) => (
              <PastRow key={i.id} invite={i} />
            ))}
          </SectionCard>
        )}

        <InviteTips />
        </div>
      </main>
    </RoleTheme>
  );
};

export default Invitations;
