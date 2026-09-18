import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ListingFormData, SitDate } from "@/hooks/useListingForm";
import { cn } from "@/lib/utils";
import DatesStep from "@/components/listing/steps/DatesStep";

interface BasicInfoStepProps {
  formData: ListingFormData;
  updateFormData: (data: Partial<ListingFormData>) => void;
  addSitDate: () => void;
  updateSitDate: (id: string, data: Partial<SitDate>) => void;
  removeSitDate: (id: string) => void;
}

const idealNomadTypes = [
  "🛋️ Remote Workers (Fast Wi-Fi & Dedicated Desk)",
  "🎒 Sightseers (Great location, plenty of free time)",
  "🌿 Nature Lovers (Quiet, scenic, or rural)",
  "🏠 Homebodies (Pets need lots of companionship)",
];

const BasicInfoStep = ({
  formData,
  updateFormData,
  addSitDate,
  updateSitDate,
  removeSitDate,
}: BasicInfoStepProps) => {
  const toggleIdealNomadType = (type: string) => {
    const current = formData.ideal_nomad_types;
    const updated = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    updateFormData({ ideal_nomad_types: updated });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground">
          Let's start with the basics
        </h2>
        <p className="text-muted-foreground mt-2">
          Give your listing a catchy title
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title" className="text-base font-semibold">Listing Title *</Label>
          <p className="text-sm text-muted-foreground">
            Make it descriptive and inviting
          </p>
          <Input
            id="title"
            placeholder="e.g., Cozy apartment with two friendly cats in Barcelona"
            value={formData.title}
            onChange={(e) => updateFormData({ title: e.target.value })}
            className="text-lg"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">
            When do you need a Nomad?
          </Label>
          <p className="text-sm text-muted-foreground">
            Choose the dates you need your Nomad to arrive and leave.
          </p>
        </div>

        <DatesStep
          formData={formData}
          addSitDate={addSitDate}
          updateSitDate={updateSitDate}
          removeSitDate={removeSitDate}
          showHeading={false}
        />

        <div className="space-y-2">
          <Label className="text-base font-semibold">
            What kind of Nomad is this sit best suited for?
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {idealNomadTypes.map((type) => (
              <div
                key={type}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                  formData.ideal_nomad_types.includes(type)
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => toggleIdealNomadType(type)}
              >
                <Checkbox
                  checked={formData.ideal_nomad_types.includes(type)}
                  onCheckedChange={() => toggleIdealNomadType(type)}
                />
                <span className="text-sm">{type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BasicInfoStep;
