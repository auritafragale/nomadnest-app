import { useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Check, CheckCircle2, Loader2, MessageCircle, Star } from "lucide-react";
import { StatusChip, nnButton, shortRange } from "@/components/nn/ui";
import { dedupePetTypes, formatPetType, canonicalPetType } from "@/lib/petTypes";
import type { Applicant } from "@/hooks/useListingApplicants";
import { cn } from "@/lib/utils";

const lower = (t: string) => formatPetType(t).toLowerCase();
const one = (t: string) => lower(t).replace(/s$/, "");
const andList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** "Knows cats and dogs", with "+N" past three types (as on Browse Nomads). */
export const knowsLine = (types: string[]) => {
  const all = dedupePetTypes(types).map(lower);
  if (all.length === 0) return null;
  const shown = all.slice(0, 3);
  return { list: andList(shown), more: all.length - shown.length };
};

/**
 * "Why they fit": facts from data, never AI. Free nights from the Nomad's
 * calendar, the listing's pets they know (or don't), medication, same city.
 */
export const fitFacts = (a: Applicant, listingCity: string | null) => {
  const facts: string[] = [];
  if (a.fit_same_city && listingCity) facts.push(`lives in ${listingCity}`);
  if (a.fit_free_nights !== null && a.fit_free_nights > 0) {
    facts.push(
      a.fit_free_nights >= a.fit_total_nights
        ? `free all ${a.fit_total_nights} ${a.fit_total_nights === 1 ? "night" : "nights"}`
        : a.fit_free_from && a.fit_free_to
          ? `free ${shortRange(a.fit_free_from, a.fit_free_to)} only`
          : `free ${a.fit_free_nights} of ${a.fit_total_nights} nights`,
    );
  }
  if (a.fit_pets_known.length > 0) facts.push(`knows ${andList(a.fit_pets_known.map(lower))}`);
  if (a.fit_meds_ok) facts.push("OK with medication");
  for (const t of a.fit_pets_missing) facts.push(`no ${one(t)} experience listed`);
  if (facts.length === 0) return null;
  const line = facts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
};

