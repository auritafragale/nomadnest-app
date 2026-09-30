import { useState, type ReactNode } from "react";
import {
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Home,
  KeyRound,
  Lock,
  MapPin,
  MessageCircleQuestion,
  PawPrint,
  Phone,
  Pill,
  Printer,
  Sparkles,
  Stethoscope,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, SerifTitle, nnButton } from "@/components/nn/ui";
import { cn } from "@/lib/utils";
import { printWelcomeGuide } from "@/lib/printGuide";
import {
  formatUnlock,
  useSitterGuide,
  useSitterGuidePhotoUrls,
  type SitterGuide,
  type SitterGuidePet,
  type SitterGuidePhoto,
} from "@/hooks/useSitterGuide";
import { ACCESS_FIELDS, EMERGENCY_FIELDS, HOUSE_FIELDS, PET_FIELDS, type GuideSection } from "@/lib/welcomeGuide";
import { useAskNestAvailable } from "@/hooks/useAskNest";
import { AskNestSheet } from "./AskNestSheet";

type Tab = "overview" | "pets" | "vet" | "house" | "qa" | "arrival";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Phone numbers written in a free-text field, for Call buttons. */
const phoneNumbers = (value: string) =>
  Array.from(new Set((value.match(/\+?\d[\d\s().-]{6,}\d/g) ?? []).map((n) => n.trim()))).slice(0, 3);

const Item = ({ label, value, muted, children }: { label: string; value?: string; muted?: boolean; children?: ReactNode }) => (
  <div className="flex items-start gap-3 border-t border-[var(--nn-line)] py-3.5 first:border-t-0 first:pt-0">
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      {value !== undefined && <p className={cn("whitespace-pre-line text-[15px] leading-relaxed", muted && "text-muted-foreground")}>{value}</p>}
    </div>
    {children}
  </div>
);

/** A field with Call buttons for each phone number in it (vet, emergency contacts). */
const CallItem = ({ label, value }: { label: string; value: string }) => {
  const numbers = phoneNumbers(value);
  return (
    <Item label={label} value={value}>
      {numbers.length > 0 && (
        <span className="flex shrink-0 flex-col gap-2 print-hidden">
          {numbers.map((n) => (
            <a
              key={n}
              href={`tel:${n.replace(/[^\d+]/g, "")}`}
              aria-label={`Call ${label}: ${n}`}
              className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-bold text-primary-foreground"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              {numbers.length > 1 ? n : "Call"}
            </a>
          ))}
        </span>
      )}
    </Item>
  );
};

/** Door and gate codes stay hidden until "Show" (always printed). */
const SecretItem = ({ label, value }: { label: string; value: string }) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-start gap-3 border-t border-[var(--nn-line)] py-3.5 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
        <p className="whitespace-pre-line text-[15px] leading-relaxed print-hidden" aria-live="polite">
          {shown ? value : <span aria-label="Hidden">••••••</span>}
        </p>
        <p className="hidden whitespace-pre-line text-[15px] print-only">{value}</p>
      </div>
      <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown} className={nnButton("secondary", "shrink-0 px-4 print-hidden")}>
        {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
};

/** Wi-Fi with a one-tap copy (the password when it's labelled, else the whole text). */
const WifiItem = ({ label, value }: { label: string; value: string }) => {
  const password = /password\s*[:=-]?\s*(\S+)/i.exec(value)?.[1];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password ?? value);
      toast.success(password ? "Wi-Fi password copied" : "Wi-Fi details copied");
    } catch {
      toast.error("Couldn't copy. Press and hold the text to copy it.");
    }
  };
  return (
    <Item label={label} value={value}>
      <button type="button" onClick={copy} className={nnButton("secondary", "shrink-0 px-4 print-hidden")}>
        <Copy className="h-4 w-4" aria-hidden="true" />
        {password ? "Copy password" : "Copy"}
      </button>
    </Item>
  );
};

const Photos = ({ photos, urls, pets }: { photos: SitterGuidePhoto[]; urls: Record<string, string>; pets: SitterGuidePet[] }) =>
  photos.length === 0 ? null : (
    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
      {photos.map((p) => (
        <li key={p.id} className="overflow-hidden rounded-2xl border border-[var(--nn-border)] bg-background">
          {urls[p.id] ? (
            <img src={urls[p.id]} alt="" className="h-44 w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-24 items-center justify-center bg-muted text-sm text-muted-foreground print-hidden">
              Photo available online
            </div>
          )}
          <div className="flex flex-col gap-1 p-3">
            {p.pet_id && (
              <p className="text-[13px] font-bold text-[var(--nn-accent-dark)]">{pets.find((x) => x.id === p.pet_id)?.name || "Pet"}</p>
            )}
            <p className="whitespace-pre-line text-[15px]">{p.instruction || p.note || ""}</p>
          </div>
        </li>
      ))}
    </ul>
  );

