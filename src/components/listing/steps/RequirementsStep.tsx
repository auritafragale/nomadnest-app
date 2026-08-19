import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListingFormData } from "@/hooks/useListingForm";
import { cn } from "@/lib/utils";

interface RequirementsStepProps {
  formData: ListingFormData;
  updateFormData: (data: Partial<ListingFormData>) => void;
}

const requirementsList = [
  "Experience with my pet type",
  "References from previous sits",
  "Verified ID",
  "Background check",
  "Non-smoker",
  "No other pets accompanying",
  "Valid driver's license",
  "First aid knowledge",
];

const houseRulesList = [
  "No smoking indoors",
  "No parties or events",
  "Pet not allowed on furniture",
  "Pet not allowed in bedroom",
  "Keep garden gate locked",
  "Specific feeding schedule",
  "No guests overnight",
];

const homeCareTasks = [
  "Water plants",
  "Collect mail",
  "Take out trash/recycling",
  "Light housekeeping",
  "Pool maintenance",
  "Garden care",
];

const communicationStyles = [
  { value: "daily", label: "Daily updates" },
  { value: "every_few_days", label: "Updates every few days" },
  { value: "weekly", label: "Weekly updates" },
  { value: "as_needed", label: "Only when needed" },
];

const RequirementsStep = ({ formData, updateFormData }: RequirementsStepProps) => {
  const toggleItem = (list: string[], item: string, field: keyof ListingFormData) => {
    const updated = list.includes(item)
      ? list.filter((i) => i !== item)
      : [...list, item];
    updateFormData({ [field]: updated });
  };

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground">
          Requirements & Preferences
        </h2>
        <p className="text-muted-foreground mt-2">
          Set expectations for your ideal nomad
        </p>
      </div>

      {/* Nomad Requirements */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Label className="text-base font-semibold">Nomad Requirements</Label>
          <HelpTooltip
            label="About requirements"
            content="Optional must-haves for your sit. Selecting fewer keeps your listing open to more nomads; selecting more narrows the pool."
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Select any must-have qualifications
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {requirementsList.map((req) => (
            <div
              key={req}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                formData.requirements.includes(req)
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => toggleItem(formData.requirements, req, "requirements")}
            >
              <Checkbox
                checked={formData.requirements.includes(req)}
                onCheckedChange={() => toggleItem(formData.requirements, req, "requirements")}
              />
              <span className="text-sm">{req}</span>
            </div>
          ))}
        </div>
        <Textarea
          placeholder="Any other requirements..."
          value={formData.requirements_other}
          onChange={(e) => updateFormData({ requirements_other: e.target.value })}
          rows={2}
        />
      </div>

      {/* House Rules */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Label className="text-base font-semibold">House Rules</Label>
          <HelpTooltip
            label="About house rules"
            content="Non-negotiable boundaries for your home (e.g. no smoking, no guests). Nomads must accept these to be confirmed."
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Important rules nomads should follow
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {houseRulesList.map((rule) => (
            <div
              key={rule}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                formData.house_rules.includes(rule)
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => toggleItem(formData.house_rules, rule, "house_rules")}
            >
              <Checkbox
                checked={formData.house_rules.includes(rule)}
                onCheckedChange={() => toggleItem(formData.house_rules, rule, "house_rules")}
              />
              <span className="text-sm">{rule}</span>
            </div>
          ))}
        </div>
        <Textarea
          placeholder="Any other house rules..."
          value={formData.house_rules_other}
          onChange={(e) => updateFormData({ house_rules_other: e.target.value })}
          rows={2}
        />
      </div>

      {/* Home Care Tasks */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Home Care Tasks</Label>
        <p className="text-sm text-muted-foreground">
          Additional tasks beyond pet care
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {homeCareTasks.map((task) => (
            <div
              key={task}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                formData.home_care_tasks.includes(task)
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => toggleItem(formData.home_care_tasks, task, "home_care_tasks")}
            >
              <Checkbox
                checked={formData.home_care_tasks.includes(task)}
                onCheckedChange={() => toggleItem(formData.home_care_tasks, task, "home_care_tasks")}
              />
              <span className="text-sm">{task}</span>
            </div>
          ))}
        </div>
        <Textarea
          placeholder="Any other home care tasks..."
          value={formData.home_care_tasks_other}
          onChange={(e) => updateFormData({ home_care_tasks_other: e.target.value })}
          rows={2}
        />
      </div>

      {/* Ideal Nomad */}
      <div className="space-y-2">
        <Label htmlFor="ideal-sitter" className="text-base font-semibold">
          Describe Your Ideal Nomad
        </Label>
        <Textarea
          id="ideal-sitter"
          placeholder="What kind of person would be perfect for this sit? What qualities matter most to you?"
          value={formData.ideal_sitter_description}
          onChange={(e) => updateFormData({ ideal_sitter_description: e.target.value })}
          rows={4}
        />
      </div>

      {/* Communication Style */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Preferred Communication</Label>
        <p className="text-sm text-muted-foreground">
          How often would you like updates during the sit?
        </p>
        <Select
          value={formData.communication_style}
          onValueChange={(value) => updateFormData({ communication_style: value })}
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select preference" />
          </SelectTrigger>
          <SelectContent>
            {communicationStyles.map((style) => (
              <SelectItem key={style.value} value={style.value}>
                {style.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default RequirementsStep;
