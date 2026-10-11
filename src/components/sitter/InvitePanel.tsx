import { useEffect, useState } from "react";
import { Check, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import { StatusChip, nnButton, shortRange } from "@/components/nn/ui";
import { supabase } from "@/integrations/supabase/client";
import { resolveListingConversation } from "@/lib/conversations";
import { useInviteCowriter } from "@/hooks/useInviteCowriter";
import { useSideAccess } from "@/hooks/useSideAccess";
import { Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface InviteListing {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  sit_dates: { id: string; start_date: string; end_date: string; status: string }[];
}

const overlaps = (s: string, e: string, ranges: { start: string; end: string }[]) => ranges.some((r) => r.start <= e && r.end >= s);

/**
 * Invite a Nomad to one of your sits (design: NomadPublicPhone invite sheet).
 * One invitation per ticked date range, with the same duplicate check and
 * chat message as before, then a success screen.
 */
const InvitePanel = ({
  open,
  onOpenChange,
  sitterUserId,
  sitterName,
  ownerUserId,
  listings,
  freeDates,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sitterUserId: string;
  sitterName: string;
  ownerUserId: string;
  listings: InviteListing[];
  freeDates: { start: string; end: string }[];
}) => {
  const [listingId, setListingId] = useState(listings[0]?.id ?? "");
  const [dateIds, setDateIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [aiDrafted, setAiDrafted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const cowriter = useInviteCowriter();
  // Inviting needs a Pet Parent (or Combined, or Founding) membership.
  const { data: access } = useSideAccess();
  const noAccess = access ? !access.owner : false;

  const listing = listings.find((l) => l.id === listingId) ?? listings[0];
  const today = new Date().toISOString().slice(0, 10);
  const dates = (listing?.sit_dates ?? []).filter((d) => d.status === "open" && d.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));

  // Start each opening fresh, with the dates the Nomad is free pre-ticked.
  useEffect(() => {
    if (!open) return;
    setSent(false);
    setListingId(listings[0]?.id ?? "");
  }, [open, listings]);
  useEffect(() => {
    setDateIds(dates.filter((d) => overlaps(d.start_date, d.end_date, freeDates)).map((d) => d.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId, open]);

  const toggle = (id: string) => setDateIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const helpMeWrite = async () => {
    if (!listing) return;
    try {
      const text = await cowriter.draft.mutateAsync({ listingId: listing.id, sitterUserId, sitDateIds: dateIds });
      setMessage(text);
      setAiDrafted(true);
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't draft your invitation", description: e instanceof Error ? e.message : undefined });
    }
  };

  const send = async () => {
    if (!listing || dateIds.length === 0) return;
    setSending(true);
    try {
      // The same duplicate check as before, per date range.
      const { data: existing } = await supabase
        .from("sitter_invites")
        .select("sit_dates_id")
        .eq("listing_id", listing.id)
        .eq("sitter_user_id", sitterUserId)
        .in("sit_dates_id", dateIds);
      const already = new Set((existing ?? []).map((r) => r.sit_dates_id));
      const fresh = dateIds.filter((id) => !already.has(id));
      if (fresh.length === 0) {
        toast({ variant: "destructive", title: "Already invited", description: `You've already invited ${sitterName} for these dates.` });
        return;
      }

      const { error } = await supabase.from("sitter_invites").insert(
        fresh.map((sit_dates_id) => ({
          listing_id: listing.id,
          sit_dates_id,
          owner_user_id: ownerUserId,
          sitter_user_id: sitterUserId,
          message: message.trim() || null,
          status: "pending",
        })),
      );
      if (error) throw error;

      // The Nomad's notification comes from a database trigger. The chat
      // thread for this home and Nomad gets one note about the invitation.
      const conversationId = await resolveListingConversation({ listingId: listing.id, ownerUserId, sitterUserId });
      if (conversationId) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_user_id: ownerUserId,
          body: "Hi! I'd love to invite you to sit at my home. I've sent you a formal invitation — please check your notifications.",
        });
      }

      setSent(true);
      setMessage("");
      setAiDrafted(false);
    } catch (error) {
      console.error("Error sending invite:", error);
      const msg = error instanceof Error ? error.message : (error as { message?: string } | null)?.message;
      toast({
        variant: "destructive",
        title: "Couldn't send the invitation",
        description: msg && /membership|isn.t available/i.test(msg) ? msg : "Please try again.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={sent ? "Invitation sent" : `Invite ${sitterName} to a sit`}
      description={`Invite ${sitterName} to one of your sits`}
      footer={
        noAccess ? (
          <Link to="/membership" className={nnButton("primary", "h-12 w-full")}>
            See memberships
          </Link>
        ) : sent ? (
          <button type="button" onClick={() => onOpenChange(false)} className={nnButton("primary", "h-12 w-full")}>
            Done
          </button>
        ) : (
          <button type="button" onClick={send} disabled={sending || dateIds.length === 0} className={nnButton("primary", "h-12 w-full")}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {dateIds.length > 1 ? `Send ${dateIds.length} invitations` : "Send invitation"}
          </button>
        )
      }
    >
      {noAccess ? (
        <p className="py-4 text-[16px]">
          You need a Pet Parent membership to invite Nomads. A Pet Parent or Combined membership lets you invite, publish your listing and choose your Nomad.
        </p>
      ) : sent ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-brand-teal-text" aria-hidden="true" />
          <p className="text-[16px]">
            {sitterName} will see it in their Invitations, and in your chat with them. We will let you know when they reply.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {listings.length > 1 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[15px] font-bold">Your sit</legend>
              {listings.map((l) => (
                <label key={l.id} className={cn("flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] px-4 py-2", l.id === listing?.id ? "border-[var(--nn-accent)] bg-[var(--nn-tint)]" : "border-border")}>
                  <input type="radio" name="invite-listing" checked={l.id === listing?.id} onChange={() => setListingId(l.id)} className="h-5 w-5 accent-[hsl(var(--primary))]" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-bold">{l.title}</span>
                    <span className="text-sm text-muted-foreground">{[l.city, l.country].filter(Boolean).join(", ")}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            listing && (
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-bold text-muted-foreground">Your sit</p>
                <p className="text-[16px] font-bold">{listing.title}</p>
                <p className="text-sm text-muted-foreground">{[listing.city, listing.country].filter(Boolean).join(", ")}</p>
              </div>
            )
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[15px] font-bold">Dates</legend>
            {dates.map((d) => {
              const on = dateIds.includes(d.id);
              const free = overlaps(d.start_date, d.end_date, freeDates);
              return (
                <button
                  key={d.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(d.id)}
                  className={cn("flex min-h-[56px] items-center gap-3 rounded-2xl px-4 py-2 text-left", on ? "border-2 border-[var(--nn-accent)] bg-[var(--nn-tint)]" : "border-[1.5px] border-border bg-card")}
                >
                  <span className={cn("flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg", on ? "bg-[var(--nn-accent)] text-primary-foreground" : "shadow-[inset_0_0_0_2px_hsl(var(--border))]")}>
                    {on && <Check className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <span className="flex-1 text-[15px] font-bold">{shortRange(d.start_date, d.end_date)}</span>
                  {free && <StatusChip tone="green">{sitterName} is free</StatusChip>}
                </button>
              );
            })}
          </fieldset>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="invite-message" className="text-[15px] font-bold">
                Message
              </label>
              {cowriter.visible && (
                <button type="button" onClick={helpMeWrite} disabled={cowriter.draft.isPending} className={nnButton("ghost", "h-11 px-3")}>
                  {cowriter.draft.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                  Help me write it
                </button>
              )}
            </div>
            <Textarea
              id="invite-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              readOnly={cowriter.draft.isPending}
              placeholder={`Tell ${sitterName} why they'd be a great fit…`}
              rows={5}
              className="resize-none rounded-2xl text-base"
            />
            {aiDrafted && <p className="text-sm text-muted-foreground">AI draft. Read it and make it your own before sending.</p>}
            <p className="text-sm text-muted-foreground">
              Keep your address and phone number out for now. {sitterName} gets your address in your Welcome Guide once the sit is confirmed.
              Your number is only shared if you choose to share it.
            </p>
          </div>
        </div>
      )}
    </ResponsiveSheet>
  );
};

export default InvitePanel;