/**
 * The guide's content from a get_sitter_guide-shaped object. Used for the
 * confirmed Nomad and for the Pet Parent's "Preview and print".
 * Design: GuideNomadPhone, GuideNomadTabletDark, GuideNomadDesktop.
 */
export const GuideReader = ({
  guide,
  urls,
  fromCache = false,
  savedAt,
  onAsk,
  banner,
  preview = false,
}: {
  guide: SitterGuide;
  urls: Record<string, string>;
  fromCache?: boolean;
  savedAt?: string | null;
  onAsk?: () => void;
  banner?: ReactNode;
  /** The Pet Parent's preview: no sit dates to mention. */
  preview?: boolean;
}) => {
  const [tab, setTab] = useState<Tab>("overview");
  const [petId, setPetId] = useState<string | null>(null);
  const g = guide.guide ?? {};
  const na = (g.na_fields as string[] | undefined) ?? [];
  const photosFor = (s: GuideSection) => guide.photos.filter((p) => p.section === s);
  const activePet = guide.pets.find((p) => p.id === petId) ?? guide.pets[0];
  const owner = guide.owner_first_name;
  const qa = guide.qa ?? [];
  const endsText = new Date(guide.ends_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: guide.timezone });

  const vetRows = guide.pets
    .map((p) => ({ label: guide.pets.length > 1 ? `Vet for ${p.name || p.type}` : "Vet", value: text(p.vet_info) }))
    .filter((r) => r.value);
  const emergencyRows = EMERGENCY_FIELDS.map((f) => ({ label: f.label, value: text(g[f.key]) })).filter((r) => r.value);
  const contactCount = vetRows.length + emergencyRows.length;
  const onMeds = guide.pets.filter((p) => p.requires_medication || p.has_medication);
  const petNames = guide.pets.map((p) => p.name || p.type).filter(Boolean);
  const petsTitle = petNames.length === 0 ? "Pets" : petNames.length === 1 ? petNames[0]! : `${petNames.slice(0, -1).join(", ")} and ${petNames[petNames.length - 1]}`;

  const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "pets", label: "Pets", icon: PawPrint },
    { id: "vet", label: "Vet and emergency", icon: Stethoscope },
    { id: "house", label: "House", icon: Home },
    ...(qa.length > 0 ? [{ id: "qa" as Tab, label: "Q&A", icon: MessageCircleQuestion }] : []),
    { id: "arrival", label: "Arrival and access", icon: KeyRound },
  ];

  // Each section is shown on screen only when its tab is picked, and always printed.
  const panel = (id: Tab, title: string, children: ReactNode) => (
    <section
      key={id}
      aria-label={title}
      className={cn("print-guide-section flex flex-col gap-3", tab !== id && "hidden print-only")}
    >
      <SerifTitle className="text-[22px]">{title}</SerifTitle>
      {children}
    </section>
  );

  const petBlock = (pet: SitterGuidePet) => {
    const rows = PET_FIELDS.map((f) => ({ key: f.key, label: f.label, value: text(pet[f.key]) })).filter((r) => r.value);
    const meds = pet.requires_medication || pet.has_medication;
    return (
      <SectionCard className="p-[18px]">
        <p className="mb-3 text-[17px] font-bold">
          {pet.name || pet.type}
          {pet.age ? <span className="font-normal text-muted-foreground"> · {pet.age}</span> : null}
        </p>
        {rows.length === 0 && !meds ? (
          <p className="text-[15px] text-muted-foreground">No care notes yet.</p>
        ) : (
          rows.map((r) =>
            r.key === "medication_instructions" ? (
              <div key={r.key} className="my-2 rounded-2xl bg-[var(--nn-tip-bg)] px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--nn-tip-text)]">
                  <Pill className="h-4 w-4" aria-hidden="true" />
                  {r.label}
                </p>
                <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{r.value}</p>
              </div>
            ) : (
              <Item key={r.key} label={r.label} value={r.value} />
            ),
          )
        )}
        {meds && !text(pet.medication_instructions) && (
          <Item label="Medication" value={`Takes medication. Ask ${owner || "the Pet Parent"} for details.`} muted />
        )}
        <Photos photos={photosFor("pets").filter((ph) => ph.pet_id === pet.id)} urls={urls} pets={guide.pets} />
      </SectionCard>
    );
  };

  const arrivalShort = guide.access_open ? "Keys, codes and Wi-Fi" : `Unlocks ${formatUnlock(guide.unlock_at, guide.timezone)}`;

  const quick = (to: Tab, icon: LucideIcon, title: string, detail: string) => {
    const Icon = icon;
    return (
      <button
        key={to}
        type="button"
        onClick={() => setTab(to)}
        className="flex min-h-[60px] w-full items-center gap-3 border-t border-[var(--nn-line)] py-3 text-left first:border-t-0"
      >
        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold">{title}</span>
          <span className="text-[13px] text-muted-foreground">{detail}</span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className="print-guide-root flex flex-col gap-[18px]">
      <header className="flex flex-col gap-2.5">
        <SerifTitle as="h1" className="print-guide-title">Welcome Guide</SerifTitle>
        <p className="print-guide-meta text-[15px] text-muted-foreground">
          {guide.listing_title}
          {owner ? ` · ${owner}'s home` : ""}
        </p>
        {banner}
        <div className="flex flex-wrap items-center gap-2 print-hidden">
          {fromCache && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-[13px] font-semibold">
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
              Saved for offline{savedAt ? ` · ${new Date(savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
            </span>
          )}
          {onAsk && !fromCache && (
            <button type="button" onClick={onAsk} className={nnButton("primary")}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Ask the Nest
            </button>
          )}
          <button type="button" onClick={printWelcomeGuide} className={nnButton("secondary")}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            Download or print
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-7">
        {/* Phone and tablet: tabs. Desktop: a sticky section list. */}
        <nav aria-label="Guide sections" className="print-hidden lg:sticky lg:top-24">
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0 lg:hidden">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center rounded-full border-[1.5px] px-4 text-sm",
                  tab === t.id
                    ? "border-[var(--nn-accent)] bg-[var(--nn-accent)] font-bold text-primary-foreground"
                    : "border-[var(--nn-border)] bg-card font-semibold",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <SectionCard className="hidden p-2 lg:block">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px]",
                  tab === t.id ? "bg-[var(--nn-tint)] font-bold" : "font-semibold hover:bg-[var(--nn-soft)]",
                )}
              >
                <t.icon className="h-[18px] w-[18px] text-[var(--nn-accent-dark)]" aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </SectionCard>
        </nav>

        <div className="flex min-w-0 flex-col gap-[18px]">
          {panel(
            "overview",
            "Overview",
            <>
              {guide.address ? (
                <SectionCard label="Address" className="flex flex-col gap-2 p-[18px]">
                  <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Private address
                  </span>
                  <span className="whitespace-pre-line text-[17px] font-semibold">{guide.address}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {preview
                      ? "Only your confirmed Nomad sees this, from confirmation until their sit ends."
                      : `Only visible to you, from confirmation until your sit ends on ${endsText}.`}
                  </span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(guide.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={nnButton("secondary", "self-start print-hidden")}
                  >
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Open in maps
                  </a>
                </SectionCard>
              ) : null}
              <SectionCard label="At a glance" className="px-[18px] py-1.5 print-hidden">
                {quick("pets", PawPrint, petsTitle, onMeds.length > 0 ? "Meds today" : `${guide.pets.length} ${guide.pets.length === 1 ? "pet" : "pets"}`)}
                {quick("vet", Stethoscope, "Vet and emergency", contactCount > 0 ? `${contactCount} ${contactCount === 1 ? "contact" : "contacts"}` : "Not added yet")}
                {quick("arrival", KeyRound, "Arrival and access", arrivalShort)}
              </SectionCard>
            </>,
          )}

          {panel(
            "pets",
            "Pets",
            guide.pets.length === 0 ? (
              <p className="text-[15px] text-muted-foreground">No pets listed for this home.</p>
            ) : (
              <>
                {guide.pets.length > 1 && (
                  <div className="flex flex-wrap gap-2 print-hidden" role="tablist" aria-label="Pets">
                    {guide.pets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="tab"
                        aria-selected={activePet?.id === p.id}
                        onClick={() => setPetId(p.id)}
                        className={cn(
                          "inline-flex h-11 items-center rounded-full border-[1.5px] px-4 text-sm",
                          activePet?.id === p.id
                            ? "border-[var(--nn-accent)] bg-[var(--nn-accent)] font-bold text-primary-foreground"
                            : "border-[var(--nn-border)] bg-card font-semibold",
                        )}
                      >
                        {p.name || p.type}
                      </button>
                    ))}
                  </div>
                )}
                {guide.pets.map((p) => (
                  <div key={p.id} role={guide.pets.length > 1 ? "tabpanel" : undefined} className={cn(p.id !== activePet?.id && "hidden print-only")}>
                    {petBlock(p)}
                  </div>
                ))}
                <Photos photos={photosFor("pets").filter((ph) => !ph.pet_id)} urls={urls} pets={guide.pets} />
              </>
            ),
          )}

          {panel(
            "vet",
            "Vet and emergency",
            <SectionCard className="p-[18px]">
              {vetRows.map((r) => (
                <CallItem key={r.label} label={r.label} value={r.value} />
              ))}
              {emergencyRows.map((r) => (
                <CallItem key={r.label} label={r.label} value={r.value} />
              ))}
              {contactCount === 0 && (
                <p className="text-[15px] text-muted-foreground">Not added yet. Ask {owner || "the Pet Parent"} before you arrive.</p>
              )}
              <Photos photos={photosFor("emergency")} urls={urls} pets={guide.pets} />
            </SectionCard>,
          )}

          {panel(
            "house",
            "House rules and everyday living",
            <SectionCard className="p-[18px]">
              {HOUSE_FIELDS.map((f) => {
                const value = text(g[f.key]);
                if (value) return <Item key={f.key} label={f.label} value={value} />;
                if (f.naLabel && na.includes(f.key)) return <Item key={f.key} label={f.label} value={f.naLabel} muted />;
                return null;
              })}
              {HOUSE_FIELDS.every((f) => !text(g[f.key]) && !na.includes(f.key)) && (
                <p className="text-[15px] text-muted-foreground">Not added yet.</p>
              )}
              <Photos photos={photosFor("house")} urls={urls} pets={guide.pets} />
            </SectionCard>,
          )}

          {qa.length > 0 &&
            panel(
              "qa",
              "Questions and answers",
              <SectionCard className="p-[18px]">
                {qa.map((q) => (
                  <Item key={q.id} label={q.question} value={q.answer} />
                ))}
              </SectionCard>,
            )}

          {panel(
            "arrival",
            "Arrival and access",
            guide.access_open && guide.access ? (
              <SectionCard className="p-[18px]">
                {ACCESS_FIELDS.map((f) => {
                  const value = text(guide.access?.[f.key]);
                  if (value) {
                    if (f.key === "door_codes") return <SecretItem key={f.key} label={f.label} value={value} />;
                    if (f.key === "wifi_details") return <WifiItem key={f.key} label={f.label} value={value} />;
                    return <Item key={f.key} label={f.label} value={value} />;
                  }
                  if (f.naLabel && guide.access?.na_fields?.includes(f.key)) {
                    return <Item key={f.key} label={f.label} value={f.naLabel} muted />;
                  }
                  return null;
                })}
                <Photos photos={photosFor("access")} urls={urls} pets={guide.pets} />
              </SectionCard>
            ) : guide.access_open ? (
              <p className="text-[15px] text-muted-foreground">{owner || "The Pet Parent"} hasn't added arrival details yet.</p>
            ) : (
              <SectionCard className="flex items-start gap-3 border-dashed p-[18px]">
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex flex-col gap-1">
                  <span className="text-[16px] font-bold">Arrival details unlock {formatUnlock(guide.unlock_at, guide.timezone)}</span>
                  <span className="text-[15px] text-muted-foreground">
                    Keys, codes and Wi-Fi open 48 hours before your sit. We'll notify you when they're ready.
                  </span>
                </span>
              </SectionCard>
            ),
          )}

          {!preview && <p className="text-[13px] text-muted-foreground print-hidden">This guide closes when your sit ends on {endsText}.</p>}
        </div>
      </div>
    </div>
  );
};

/**
 * The confirmed sitter's Welcome Guide. Everything shown here (and printed)
 * comes from get_sitter_guide, so the screen, the print view and the offline
 * copy all follow the database's access window (re-checked every 5 minutes,
 * and closed at the end of the sit).
 */
export const SitterGuideView = ({ listingId }: { listingId: string }) => {
  const { guide, isLoading, error, fromCache, savedAt } = useSitterGuide(listingId);
  const { data: urls = {} } = useSitterGuidePhotoUrls(listingId, !!guide && !fromCache);
  const askNestAvailable = useAskNestAvailable();
  const [askOpen, setAskOpen] = useState(false);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-[24px]" />;
  if (error && !guide) {
    return (
      <SectionCard className="p-6 text-center text-[15px] text-muted-foreground">
        We couldn't load the Welcome Guide. Check your connection and try again.
      </SectionCard>
    );
  }
  if (!guide) {
    return (
      <SectionCard className="p-6 text-center">
        <Lock className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-[16px] font-bold">This Welcome Guide isn't available</p>
        <p className="mt-1 text-[15px] text-muted-foreground">
          It opens for the confirmed sitter once a sit is confirmed, and closes when the sit ends.
        </p>
      </SectionCard>
    );
  }

  return (
    <>
      {askNestAvailable && <AskNestSheet listingId={listingId} open={askOpen} onOpenChange={setAskOpen} />}
      <GuideReader
        guide={guide}
        urls={urls}
        fromCache={fromCache}
        savedAt={savedAt}
        onAsk={askNestAvailable ? () => setAskOpen(true) : undefined}
      />
    </>
  );
};
