import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Sparkles,
  Home,
  KeyRound,
  Lock,
  MapPin,
  PawPrint,
  Printer,
  Stethoscope,
  WifiOff,
  MessageCircleQuestion,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { printWelcomeGuide } from "@/lib/printGuide";
import {
  formatUnlock,
  useSitterGuide,
  useSitterGuidePhotoUrls,
  type SitterGuidePet,
  type SitterGuidePhoto,
} from "@/hooks/useSitterGuide";
import { ACCESS_FIELDS, EMERGENCY_FIELDS, HOUSE_FIELDS, PET_FIELDS, type GuideSection } from "@/lib/welcomeGuide";
import { useAskNestAvailable } from "@/hooks/useAskNest";
import { AskNestSheet } from "./AskNestSheet";

const Section = ({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof PawPrint;
  title: string;
  children: ReactNode;
}) => (
  <section className="print-guide-section space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
    <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      {title}
    </h2>
    {children}
  </section>
);

const Item = ({ label, value, muted }: { label: string; value: string; muted?: boolean }) => (
  <div className="space-y-1">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={cn("whitespace-pre-line text-sm", muted && "text-muted-foreground")}>{value}</p>
  </div>
);

const Photos = ({
  photos,
  urls,
  pets,
}: {
  photos: SitterGuidePhoto[];
  urls: Record<string, string>;
  pets: SitterGuidePet[];
}) =>
  photos.length === 0 ? null : (
    <ul className="grid gap-3 sm:grid-cols-2">
      {photos.map((p) => (
        <li key={p.id} className="overflow-hidden rounded-xl border bg-background">
          {urls[p.id] ? (
            <img src={urls[p.id]} alt="" className="h-44 w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-24 items-center justify-center bg-muted text-xs text-muted-foreground print-hidden">
              Photo available online
            </div>
          )}
          <div className="space-y-1 p-3">
            {p.pet_id && (
              <p className="text-xs font-medium text-primary">{pets.find((x) => x.id === p.pet_id)?.name || "Pet"}</p>
            )}
            <p className="whitespace-pre-line text-sm">{p.instruction || p.note || ""}</p>
          </div>
        </li>
      ))}
    </ul>
  );

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * The confirmed sitter's Welcome Guide. Everything shown here (and printed)
 * comes from get_sitter_guide, so the screen, the print view and the offline
 * copy all follow the database's access window.
 */
