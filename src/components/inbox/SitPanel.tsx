import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { StatusChip, nnButton, shortRange } from "@/components/nn/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useReport } from "@/components/reports/ReportContext";
import { conversationStatus, hasLiveSit, type Conversation, type Message } from "@/hooks/useConversations";
import { usePhoneShares } from "@/hooks/usePhoneShares";
import { petList, useThreadSit } from "@/hooks/useThreadSit";
import { PhoneShareSheet } from "@/components/inbox/PhoneShare";

/** Desktop third pane: the sit or listing this chat is about. */
const SitPanel = ({ conversation, messages }: { conversation: Conversation; messages: Message[] }) => {
  const { user } = useAuth();
  const { openReport } = useReport();
  const info = useThreadSit(conversation);
  const other = conversation.other_user;
  const otherName = other?.first_name || "Member";
  const left = conversation.member_left;
  const phone = usePhoneShares(left ? null : other?.id);
  const [sheet, setSheet] = useState(false);
  const ctx = conversation.context;
  const status = conversationStatus(ctx);
  const live = hasLiveSit(ctx);
  const isOwner = conversation.owner_user_id === user?.id;
  const lastTheirs = [...messages].reverse().find((m) => m.sender_user_id !== user?.id);

  const report = () => {
    if (lastTheirs) openReport({ targetType: "message", targetId: lastTheirs.id, targetLabel: "chat" });
    else if (other?.id) openReport({ targetType: "user", targetId: other.id, targetLabel: otherName });
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--nn-line)] py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );

  const place = [info?.city, info?.country].filter(Boolean).join(", ");
  const pets = info?.petNames.length ? `${info.petNames.length} ${info.petNames.length === 1 ? "pet" : "pets"}: ${petList(info.petNames)}` : null;

  return (
    <aside aria-label="About this sit" className="hidden w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-[var(--nn-border)] px-[18px] py-5 lg:flex">
      {conversation.listing ? (
        <>
          <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
            {info?.photo && <img src={info.photo} alt="" className="h-full w-full object-cover" />}
          </div>
          <div>
            <p className="font-display text-xl leading-tight">{conversation.listing.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{[place, pets].filter(Boolean).join(" · ")}</p>
          </div>
          <div>
            {ctx.sit_start && ctx.sit_end && row("Dates", shortRange(ctx.sit_start, ctx.sit_end))}
            {row("Status", status ? <StatusChip tone={status === "Confirmed" ? "green" : "grey"}>{status}</StatusChip> : "Chatting")}
            {live &&
              row(
                "Welcome Guide",
                info?.guideUnlockAt
                  ? `Unlocks ${new Date(info.guideUnlockAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: info.guideTimezone ?? undefined })}`
                  : isOwner
                    ? <Link to={`/listing/${conversation.listing.id}/welcome-guide`} className="text-[var(--nn-accent-dark)] underline underline-offset-2">Edit your guide</Link>
                    : "Opens before your sit",
              )}
          </div>
          {live && ctx.sit_id ? (
            <Link to={`/sits/${ctx.sit_id}`} className={nnButton("primary", "w-full")}>See the sit</Link>
          ) : (
            <Link to={`/listing/${conversation.listing.id}`} className={nnButton("secondary", "w-full")}>View the listing</Link>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">A direct chat with {otherName}. No sit is linked to it.</p>
      )}

      {!left && (
        <section aria-label="Phone numbers" className="rounded-2xl border border-[var(--nn-border)] p-4">
          <h2 className="font-sans text-[15px] font-bold">Phone numbers</h2>
          {phone.state?.i_am_sharing || phone.state?.they_are_sharing ? (
            <div className="mt-1 space-y-1 text-sm text-muted-foreground">
              {phone.state.i_am_sharing && <p>You share your number with {otherName}.</p>}
              {phone.state.they_are_sharing && <p>{otherName} shares their number with you. It's in the chat.</p>}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Not shared yet. Once a sit is confirmed, each of you can choose to share your number here.
            </p>
          )}
          {phone.state?.i_am_sharing ? (
            <button
              type="button"
              onClick={() => phone.stop.mutate(undefined, { onSuccess: () => toast.success("You stopped sharing your number.") })}
              className={nnButton("secondary", "mt-3 w-full")}
            >
              Stop sharing
            </button>
          ) : phone.state?.can_share ? (
            <button type="button" onClick={() => setSheet(true)} className={nnButton("secondary", "mt-3 w-full")}>
              Share my number
            </button>
          ) : null}
        </section>
      )}

      {!left && (
        <button type="button" onClick={report} className="inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-[var(--nn-danger-text)] underline underline-offset-4">
          Report this chat
        </button>
      )}

      <PhoneShareSheet
        open={sheet}
        onOpenChange={setSheet}
        otherName={otherName}
        state={phone.state}
        sharing={phone.share.isPending}
        onConfirm={() =>
          phone.share.mutate(undefined, {
            onSuccess: () => {
              setSheet(false);
              toast.success(`Your number is shared with ${otherName}.`);
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Please try again."),
          })
        }
      />
    </aside>
  );
};

export default SitPanel;
