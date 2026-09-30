import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  MessageCircleQuestion,
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
import { useGuideQuestionGroups } from "./GuideQuestions";
import { useGuideQa } from "@/hooks/useAskNest";
import { SectionCard, StatusChip, nnButton } from "@/components/nn/ui";
import { Link } from "react-router-dom";

const SECTION_ICON: Record<GuideSection, typeof PawPrint> = {
  pets: PawPrint,
  emergency: Stethoscope,
  house: Home,
  access: KeyRound,
};

const str = (v: string | null | undefined) => v ?? "";

/** Owner editor for one listing's Welcome Guide: overview + one section at a time. */
export const GuideEditor = ({
  listingId,
  initialSection = null,
}: {
  listingId: string;
  /** Open straight on a section (e.g. from the "arrives soon" nudge). */
  initialSection?: GuideSection | null;
}) => {
  const { data, isLoading, error } = useGuideEditorData(listingId);
  const { data: completion } = useGuideCompletion(listingId);
  const actions = useGuideEditorActions(listingId);
  const ai = useGuideAi();
  const questions = useGuideQuestionGroups(listingId);
  const { data: savedQa = [] } = useGuideQa(listingId);

  const [active, setActive] = useState<GuideSection | null>(initialSection);
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

  if (isLoading) return <Skeleton className="h-96 w-full rounded-[24px]" />;
  if (error) {
    return (
      <div className="rounded-[24px] border border-[var(--nn-border)] bg-card p-6 text-center">
        <p className="text-[16px] font-bold">We couldn't load your guide.</p>
        <p className="mt-1 text-[15px] text-muted-foreground">
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

  // ─── Overview (GuideEditorPhone / Tablet / Desktop) ──────────────────────
  if (!active) {
    const questionsTo = `/listing/${listingId}/welcome-guide/questions`;
    return (
      <div className="flex flex-col gap-[18px]">
        <header className="flex flex-col gap-2">
          <h1 ref={headingRef} tabIndex={-1} className="font-display text-[32px] font-normal leading-tight outline-none lg:text-[38px]">
            {GUIDE_COPY.header}
          </h1>
          <p className="max-w-2xl text-[15px] text-muted-foreground">{GUIDE_COPY.subtext}</p>
          <p className="text-[15px] text-muted-foreground">{data.listing.title}</p>
        </header>

        <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-7">
          <div className="flex min-w-0 flex-col gap-[18px]">
            <SectionCard label="Your progress" className="flex flex-col gap-3 p-[18px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[16px] font-bold">{GUIDE_COPY.progress(percent)}</span>
                <span className="text-[15px] font-bold text-[var(--nn-accent-dark)]">{percent}%</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-[var(--nn-track)]"
                role="progressbar"
                aria-label={GUIDE_COPY.progress(percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
              </div>
              {nudge && <p className="text-[15px] text-muted-foreground">{nudge}</p>}
            </SectionCard>

            <Link to={`/listing/${listingId}/welcome-guide/preview`} className={nnButton("secondary", "h-[52px] rounded-2xl text-[15px] lg:hidden")}>
              <Eye className="h-4 w-4" aria-hidden="true" />
              Preview and print
            </Link>

            {data.guide?.migrated_notes && (
              <SectionCard className="flex flex-col gap-3 border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] p-[18px]">
                <p className="flex items-center gap-2 text-[15px] font-bold">
                  <AlertCircle className="h-4 w-4 text-[var(--nn-tip-text)]" aria-hidden="true" />
                  From your previous guide
                </p>
                <p className="text-[15px] text-muted-foreground">
                  We couldn't place these automatically. Copy them into the right pet or section, then hide this note.
                </p>
                <p className="whitespace-pre-line rounded-xl bg-background p-3 text-[15px]">{data.guide.migrated_notes}</p>
                <button type="button" onClick={dismissMigrated} className={nnButton("secondary", "self-start")}>
                  Done, hide this
                </button>
              </SectionCard>
            )}

            <ul aria-label="Sections" className="grid grid-cols-2 gap-3">
              {GUIDE_SECTIONS.map((s, i) => {
                const Icon = SECTION_ICON[s.key];
                const state = completion?.sections?.[s.key];
                const done = state?.complete;
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => setActive(s.key)}
                      className="flex h-full min-h-[132px] w-full flex-col gap-2 rounded-[20px] border border-[var(--nn-border)] bg-card p-4 text-left hover:bg-[var(--nn-soft)]"
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]">
                          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                        </span>
                        {done ? (
                          <StatusChip tone="green">Done</StatusChip>
                        ) : (
                          <StatusChip tone="accent">{Math.round((state?.fraction ?? 0) * 100)}%</StatusChip>
                        )}
                      </span>
                      <span className="text-[13px] text-muted-foreground">Section {i + 1}</span>
                      <span className="text-[16px] font-bold leading-snug">{s.title}</span>
                      <span className="line-clamp-2 text-[13px] text-muted-foreground">{s.short}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex min-w-0 flex-col gap-[18px] lg:sticky lg:top-24">
            <Link
              to={`/listing/${listingId}/welcome-guide/preview`}
              className={nnButton("secondary", "hidden h-[52px] rounded-2xl text-[15px] lg:inline-flex")}
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              Preview and print
            </Link>
            <SectionCard label="Questions" className="px-[18px] py-1.5">
              <Link to={questionsTo} className="flex min-h-[60px] items-center gap-3 py-3">
                <span className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]">
                  <MessageCircleQuestion className="h-[18px] w-[18px]" aria-hidden="true" />
                  {questions.emergencies.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-destructive" aria-hidden="true" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">Questions from your sitters</span>
                  <span className="text-[13px] text-muted-foreground">
                    {questions.open.length === 0 ? "You're all caught up" : `${questions.open.length} to answer`}
                    {questions.emergencies.length > 0 ? " · emergency check" : ""}
                  </span>
                </span>
                {questions.open.length > 0 ? (
                  <StatusChip tone="accent">{questions.open.length} new</StatusChip>
                ) : (
                  <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </Link>
              <Link to={`${questionsTo}?tab=saved`} className="flex min-h-[60px] items-center gap-3 border-t border-[var(--nn-line)] py-3">
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[var(--nn-chip)] text-muted-foreground">
                  <BookmarkCheck className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">Saved answers</span>
                  <span className="text-[13px] text-muted-foreground">
                    {savedQa.length === 0 ? "None yet" : `${savedQa.length} ${savedQa.length === 1 ? "answer" : "answers"} in your guide`}
                  </span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </SectionCard>
          </div>
        </div>
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
    <div className="flex flex-col gap-[18px] pb-4 lg:max-w-3xl">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setActive(null)}
          className="-ml-2 inline-flex h-11 items-center gap-1 self-start rounded-md px-2 text-[15px] font-semibold hover:bg-[var(--nn-soft)]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          All sections
        </button>
        <p className="text-[13px] font-semibold text-muted-foreground">
          Section {index + 1} of {GUIDE_SECTIONS.length}
        </p>
        <h2 ref={headingRef} tabIndex={-1} className="font-display text-[30px] font-normal leading-tight outline-none">
          {meta.title}
        </h2>
      </div>

      {active === "pets" &&
        (data.pets.length === 0 ? (
          <p className="rounded-[20px] border border-[var(--nn-border)] bg-card p-4 text-[15px] text-muted-foreground">
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
            {activePet && (
              <div className="space-y-5 rounded-[24px] border border-[var(--nn-border)] bg-card p-[18px] lg:p-5">
                <p className="text-[15px] text-muted-foreground">
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
        <div className="space-y-5 rounded-[24px] border border-[var(--nn-border)] bg-card p-[18px] lg:p-5">
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
                  className="h-11 p-0"
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
        <div className="space-y-5 rounded-[24px] border border-[var(--nn-border)] bg-card p-[18px] lg:p-5">
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
        <div className="space-y-5 rounded-[24px] border border-[var(--nn-border)] bg-card p-[18px] lg:p-5">
          <p className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-[15px] text-muted-foreground">
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

      <div className="rounded-[24px] border border-[var(--nn-border)] bg-card p-[18px] lg:p-5">
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

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-5 border-t border-[var(--nn-line)] bg-background/95 px-5 pb-3 pt-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-[20px] md:border md:px-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => saveSection(active, false)} disabled={saving} className={nnButton("secondary", "h-[52px] rounded-2xl px-6")}>
            Save
          </button>
          <button
            type="button"
            onClick={() => saveSection(active, true)}
            disabled={saving}
            className={nnButton("primary", "ml-auto h-[52px] flex-1 rounded-2xl text-[15px] md:min-w-52 md:flex-none")}
          >
            {saving ? "Saving…" : isLast ? "Save and finish" : "Save and next"}
          </button>
        </div>
      </div>
    </div>
  );
};
