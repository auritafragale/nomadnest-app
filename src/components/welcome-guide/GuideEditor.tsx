import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Home,
  KeyRound,
  Lock,
  PawPrint,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useGuideAi,
  useGuideCompletion,
  useGuideEditorActions,
  useGuideEditorData,
  type AccessFields,
  type GuideFields,
  type PetFields,
} from "@/hooks/useWelcomeGuide";
import {
  ACCESS_FIELDS,
  EMERGENCY_FIELDS,
  GUIDE_COPY,
  GUIDE_SECTIONS,
  HOUSE_FIELDS,
  PET_FIELDS,
  guideNudge,
  type GuideSection,
} from "@/lib/welcomeGuide";
import { GuideTextField } from "./GuideTextField";
import { GuidePhotos } from "./GuidePhotos";

const SECTION_ICON: Record<GuideSection, typeof PawPrint> = {
  pets: PawPrint,
  emergency: Stethoscope,
  house: Home,
  access: KeyRound,
};

const str = (v: string | null | undefined) => v ?? "";

/** Owner editor for one listing's Welcome Guide: overview + one section at a time. */
export const GuideEditor = ({ listingId }: { listingId: string }) => {
  const { data, isLoading, error } = useGuideEditorData(listingId);
  const { data: completion } = useGuideCompletion(listingId);
  const actions = useGuideEditorActions(listingId);
  const ai = useGuideAi();

  const [active, setActive] = useState<GuideSection | null>(null);
  const [guideDraft, setGuideDraft] = useState<Record<string, string>>({});
  const [guideNa, setGuideNa] = useState<string[]>([]);
  const [accessDraft, setAccessDraft] = useState<Record<string, string>>({});
  const [accessNa, setAccessNa] = useState<string[]>([]);
  const [petDrafts, setPetDrafts] = useState<Record<string, Record<string, string>>>({});
  const [activePetId, setActivePetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const loadedFor = useRef<string | null>(null);

  // Initialise drafts once per listing (later refetches don't overwrite typing).
  useEffect(() => {
    if (!data || loadedFor.current === listingId) return;
    loadedFor.current = listingId;
    const g = data.guide;
    setGuideDraft({
      emergency_contacts: str(g?.emergency_contacts),
      out_of_hours_vet: str(g?.out_of_hours_vet),
      ...Object.fromEntries(HOUSE_FIELDS.map((f) => [f.key, str(g?.[f.key])])),
    });
    setGuideNa(g?.na_fields ?? []);
    const a = data.access;
    setAccessDraft(Object.fromEntries(ACCESS_FIELDS.map((f) => [f.key, str(a?.[f.key])])));
    setAccessNa(a?.na_fields ?? []);
    setPetDrafts(
      Object.fromEntries(
        data.pets.map((p) => [
          p.id,
          { ...Object.fromEntries(PET_FIELDS.map((f) => [f.key, str(p[f.key])])), vet_info: str(p.vet_info) },
        ]),
      ),
    );
    setActivePetId(data.pets[0]?.id ?? null);
  }, [data, listingId]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [active]);

  const polishFor = (section: GuideSection) =>
    ai.visible ? (text: string) => ai.polish(listingId, section, text) : undefined;

  const photosFor = (section: GuideSection) => (data?.photos ?? []).filter((p) => p.section === section);

  const percent = completion?.percent ?? 0;
  const nudge = useMemo(() => guideNudge(completion), [completion]);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (error) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        <p className="font-medium">We couldn't load your guide.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {(error as { message?: string }).message || "Please refresh and try again."}
        </p>
      </div>
    );
  }
  if (!data) return null;

  const toggle = (list: string[], key: string, on: boolean) =>
    on ? Array.from(new Set([...list, key])) : list.filter((k) => k !== key);

  const saveSection = async (section: GuideSection, andNext: boolean) => {
    setSaving(true);
    try {
      if (section === "pets" || section === "emergency") {
        const keys = section === "pets" ? PET_FIELDS.map((f) => f.key) : ["vet_info"];
        await actions.savePets.mutateAsync(
          data.pets.map((p) => ({
            petId: p.id,
            values: Object.fromEntries(keys.map((k) => [k, petDrafts[p.id]?.[k]?.trim() || null])) as PetFields,
          })),
        );
      }
      if (section === "emergency") {
        await actions.saveGuide.mutateAsync({
          emergency_contacts: guideDraft.emergency_contacts?.trim() || null,
          out_of_hours_vet: guideDraft.out_of_hours_vet?.trim() || null,
        } as GuideFields);
      }
      if (section === "house") {
        await actions.saveGuide.mutateAsync({
          ...Object.fromEntries(HOUSE_FIELDS.map((f) => [f.key, guideDraft[f.key]?.trim() || null])),
          na_fields: guideNa,
        } as GuideFields);
      }
      if (section === "access") {
        await actions.saveAccess.mutateAsync({
          ...Object.fromEntries(ACCESS_FIELDS.map((f) => [f.key, accessDraft[f.key]?.trim() || null])),
          na_fields: accessNa,
        } as AccessFields);
      }
      toast.success("Saved");
      if (andNext) {
        const i = GUIDE_SECTIONS.findIndex((s) => s.key === section);
        setActive(GUIDE_SECTIONS[i + 1]?.key ?? null);
      }
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const dismissMigrated = async () => {
    try {
      await actions.saveGuide.mutateAsync({ migrated_notes: null } as GuideFields);
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't update. Please try again.");
    }
  };

  // ─── Overview ──────────────────────────────────────────────────────────────
  if (!active) {
    return (
      <div className="space-y-6">
        <header className="space-y-3">
          <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none sm:text-3xl">
            {GUIDE_COPY.header}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">{GUIDE_COPY.subtext}</p>
          <p className="text-sm text-muted-foreground">{data.listing.title}</p>
        </header>

        <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">{GUIDE_COPY.progress(percent)}</span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={GUIDE_COPY.progress(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          {nudge && (
            <p
              className={cn(
                "rounded-xl px-3 py-2.5 text-sm",
                percent >= 100 ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-primary/5 text-foreground",
              )}
            >
              {nudge}
            </p>
          )}
        </div>

        {data.guide?.migrated_notes && (
          <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              From your previous guide
            </p>
            <p className="text-sm text-muted-foreground">
              We couldn't place these automatically. Copy them into the right pet or section, then hide this note.
            </p>
            <p className="whitespace-pre-line rounded-xl bg-background p-3 text-sm">{data.guide.migrated_notes}</p>
            <Button variant="outline" size="sm" onClick={dismissMigrated}>
              Done, hide this
            </Button>
          </div>
        )}

        <ul className="grid gap-3 sm:grid-cols-2">
          {GUIDE_SECTIONS.map((s) => {
            const Icon = SECTION_ICON[s.key];
            const state = completion?.sections?.[s.key];
            const done = state?.complete;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => setActive(s.key)}
                  className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.short}</p>
                  </div>
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Complete" />
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {Math.round((state?.fraction ?? 0) * 100)}%
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // ─── One section ───────────────────────────────────────────────────────────
  const meta = GUIDE_SECTIONS.find((s) => s.key === active)!;
  const index = GUIDE_SECTIONS.findIndex((s) => s.key === active);
  const isLast = index === GUIDE_SECTIONS.length - 1;
  const setPetField = (petId: string, key: string, value: string) =>
    setPetDrafts((d) => ({ ...d, [petId]: { ...d[petId], [key]: value } }));
  const activePet = data.pets.find((p) => p.id === activePetId) ?? data.pets[0];

  return (
    <div className="space-y-6 pb-4">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setActive(null)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          All sections
        </button>
        <p className="text-xs font-medium text-muted-foreground">
          Section {index + 1} of {GUIDE_SECTIONS.length}
        </p>
        <h2 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
          {meta.title}
        </h2>
      </div>

      {active === "pets" &&
        (data.pets.length === 0 ? (
          <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
            This listing has no pets. Add pets from Edit listing if you have any.
          </p>
        ) : (
          <div className="space-y-5">
            {data.pets.length > 1 && (
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pets">
                {data.pets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={activePet?.id === p.id}
                    onClick={() => setActivePetId(p.id)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-colors",
                      activePet?.id === p.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40",
                    )}
                  >
                    {p.name || p.type}
                  </button>
                ))}
              </div>
            )}
            {activePet && (
              <div className="space-y-5 rounded-2xl border bg-card p-4 sm:p-5">
                <p className="text-sm text-muted-foreground">
                  This is the same information shown on your listing, so you only keep it in one place.
                </p>
                {PET_FIELDS.map((f) => (
                  <GuideTextField
                    key={`${activePet.id}-${f.key}`}
                    id={`${activePet.id}-${f.key}`}
                    label={f.key === "medication_instructions" ? "Medication (if any)" : f.label}
                    placeholder={f.placeholder}
                    value={petDrafts[activePet.id]?.[f.key] ?? ""}
                    onChange={(v) => setPetField(activePet.id, f.key, v)}
                    required={
                      f.key === "feeding_details" ||
                      f.key === "daily_routine" ||
                      (f.key === "medication_instructions" && !!(activePet.requires_medication || activePet.has_medication))
                    }
                    onPolish={polishFor("pets")}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

      {active === "emergency" && (
        <div className="space-y-5 rounded-2xl border bg-card p-4 sm:p-5">
          {data.pets.map((p, i) => (
            <div key={p.id} className="space-y-2">
              <GuideTextField
                id={`${p.id}-vet`}
                label={data.pets.length > 1 ? `Vet for ${p.name || p.type}` : "Vet details"}
                placeholder="Practice name, address and phone"
                value={petDrafts[p.id]?.vet_info ?? ""}
                onChange={(v) => setPetField(p.id, "vet_info", v)}
                onPolish={polishFor("emergency")}
              />
              {i === 0 && data.pets.length > 1 && (petDrafts[p.id]?.vet_info ?? "").trim() && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() =>
                    setPetDrafts((d) =>
                      Object.fromEntries(
                        Object.entries(d).map(([id, fields]) => [id, { ...fields, vet_info: d[p.id].vet_info }]),
                      ),
                    )
                  }
                >
                  Use this vet for all pets
                </Button>
              )}
            </div>
          ))}
          {EMERGENCY_FIELDS.map((f) => (
            <GuideTextField
              key={f.key}
              id={f.key}
              label={f.label}
              placeholder={f.placeholder}
              value={guideDraft[f.key] ?? ""}
              onChange={(v) => setGuideDraft((d) => ({ ...d, [f.key]: v }))}
              required={f.key === "emergency_contacts"}
              onPolish={polishFor("emergency")}
            />
          ))}
        </div>
      )}

      {active === "house" && (
        <div className="space-y-5 rounded-2xl border bg-card p-4 sm:p-5">
          {HOUSE_FIELDS.map((f) => (
            <GuideTextField
              key={f.key}
              id={f.key}
              label={f.label}
              placeholder={f.placeholder}
              value={guideDraft[f.key] ?? ""}
              onChange={(v) => setGuideDraft((d) => ({ ...d, [f.key]: v }))}
              naLabel={f.naLabel}
              isNa={guideNa.includes(f.key)}
              onNaChange={f.naLabel ? (on) => setGuideNa((l) => toggle(l, f.key, on)) : undefined}
              onPolish={polishFor("house")}
            />
          ))}
        </div>
      )}

      {active === "access" && (
        <div className="space-y-5 rounded-2xl border bg-card p-4 sm:p-5">
          <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Only you can see these details for now.
          </p>
          {ACCESS_FIELDS.map((f) => (
            <GuideTextField
              key={f.key}
              id={f.key}
              label={f.label}
              placeholder={f.placeholder}
              value={accessDraft[f.key] ?? ""}
              onChange={(v) => setAccessDraft((d) => ({ ...d, [f.key]: v }))}
              required={f.key === "key_handover" || f.key === "wifi_details"}
              naLabel={f.naLabel}
              isNa={accessNa.includes(f.key)}
              onNaChange={f.naLabel ? (on) => setAccessNa((l) => toggle(l, f.key, on)) : undefined}
              onPolish={polishFor("access")}
            />
          ))}
        </div>
      )}

      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <GuidePhotos
          listingId={listingId}
          section={active}
          photos={photosFor(active)}
          pets={data.pets}
          aiVisible={ai.visible}
          explainPhoto={ai.explainPhoto}
          addPhoto={(args) => actions.addPhoto.mutateAsync(args)}
          updatePhoto={(args) => actions.updatePhoto.mutateAsync(args)}
          deletePhoto={(photo) => actions.deletePhoto.mutateAsync(photo)}
        />
      </div>

      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => saveSection(active, false)} disabled={saving}>
            Save
          </Button>
          <Button className="ml-auto flex-1 sm:flex-none sm:min-w-44" onClick={() => saveSection(active, true)} disabled={saving}>
            {saving ? "Saving…" : isLast ? "Save and finish" : "Save and next"}
          </Button>
        </div>
      </div>
    </div>
  );
};
