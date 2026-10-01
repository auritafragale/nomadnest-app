import { useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Check, ChevronLeft, ChevronRight, Heart, Home, Images, Lock } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";
import { ShareDialog } from "@/components/share/ShareDialog";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import { StatusChip, nightsBetween, shortRange } from "@/components/nn/ui";
import { formatPetAge, formatPetType, petTypeIcon } from "@/lib/petTypes";
import OwnerReviewsSummaryCard from "@/components/reviews/OwnerReviewsSummaryCard";
import { cn } from "@/lib/utils";

export interface ListingPet {
  id: string;
  name: string;
  type: string;
  age: string | null;
  personality: string | null;
  feeding_details: string | null;
  daily_routine: string | null;
  walks_exercise: string | null;
  has_medication: boolean;
  medication_instructions: string | null;
  vet_info: string | null;
  photos: string[];
  requires_medication: boolean;
  reactive_to_animals: boolean;
  separation_anxiety_tolerance: string | null;
}

export interface ListingSitDate {
  id: string;
  start_date: string;
  end_date: string;
  flexibility: string | null;
  handover_preference: string | null;
  status: string;
}

export interface ListingHomeFields {
  home_type: string | null;
  location_type: string | null;
  sleeping_arrangement: string | null;
  wifi_quality: string | null;
  amenities: string[];
  remote_location?: boolean | null;
  car_needed?: boolean | null;
  heavy_gardening?: boolean | null;
  wheelchair_accessible?: boolean | null;
  public_transport_accessible?: boolean | null;
  requirements: string[];
  requirements_other: string | null;
  house_rules: string[];
  house_rules_other: string | null;
  home_care_tasks: string[];
  home_care_tasks_other: string | null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const words = (s: string | null | undefined) => (s ? cap(s.replace(/_/g, " ")) : null);

const LOCATION_LABELS: Record<string, string> = { beach: "Beach", city: "City", countryside: "Countryside", mountains: "Mountains" };

const COMMUNICATION: Record<string, string> = {
  daily: "Likes a photo update every day",
  every_few_days: "Likes an update every few days",
  weekly: "Likes a weekly update",
  as_needed: "Only needs updates when something comes up",
};
export const communicationLine = (style: string | null | undefined) => (style ? COMMUNICATION[style] ?? null : null);

/** "12–25 Oct 2026" */
export const longRange = (start: string, end: string) => `${shortRange(start, end)} ${end.slice(0, 4)}`;

/** The pet type labels are plural ("Cats"); one pet reads "Cat". */
export const petTypeOne = (type: string) => formatPetType(type).replace(/s$/, "");

export const petLine = (pets: { type: string }[]) => {
  const counts = new Map<string, number>();
  for (const p of pets) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  return [...counts.entries()].map(([t, n]) => `${n} ${(n === 1 ? petTypeOne(t) : formatPetType(t)).toLowerCase()}`).join(", ");
};

const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The three quick facts under the title: dates, pets, home. */
export const QuickFacts = ({ dates, pets, home }: { dates: ListingSitDate[]; pets: ListingPet[]; home: ListingHomeFields }) => {
  const months = [...new Set(dates.map((d) => new Date(`${d.start_date}T12:00:00`).toLocaleString("en-GB", { month: "short" })))];
  const onMeds = pets.filter((p) => p.has_medication).length;
  const homeBits = [words(home.home_type), home.wifi_quality && home.wifi_quality !== "none" ? `${words(home.wifi_quality)} Wi-Fi` : null].filter(Boolean) as string[];
  const facts = [
    dates.length > 0 ? { title: `${dates.length} date ${dates.length === 1 ? "range" : "ranges"}`, sub: joinAnd(months) } : { title: "No open dates", sub: "Check back soon" },
    pets.length > 0 ? { title: petLine(pets), sub: onMeds > 0 ? `${onMeds} on medication` : "No medication" } : null,
    homeBits.length > 0 ? { title: homeBits[0], sub: homeBits[1] ?? "" } : null,
  ].filter(Boolean) as { title: string; sub: string }[];
  return (
    <div className="grid grid-cols-3 divide-x divide-[var(--nn-line)] rounded-[20px] border border-[var(--nn-border)] bg-card py-3">
      {facts.map((f) => (
        <div key={f.title} className="flex min-w-0 flex-col items-center gap-0.5 px-2 text-center">
          <span className="text-[15px] font-bold leading-snug">{f.title}</span>
          {f.sub && <span className="text-sm text-muted-foreground">{f.sub}</span>}
        </div>
      ))}
    </div>
  );
};

const circleBtn = "flex h-11 w-11 items-center justify-center rounded-full border-0 bg-card text-foreground shadow-md hover:bg-card";

/** Phone gallery: one photo at a time with back, share and heart on top. */
export const PhoneGallery = ({
  photos,
  index,
  onIndex,
  onOpen,
  shareTitle,
  shareText,
  heart,
}: {
  photos: string[];
  index: number;
  onIndex: (i: number) => void;
  onOpen: () => void;
  shareTitle: string;
  shareText: string;
  heart?: { saved: boolean; onToggle: () => void };
}) => {
  const n = photos.length;
  return (
    <div className="relative -mx-5 h-[290px] bg-[#CDB79E] md:hidden">
      {n > 0 ? (
        <button type="button" onClick={onOpen} aria-label={`Open photo ${index + 1} of ${n}`} className="h-full w-full">
          <img src={photos[index]} alt="" className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-full items-center justify-center">
          <Home className="h-14 w-14 text-[#8A7660]" aria-hidden="true" />
        </div>
      )}
      <div className="absolute left-3 top-3">
        <BackButton fallback="/browse-sits" iconOnly className={circleBtn} />
      </div>
      <div className="absolute right-3 top-3 flex gap-2">
        <ShareDialog title={shareTitle} description={shareText} triggerClassName={circleBtn} />
        {heart && <HeartButton {...heart} className={circleBtn} />}
      </div>
      {n > 1 && (
        <>
          <button type="button" aria-label="Previous photo" onClick={() => onIndex((index + n - 1) % n)} className={cn(circleBtn, "absolute left-3 top-1/2 -translate-y-1/2")}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next photo" onClick={() => onIndex((index + 1) % n)} className={cn(circleBtn, "absolute right-3 top-1/2 -translate-y-1/2")}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="absolute bottom-3 right-3 rounded-full bg-[#1F1B16]/80 px-3 py-1 text-xs font-bold text-white" aria-live="polite">
            {index + 1} / {n}
          </span>
        </>
      )}
    </div>
  );
};

export const HeartButton = ({ saved, onToggle, className, label }: { saved: boolean; onToggle: () => void; className?: string; label?: boolean }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={saved}
    aria-label={label ? undefined : saved ? "Remove from saved" : "Save this sit"}
    className={className}
  >
    <Heart className={cn("h-5 w-5", saved && "fill-brand-coral text-brand-coral-text")} aria-hidden="true" />
    {label && (saved ? "Saved" : "Save")}
  </button>
);

/** Tablet and desktop: one large photo and four small ones. */
export const PhotoMosaic = ({ photos, onOpen }: { photos: string[]; onOpen: (i: number) => void }) => {
  if (photos.length === 0) {
    return (
      <div className="hidden h-[320px] items-center justify-center rounded-[24px] bg-[#CDB79E] md:flex">
        <Home className="h-14 w-14 text-[#8A7660]" aria-hidden="true" />
      </div>
    );
  }
  const shown = photos.slice(0, 5);
  return (
    <div className={cn("relative hidden h-[340px] gap-2 overflow-hidden rounded-[24px] md:grid lg:h-[420px]", shown.length > 1 ? "grid-cols-4 grid-rows-2" : "grid-cols-1")}>
      {shown.map((p, i) => (
        <button
          key={p + i}
          type="button"
          onClick={() => onOpen(i)}
          aria-label={`Open photo ${i + 1} of ${photos.length}`}
          className={cn("overflow-hidden bg-[#CDB79E]", i === 0 && shown.length > 1 && "col-span-2 row-span-2", shown.length === 2 && i === 1 && "col-span-2 row-span-2", shown.length === 3 && i > 0 && "col-span-2")}
        >
          <img src={p} alt="" loading={i === 0 ? "eager" : "lazy"} className="h-full w-full object-cover transition-transform hover:scale-[1.02]" />
        </button>
      ))}
      {photos.length > 1 && (
        <button
          type="button"
          onClick={() => onOpen(0)}
          className="absolute bottom-4 right-4 inline-flex h-11 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold text-foreground shadow-md"
        >
          <Images className="h-4 w-4" aria-hidden="true" />
          Show all {photos.length} photos
        </button>
      )}
    </div>
  );
};

/** The Pet Parent: first name, badges, how they like updates and their reviews. */
export const HostCard = ({
  ownerId,
  firstName,
  avatarUrl,
  founding,
  idVerified,
  communication,
  signedIn,
  onSignUpPrompt,
}: {
  ownerId: string;
  firstName: string | null;
  avatarUrl: string | null;
  founding: boolean;
  idVerified: boolean;
  communication: string | null;
  signedIn: boolean;
  onSignUpPrompt: () => void;
}) => {
  const name = firstName || "the Pet Parent";
  return (
    <section aria-label="Your host" className="flex flex-col gap-2 rounded-[22px] border border-[var(--nn-border)] bg-card p-4">
      <Link
        to={`/owner/${ownerId}`}
        onClick={(e) => {
          if (!signedIn) {
            e.preventDefault();
            onSignUpPrompt();
          }
        }}
        className="flex items-center gap-3"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D8C3B0] text-lg font-bold text-[#5A4636]">
          {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : (firstName ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-bold">{firstName || "Pet Parent"}</span>
            {founding && <StatusChip tone="gold">Founding Member</StatusChip>}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            Pet Parent
            {idVerified && (
              <span className="inline-flex items-center gap-1 font-semibold text-brand-teal-text">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                ID verified
              </span>
            )}
          </span>
        </span>
        <span className="sr-only">View {name}'s profile</span>
      </Link>
      {communication && <p className="text-[15px] text-muted-foreground">{communication}</p>}
      <OwnerReviewsSummaryCard ownerUserId={ownerId} />
    </section>
  );
};

/** Pet cards: photo, name, type and age, with Medication flagged. */
export const PetCards = ({ pets, onOpen }: { pets: ListingPet[]; onOpen: (id: string) => void }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
    {pets.map((pet) => {
      const Icon = petTypeIcon(pet.type);
      const age = formatPetAge(pet.age);
      return (
        <button
          key={pet.id}
          type="button"
          onClick={() => onOpen(pet.id)}
          className="flex flex-col overflow-hidden rounded-[20px] border border-[var(--nn-border)] bg-card text-left"
        >
          <span className="flex h-[120px] items-center justify-center bg-[#CDB79E]">
            {pet.photos?.[0] ? <img src={pet.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon className="h-10 w-10 text-[#8A7660]" aria-hidden="true" />}
          </span>
          <span className="flex flex-col gap-1 p-3">
            <span className="text-[16px] font-bold">{pet.name || formatPetType(pet.type)}</span>
            <span className="text-sm text-muted-foreground">{[petTypeOne(pet.type), age?.replace(/ old$/, "")].filter(Boolean).join(" · ")}</span>
            {pet.has_medication && (
              <span className="self-start">
                <StatusChip tone="accent">Medication</StatusChip>
              </span>
            )}
            <span className="mt-1 text-sm font-bold text-[var(--nn-accent-dark)]">{pet.name ? `See ${pet.name}'s profile` : "See profile"}</span>
          </span>
        </button>
      );
    })}
  </div>
);

const Field = ({ label, text }: { label: string; text: string | null | undefined }) =>
  text ? (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-bold">{label}</p>
      <p className="whitespace-pre-line text-[15px] text-muted-foreground">{text}</p>
    </div>
  ) : null;

/** Every public field for one pet. The owner also sees medication and vet. */
export const PetPanel = ({ pet, isOwner, onClose }: { pet: ListingPet | null; isOwner: boolean; onClose: () => void }) => (
  <ResponsiveSheet open={!!pet} onOpenChange={(o) => !o && onClose()} title={pet?.name || (pet ? formatPetType(pet.type) : "")} description="Everything about this pet">
    {pet && (
      <div className="flex flex-col gap-4">
        {pet.photos?.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {pet.photos.map((p, i) => (
              <img key={p + i} src={p} alt={`${pet.name || "Pet"} ${i + 1}`} className="h-[140px] w-full rounded-2xl object-cover" />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <StatusChip tone="grey">{petTypeOne(pet.type)}</StatusChip>
          {formatPetAge(pet.age) && <StatusChip tone="grey">{formatPetAge(pet.age)?.replace(/ old$/, "")}</StatusChip>}
          {pet.has_medication && <StatusChip tone="accent">Medication</StatusChip>}
          {pet.reactive_to_animals && <StatusChip tone="grey">Reactive to other animals</StatusChip>}
        </div>
        <Field label="Personality" text={pet.personality} />
        <Field label="Daily routine" text={pet.daily_routine} />
        <Field label="Feeding" text={pet.feeding_details} />
        <Field label="Walks and exercise" text={pet.walks_exercise} />
        <Field label="Fine on their own" text={pet.separation_anxiety_tolerance} />
        {isOwner && (
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-[var(--nn-border)] p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Lock className="h-4 w-4" aria-hidden="true" />
              Only you can see this
            </p>
            <p className="text-[15px]">
              <span className="font-bold">Medication: </span>
              {pet.has_medication ? pet.medication_instructions || "Not added yet" : "None"}
            </p>
            <p className="text-[15px]">
              <span className="font-bold">Vet: </span>
              {pet.vet_info || "Not added yet"}
            </p>
            <p className="text-sm text-muted-foreground">Your confirmed Nomad gets these in the Welcome Guide.</p>
          </div>
        )}
      </div>
    )}
  </ResponsiveSheet>
);

const homeGroups = (h: ListingHomeFields) => {
  const theHome = [words(h.home_type), h.location_type ? LOCATION_LABELS[h.location_type] : null, words(h.sleeping_arrangement), h.wifi_quality ? `${words(h.wifi_quality)} Wi-Fi` : null].filter(Boolean).join(" · ");
  const goodToKnow = [
    h.remote_location && "Remote location",
    h.car_needed && "Car needed",
    h.heavy_gardening && "Plant care",
    h.wheelchair_accessible && "Step-free access",
    h.public_transport_accessible === true && "Public transport nearby",
  ].filter(Boolean).join(" · ");
  return [
    { title: "The home", text: theHome },
    { title: "Good to know", text: goodToKnow },
    { title: "Amenities", text: h.amenities.join(" · ") },
  ].filter((g) => g.text);
};

const ruleGroups = (h: ListingHomeFields, host: string) =>
  [
    { title: `What ${host} asks of a Nomad`, items: h.requirements, other: h.requirements_other },
    { title: "House rules", items: h.house_rules, other: h.house_rules_other },
    { title: "Home tasks", items: h.home_care_tasks, other: h.home_care_tasks_other },
  ].filter((g) => g.items.length > 0 || g.other);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Two rows that open the shared panel on "The home" or "What's expected". */
export const HomeRows = ({ home, onOpen }: { home: ListingHomeFields; onOpen: (tab: "home" | "rules") => void }) => {
  const homeSub = [words(home.home_type), home.location_type ? LOCATION_LABELS[home.location_type] : null, words(home.sleeping_arrangement), home.amenities.length ? plural(home.amenities.length, "amenity", "amenities") : null].filter(Boolean).join(" · ");
  const rulesSub = [
    home.requirements.length ? plural(home.requirements.length, "requirement", "requirements") : null,
    home.house_rules.length ? plural(home.house_rules.length, "house rule", "house rules") : null,
    home.home_care_tasks.length ? plural(home.home_care_tasks.length, "home task", "home tasks") : null,
  ].filter(Boolean).join(" · ");
  const row = (tab: "home" | "rules", title: string, sub: string, first?: boolean) => (
    <button type="button" onClick={() => onOpen(tab)} className={cn("flex min-h-[64px] w-full items-center gap-3 py-3 text-left", !first && "border-t border-[var(--nn-line)]")}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-bold">{title}</span>
        <span className="text-sm text-muted-foreground">{sub || "Nothing listed"}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
  return (
    <div className="rounded-[22px] border border-[var(--nn-border)] bg-card px-4">
      {row("home", "The home", homeSub, true)}
      {row("rules", "What's expected", rulesSub)}
    </div>
  );
};

/** One panel with two tabs: The home, and What's expected. */
export const HomePanel = ({
  tab,
  onTab,
  onClose,
  home,
  hostName,
}: {
  tab: "home" | "rules" | null;
  onTab: (t: "home" | "rules") => void;
  onClose: () => void;
  home: ListingHomeFields;
  hostName: string;
}) => {
  const seg = (t: "home" | "rules", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      onClick={() => onTab(t)}
      className={cn("h-11 flex-1 rounded-full text-sm", tab === t ? "bg-card font-bold shadow-sm" : "font-semibold text-muted-foreground")}
    >
      {label}
    </button>
  );
  const rules = ruleGroups(home, hostName);
  return (
    <ResponsiveSheet open={!!tab} onOpenChange={(o) => !o && onClose()} title={tab === "rules" ? "What's expected" : "The home"} description="The home and what is expected of a Nomad">
      <div className="flex flex-col gap-5">
        <div role="tablist" aria-label="The home and what's expected" className="flex rounded-full bg-muted p-1">
          {seg("home", "The home")}
          {seg("rules", "What's expected")}
        </div>
        {tab === "home" ? (
          homeGroups(home).map((g) => <Field key={g.title} label={g.title} text={g.text} />)
        ) : rules.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">No specific requirements listed.</p>
        ) : (
          rules.map((g) => (
            <div key={g.title} className="flex flex-col gap-2">
              <p className="text-sm font-bold">{g.title}</p>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-[15px]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal-text" aria-hidden="true" />
                    {it}
                  </li>
                ))}
              </ul>
              {g.other && <p className="text-[15px] text-muted-foreground">{g.other}</p>}
            </div>
          ))
        )}
      </div>
    </ResponsiveSheet>
  );
};

/** Date tiles. Nomads tick one or more; the owner sees applicant counts. */
export const DateTiles = ({
  dates,
  pickable,
  selected,
  onToggle,
  badges,
}: {
  dates: ListingSitDate[];
  pickable: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  /** A chip per date: applicants for the owner, "Confirmed" for the Nomad. */
  badges?: Record<string, { text: string; tone: "green" | "accent" }>;
}) => (
  <div className="flex flex-col gap-2.5">
    {dates.map((d) => {
      const on = selected.includes(d.id);
      const nights = nightsBetween(d.start_date, d.end_date);
      const meta = [`${nights} ${nights === 1 ? "night" : "nights"}`, words(d.flexibility)?.toLowerCase()].filter(Boolean).join(" · ");
      const badge = badges?.[d.id];
      const body = (
        <>
          {pickable && (
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", on ? "bg-[var(--nn-accent)] text-primary-foreground" : "shadow-[inset_0_0_0_2px_hsl(var(--border))]")}>
              {on && <Check className="h-4 w-4" aria-hidden="true" />}
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[16px] font-bold">{longRange(d.start_date, d.end_date)}</span>
            <span className="text-sm text-muted-foreground">{meta}</span>
          </span>
          {badge && <StatusChip tone={badge.tone}>{badge.text}</StatusChip>}
        </>
      );
      const cls = cn(
        "flex min-h-[72px] w-full items-center gap-3.5 rounded-[18px] px-4 py-3 text-left",
        on ? "border-2 border-[var(--nn-accent)] bg-[var(--nn-tint)]" : "border-[1.5px] border-[var(--nn-border)] bg-card",
      );
      return pickable ? (
        <button key={d.id} type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(d.id)} className={cls}>
          {body}
        </button>
      ) : (
        <div key={d.id} className={cls}>
          {body}
        </div>
      );
    })}
  </div>
);

/** About this sit, clamped to four lines with Read more. */
export const AboutText = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false);
  const long = text.length > 260;
  return (
    <div className="flex flex-col gap-2">
      <p id="about-text" className={cn("whitespace-pre-line text-[16px] leading-relaxed", long && !open && "line-clamp-4")}>
        {text}
      </p>
      {long && (
        <button type="button" aria-expanded={open} aria-controls="about-text" onClick={() => setOpen(!open)} className="min-h-11 self-start text-[15px] font-bold underline underline-offset-2">
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
};

export const SectionTitle = ({ children, id }: { children: React.ReactNode; id?: string }) => (
  <h2 id={id} className="font-display text-[22px] font-normal leading-tight">
    {children}
  </h2>
);

