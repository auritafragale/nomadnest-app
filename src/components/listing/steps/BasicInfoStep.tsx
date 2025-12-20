import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ListingFormData } from "@/hooks/useListingForm";

interface BasicInfoStepProps {
  formData: ListingFormData;
  updateFormData: (data: Partial<ListingFormData>) => void;
}

const BasicInfoStep = ({ formData, updateFormData }: BasicInfoStepProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground">
          Let's start with the basics
        </h2>
        <p className="text-muted-foreground mt-2">
          Give your listing a catchy title and description
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Listing Title *</Label>
          <Input
            id="title"
            placeholder="e.g., Cozy apartment with two friendly cats in Barcelona"
            value={formData.title}
            onChange={(e) => updateFormData({ title: e.target.value })}
            className="text-lg"
          />
          <p className="text-sm text-muted-foreground">
            Make it descriptive and inviting
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            placeholder="Tell sitters about your home, your pets, and what makes this sit special..."
            value={formData.description}
            onChange={(e) => updateFormData({ description: e.target.value })}
            rows={6}
            className="resize-none"
          />
          <p className="text-sm text-muted-foreground">
            Include details about your neighborhood, nearby amenities, and what sitters can expect
          </p>
        </div>
      </div>
    </div>
  );
};

export default BasicInfoStep;
