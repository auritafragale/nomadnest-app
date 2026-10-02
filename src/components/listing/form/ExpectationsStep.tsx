import type { ListingFormData } from "@/hooks/useListingForm";
import { HOME_TASKS, HOUSE_RULES, MUST_HAVES, UPDATES } from "@/lib/listingOptions";
import { FieldLabel, PillGroup, SelectField, StepTitle, inputClass } from "./FormBits";

/** Expectations: must-haves, house rules, home tasks and updates. All optional. */
const ExpectationsStep = ({
  formData,
  updateFormData,
}: {
  formData: ListingFormData;
  updateFormData: (d: Partial<ListingFormData>) => void;
}) => {
  const group = (
    label: string,
    options: typeof MUST_HAVES,
    key: "requirements" | "house_rules" | "home_care_tasks",
    otherKey: "requirements_other" | "house_rules_other" | "home_care_tasks_other",
    otherLabel: string,
  ) => (
    <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--nn-border)] bg-card p-4">
      <PillGroup label={label} options={options} values={formData[key]} onChange={(v) => updateFormData({ [key]: v })} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={otherKey} className="text-sm font-bold">
          {otherLabel}
        </label>
        <input id={otherKey} value={formData[otherKey]} onChange={(e) => updateFormData({ [otherKey]: e.target.value })} className={inputClass} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <StepTitle intro="All optional. Fewer must-haves means more Nomads can apply.">What you expect</StepTitle>
      {group("Must-haves for your Nomad", MUST_HAVES, "requirements", "requirements_other", "Anything else?")}
      {group("House rules", HOUSE_RULES, "house_rules", "house_rules_other", "Any other house rules?")}
      {group("Home tasks", HOME_TASKS, "home_care_tasks", "home_care_tasks_other", "Any other tasks?")}
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="updates">How often would you like updates?</FieldLabel>
        <SelectField
          id="updates"
          value={formData.communication_style}
          onChange={(v) => updateFormData({ communication_style: v })}
          options={UPDATES}
          placeholder="Choose one"
        />
      </div>
    </div>
  );
};

export default ExpectationsStep;