export const SitterGuideView = ({ listingId }: { listingId: string }) => {
  const { guide, isLoading, error, fromCache, savedAt } = useSitterGuide(listingId);
  const { data: urls = {} } = useSitterGuidePhotoUrls(listingId, !!guide && !fromCache);
  const [petId, setPetId] = useState<string | null>(null);
  const askNestAvailable = useAskNestAvailable();
  const [askOpen, setAskOpen] = useState(false);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (error && !guide) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
        We couldn't load the Welcome Guide. Check your connection and try again.
      </div>
    );
  }
  if (!guide) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        <Lock className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">This Welcome Guide isn't available</p>
        <p className="mt-1 text-sm text-muted-foreground">
          It opens for the confirmed sitter once a sit is confirmed, and closes when the sit ends.
        </p>
      </div>
    );
  }

  const g = guide.guide ?? {};
  const na = (g.na_fields as string[] | undefined) ?? [];
  const photosFor = (s: GuideSection) => guide.photos.filter((p) => p.section === s);
  const activePet = guide.pets.find((p) => p.id === petId) ?? guide.pets[0];

  const petBlock = (pet: SitterGuidePet) => {
    const rows = PET_FIELDS.map((f) => ({ label: f.label, value: text(pet[f.key]) })).filter((r) => r.value);
    const onMeds = pet.requires_medication || pet.has_medication;
    return (
      <div className="space-y-4">
        {rows.length === 0 && !onMeds ? (
          <p className="text-sm text-muted-foreground">No care notes yet.</p>
        ) : (
          rows.map((r) => <Item key={r.label} label={r.label} value={r.value} />)
        )}
        {onMeds && !text(pet.medication_instructions) && (
          <Item label="Medication" value="Takes medication. Ask the Pet Parent for details." muted />
        )}
      </div>
    );
  };

  const vetRows = guide.pets
    .map((p) => ({ label: guide.pets.length > 1 ? `Vet for ${p.name || p.type}` : "Vet", value: text(p.vet_info) }))
    .filter((r) => r.value);

  return (
    <div className="space-y-6 print-guide-root">
      {askNestAvailable && <AskNestSheet listingId={listingId} open={askOpen} onOpenChange={setAskOpen} />}
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold sm:text-3xl">
          <BookOpen className="h-6 w-6 text-primary" aria-hidden="true" />
          Welcome Guide
        </h1>
        <p className="text-muted-foreground">{guide.listing_title}</p>
        <div className="flex flex-wrap items-center gap-2 print-hidden">
          {fromCache && (
            <Badge variant="outline" className="gap-1">
              <WifiOff className="h-3 w-3" aria-hidden="true" />
              Offline copy{savedAt ? `, saved ${new Date(savedAt).toLocaleDateString()}` : ""}
            </Badge>
          )}
          {askNestAvailable && !fromCache && (
            <Button size="sm" className="gap-1.5" onClick={() => setAskOpen(true)}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Ask the Nest
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={printWelcomeGuide}>
            <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
            Download / Print
          </Button>
        </div>
      </header>

      {guide.address && (
        <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <Item label="Address" value={guide.address} />
        </div>
      )}

      <Section icon={PawPrint} title="Pets">
        {guide.pets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pets listed for this home.</p>
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
                      "rounded-full border px-4 py-2 text-sm transition-colors",
                      activePet?.id === p.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/40",
                    )}
                  >
                    {p.name || p.type}
                  </button>
                ))}
              </div>
            )}
            {guide.pets.map((p) => (
              <div
                key={p.id}
                role={guide.pets.length > 1 ? "tabpanel" : undefined}
                className={cn("space-y-4", p.id !== activePet?.id && "hidden print-only")}
              >
                <p className="font-medium">
                  {p.name || p.type}
                  {p.age ? <span className="font-normal text-muted-foreground"> · {p.age}</span> : null}
                </p>
                {petBlock(p)}
                <Photos photos={photosFor("pets").filter((ph) => ph.pet_id === p.id)} urls={urls} pets={guide.pets} />
              </div>
            ))}
            <Photos photos={photosFor("pets").filter((ph) => !ph.pet_id)} urls={urls} pets={guide.pets} />
          </>
        )}
      </Section>

      <Section icon={Stethoscope} title="Vet and emergency">
        {vetRows.map((r) => (
          <Item key={r.label} label={r.label} value={r.value} />
        ))}
        {EMERGENCY_FIELDS.map((f) =>
          text(g[f.key]) ? <Item key={f.key} label={f.label} value={text(g[f.key])} /> : null,
        )}
        {vetRows.length === 0 && EMERGENCY_FIELDS.every((f) => !text(g[f.key])) && (
          <p className="text-sm text-muted-foreground">Not added yet. Ask the Pet Parent before you arrive.</p>
        )}
        <Photos photos={photosFor("emergency")} urls={urls} pets={guide.pets} />
      </Section>

      <Section icon={Home} title="House rules and everyday living">
        {HOUSE_FIELDS.map((f) => {
          const value = text(g[f.key]);
          if (value) return <Item key={f.key} label={f.label} value={value} />;
          if (f.naLabel && na.includes(f.key)) return <Item key={f.key} label={f.label} value={f.naLabel} muted />;
          return null;
        })}
        {HOUSE_FIELDS.every((f) => !text(g[f.key]) && !na.includes(f.key)) && (
          <p className="text-sm text-muted-foreground">Not added yet.</p>
        )}
        <Photos photos={photosFor("house")} urls={urls} pets={guide.pets} />
      </Section>

      {(guide.qa ?? []).length > 0 && (
        <Section icon={MessageCircleQuestion} title="Questions and answers">
          {(guide.qa ?? []).map((q) => (
            <Item key={q.id} label={q.question} value={q.answer} />
          ))}
        </Section>
      )}

      <Section icon={KeyRound} title="Arrival and access">
        {guide.access_open && guide.access ? (
          <>
            {ACCESS_FIELDS.map((f) => {
              const value = text(guide.access?.[f.key]);
              if (value) return <Item key={f.key} label={f.label} value={value} />;
              if (f.naLabel && guide.access?.na_fields?.includes(f.key)) {
                return <Item key={f.key} label={f.label} value={f.naLabel} muted />;
              }
              return null;
            })}
            <Photos photos={photosFor("access")} urls={urls} pets={guide.pets} />
          </>
        ) : guide.access_open ? (
          <p className="text-sm text-muted-foreground">The Pet Parent hasn't added arrival details yet.</p>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/40 p-4">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm">
              Arrival details unlock {formatUnlock(guide.unlock_at, guide.timezone)}. We'll notify you when they're ready.
            </p>
          </div>
        )}
      </Section>
    </div>
  );
};
