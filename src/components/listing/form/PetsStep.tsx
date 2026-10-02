import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import ImageUpload from "@/components/listing/ImageUpload";
import type { ListingFormData, Pet } from "@/hooks/useListingForm";
import { LEFT_ALONE, PET_KINDS } from "@/lib/listingOptions";
import { nnButton } from "@/components/nn/ui";
import { FieldError, FieldLabel, PrivateTag, SelectField, StepTitle, TileGroup, ToggleRow, inputClass } from "./FormBits";
import { cn } from "@/lib/utils";

const kindLabel = (t: string) => PET_KINDS.find((k) => k.value === t)?.label ?? "Pet";

const TextArea = ({ id, label, value, onChange, placeholder, extra, error, hint }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  extra?: React.ReactNode;
  error?: string;
  hint?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <FieldLabel htmlFor={id} extra={extra}>
      {label}
    </FieldLabel>
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      aria-invalid={!!error}
      aria-describedby={[hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined}
      className={cn(inputClass, "resize-y")}
    />
    {hint && (
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {hint}
      </p>
    )}
    {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
  </div>
);

/** Pets: one pet open for editing, the others folded with Edit. */
const PetsStep = ({
  formData,
  addPet,
  updatePet,
  removePet,
  onPhotoRemoved,
  errors,
}: {
  formData: ListingFormData;
  addPet: () => string;
  updatePet: (id: string, d: Partial<Pet>) => void;
  removePet: (id: string) => void;
  onPhotoRemoved: (url: string) => void;
  errors: Record<string, string>;
}) => {
  const firstWithError = formData.pets.find((p) => Object.keys(errors).some((k) => k.endsWith(p.id)))?.id;
  const [openId, setOpenId] = useState<string | null>(firstWithError ?? formData.pets[0]?.id ?? null);
  // After a failed Next or Save, open the pet that needs attention.
  useEffect(() => {
    if (firstWithError) setOpenId(firstWithError);
  }, [firstWithError, errors]);
  const current = openId;

  return (
    <div className="flex flex-col gap-5">
      <StepTitle>Your pets</StepTitle>

      {formData.pets.map((pet) => {
        const open = pet.id === current;
        const name = pet.name.trim() || "Your pet";
        const summary = [kindLabel(pet.type), pet.age].filter(Boolean).join(" · ");
        if (!open) {
          return (
            <div key={pet.id} className="flex min-h-[64px] items-center gap-3 rounded-[20px] border border-[var(--nn-border)] bg-card px-4 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[16px] font-bold">{name}</span>
                <span className="text-sm text-muted-foreground">{summary}</span>
              </span>
              <button type="button" onClick={() => setOpenId(pet.id)} className={nnButton("secondary", "h-11")} aria-label={`Edit ${name}`}>
                Edit
              </button>
            </div>
          );
        }
        const e = (k: string) => errors[`${k}-${pet.id}`];
        return (
          <section key={pet.id} aria-label={`${name}, editing`} className="flex flex-col gap-4 rounded-[22px] border-2 border-[var(--nn-accent)] bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[17px] font-bold">{name}</span>
                <span className="text-sm text-muted-foreground">{summary}</span>
              </span>
              <span className="rounded-full bg-[var(--nn-tint)] px-3 py-1 text-xs font-bold text-[var(--nn-accent-dark)]">Editing</span>
              {formData.pets.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    removePet(pet.id);
                    setOpenId(formData.pets.find((p) => p.id !== pet.id)?.id ?? null);
                  }}
                  aria-label={`Remove ${name}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
                >
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </div>

            <TileGroup label="Type of pet" options={PET_KINDS} value={pet.type} onChange={(v) => updatePet(pet.id, { type: v })} columns="grid-cols-4" />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor={`pet-name-${pet.id}`}>Name</FieldLabel>
                <input
                  id={`pet-name-${pet.id}`}
                  value={pet.name}
                  onChange={(ev) => updatePet(pet.id, { name: ev.target.value })}
                  aria-invalid={!!e("name")}
                  aria-describedby={e("name") ? `name-err-${pet.id}` : undefined}
                  className={inputClass}
                />
                {e("name") && <FieldError id={`name-err-${pet.id}`}>{e("name")}</FieldError>}
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor={`pet-age-${pet.id}`}>Age</FieldLabel>
                <input id={`pet-age-${pet.id}`} value={pet.age} onChange={(ev) => updatePet(pet.id, { age: ev.target.value })} placeholder="e.g. 6 years" className={inputClass} />
              </div>
            </div>

            <TextArea id={`pet-personality-${pet.id}`} label="Personality" value={pet.personality} onChange={(v) => updatePet(pet.id, { personality: v })} placeholder="Shy at first, loves a lap…" />
            <TextArea id={`pet-feeding-${pet.id}`} label="Feeding" value={pet.feeding_details} onChange={(v) => updatePet(pet.id, { feeding_details: v })} placeholder="Food, portions and times" />
            <TextArea id={`pet-routine-${pet.id}`} label="Daily routine" value={pet.daily_routine} onChange={(v) => updatePet(pet.id, { daily_routine: v })} placeholder="A typical day" />
            {(pet.type === "dog" || pet.type === "other") && (
              <TextArea id={`pet-walks-${pet.id}`} label="Walks and exercise" value={pet.walks_exercise} onChange={(v) => updatePet(pet.id, { walks_exercise: v })} placeholder="How often, how long, favourite routes" />
            )}

            <ToggleRow
              id={`pet-meds-${pet.id}`}
              label="Needs medication"
              sub="Regular tablets, drops or injections"
              checked={pet.has_medication}
              onChange={(v) => updatePet(pet.id, { has_medication: v })}
            />
            {pet.has_medication && (
              <TextArea
                id={`pet-medication-${pet.id}`}
                label="Medication instructions"
                extra={<PrivateTag />}
                value={pet.medication_instructions}
                onChange={(v) => updatePet(pet.id, { medication_instructions: v })}
                placeholder="What, how much, when and how to give it"
                hint="Only you and your confirmed Nomad see this."
                error={e("meds")}
              />
            )}

            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor={`pet-alone-${pet.id}`}>How long can {pet.name.trim() || "they"} be left alone?</FieldLabel>
              <SelectField
                id={`pet-alone-${pet.id}`}
                value={pet.separation_anxiety_tolerance}
                onChange={(v) => updatePet(pet.id, { separation_anxiety_tolerance: v })}
                options={LEFT_ALONE}
                placeholder="Choose one"
              />
            </div>

            <ToggleRow
              id={`pet-reactive-${pet.id}`}
              label="Reacts badly to other animals"
              checked={pet.reactive_to_animals}
              onChange={(v) => updatePet(pet.id, { reactive_to_animals: v })}
            />

            <TextArea
              id={`pet-vet-${pet.id}`}
              label="Vet details"
              extra={<PrivateTag />}
              value={pet.vet_info}
              onChange={(v) => updatePet(pet.id, { vet_info: v })}
              placeholder="Clinic name, phone and area"
              hint="No regular vet yet? Add the nearest clinic. Only you and your confirmed Nomad see this."
              error={e("vet")}
            />

            <ImageUpload
              images={pet.photos}
              onImagesChange={(photos) => updatePet(pet.id, { photos })}
              onRemove={onPhotoRemoved}
              maxImages={4}
              folder={`pets/${pet.id}`}
              label={`Photos of ${pet.name.trim() || "your pet"} (up to 4)`}
            />
          </section>
        );
      })}

      <button type="button" onClick={() => setOpenId(addPet())} className={nnButton("secondary", "self-start")}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add another pet
      </button>
    </div>
  );
};

export default PetsStep;