/** "Applied 2 days ago" */
export const appliedWhen = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Applied today";
  if (days === 1) return "Applied yesterday";
  if (days < 14) return `Applied ${days} days ago`;
  if (days < 60) return `Applied ${Math.round(days / 7)} weeks ago`;
  return `Applied ${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
};

const STATUS_LABEL: Record<string, string> = {
  accepted: "Confirmed",
  declined: "Declined",
  withdrawn: "Withdrawn by Nomad",
  cancelled: "Cancelled",
};

/** One applicant (design: ApplicantsPhone / ApplicantsTabletDark / ApplicantsDesktop). */
const ApplicantCard = ({
  applicant: a,
  listingCity,
  busy,
  messaging,
  onStar,
  onConfirm,
  onDecline,
  onMessage,
  onSeen,
}: {
  applicant: Applicant;
  listingCity: string | null;
  busy: boolean;
  messaging: boolean;
  onStar: () => void;
  onConfirm: () => void;
  onDecline: () => void;
  onMessage: () => void;
  onSeen: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const name = a.first_name || "A Nomad";
  const live = a.status === "applied" || a.status === "shortlisted";
  const starred = a.status === "shortlisted";
  const isNew = a.status === "applied" && !a.owner_seen;
  const place = [a.city, a.country].filter(Boolean).join(", ");
  const rating =
    a.review_count > 0 && a.avg_rating !== null
      ? `${Number(a.avg_rating).toFixed(1)} · ${a.review_count} ${a.review_count === 1 ? "review" : "reviews"}${
          a.review_rate !== null ? ` · review rate ${a.review_rate}%` : ""
        }`
      : null;
  const knows = knowsLine(a.pet_types.map(canonicalPetType));
  const why = fitFacts(a, listingCity);
  const longMessage = (a.message ?? "").length > 180;
  const msgId = `msg-${a.application_id}`;
  // An accepted application follows its sit: finished or cancelled sits read as such.
  const closedLabel =
    a.status === "accepted" && a.sit_status === "completed"
      ? "Completed ✓"
      : a.status === "accepted" && a.sit_status === "cancelled"
        ? "Sit cancelled"
        : STATUS_LABEL[a.status] ?? a.status;

  return (
    <article
      aria-label={`${name}, ${live ? (starred ? "shortlisted" : "new") : closedLabel}`}
      className={cn("flex flex-col gap-3 rounded-[22px] border border-[var(--nn-border)] p-4", live ? "bg-card" : "bg-muted/60")}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D8C3B0] text-xl font-bold text-[#5A4636]">
          {a.avatar_url ? <img src={a.avatar_url} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-sans text-[17px] font-bold leading-tight">{name}</h3>
            {a.id_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-teal-text" aria-label="ID checked" />}
            {a.founding_member && <StatusChip tone="gold">Founding</StatusChip>}
            {isNew && <StatusChip tone="accent">New</StatusChip>}
          </div>
          <p className="text-sm text-muted-foreground">
            {[place, rating ? null : "New on NomadNest"].filter(Boolean).join(" · ")}
          </p>
          {rating && (
            <p className="flex items-center gap-1 text-sm">
              <Star className="h-3.5 w-3.5 shrink-0 fill-[#E8B53E] text-[#E8B53E]" aria-hidden="true" />
              <span className="font-semibold">{rating}</span>
            </p>
          )}
        </div>
        {live && (
          <button
            type="button"
            onClick={onStar}
            disabled={busy}
            aria-pressed={starred}
            aria-label={starred ? "Remove from shortlist" : "Add to shortlist"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-border bg-card disabled:opacity-60"
          >
            <Star className={cn("h-5 w-5", starred ? "fill-[#E8B53E] text-[#E8B53E]" : "text-muted-foreground")} aria-hidden="true" />
          </button>
        )}
      </div>

      <p className="text-[15px]">
        {[a.who_applying, shortRange(a.start_date, a.end_date)].filter(Boolean).join(" · ")}
      </p>
      {knows && (
        <p className="text-[15px] text-muted-foreground">
          Knows {knows.list}
          {knows.more > 0 && <span className="ml-1 font-semibold text-foreground">+{knows.more}</span>}
        </p>
      )}
      {why && (
        <p className="flex items-start gap-2 rounded-xl bg-[var(--nn-ok-bg)] px-3 py-2 text-[15px] text-brand-teal-text">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Why they fit: {why}</span>
        </p>
      )}

      {a.message && (
        <div className="flex flex-col gap-1">
          <p id={msgId} className={cn("whitespace-pre-line text-[15px] italic leading-relaxed", !open && longMessage && "line-clamp-3")}>
            “{a.message}”
          </p>
          {longMessage && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={msgId}
              onClick={() => {
                setOpen(!open);
                onSeen();
              }}
              className="min-h-11 self-start text-[15px] font-bold underline underline-offset-2"
            >
              {open ? "Show less" : "Read full message"}
            </button>
          )}
        </div>
      )}

      {a.highlights && a.highlights.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Why they say they fit">
          {a.highlights.map((h) => (
            <li key={h} className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-muted px-3 text-sm font-semibold">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {h}
            </li>
          ))}
        </ul>
      )}

      {live ? (
        <div className="flex flex-col gap-2 pt-1">
          <button type="button" onClick={onConfirm} disabled={busy} className={nnButton("primary", "h-12 w-full")}>
            Confirm {name} for these dates
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onMessage} disabled={messaging} className={nnButton("secondary", "h-11 px-2")}>
              {messaging ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}
              Message
            </button>
            <Link to={`/sitter/${a.sitter_user_id}`} onClick={onSeen} className={nnButton("secondary", "h-11 px-2")}>
              View profile
            </Link>
          </div>
          <button type="button" onClick={onDecline} disabled={busy} className={nnButton("ghost", "h-11 w-full text-foreground underline underline-offset-2")}>
            Decline
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusChip tone={a.status === "accepted" && a.sit_status !== "cancelled" ? "green" : "grey"}>{closedLabel}</StatusChip>
          {a.status === "accepted" && a.sit_status === "completed" && a.sit_id && (
            <Link to={`/sits/${a.sit_id}`} className={nnButton("ghost", "h-11 text-foreground underline underline-offset-2")}>
              See the sit
            </Link>
          )}
          <button type="button" onClick={onMessage} disabled={messaging} className={nnButton("secondary", "ml-auto h-11")}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Message
          </button>
          <Link to={`/sitter/${a.sitter_user_id}`} className={nnButton("ghost", "h-11 text-foreground")}>
            View profile
          </Link>
        </div>
      )}

      <p className="text-sm text-muted-foreground">{appliedWhen(a.created_at)}</p>
    </article>
  );
};

export default ApplicantCard;
