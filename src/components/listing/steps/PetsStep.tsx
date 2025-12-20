import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Dog, Cat, Bird, Fish, Rabbit } from "lucide-react";
import { Pet, ListingFormData } from "@/hooks/useListingForm";
import { cn } from "@/lib/utils";
import ImageUpload from "@/components/listing/ImageUpload";

interface PetsStepProps {
  formData: ListingFormData;
  addPet: () => void;
  updatePet: (id: string, data: Partial<Pet>) => void;
  removePet: (id: string) => void;
}

const petTypes = [
  { value: "dog", label: "Dog", icon: Dog },
  { value: "cat", label: "Cat", icon: Cat },
  { value: "bird", label: "Bird", icon: Bird },
  { value: "fish", label: "Fish", icon: Fish },
  { value: "rabbit", label: "Rabbit", icon: Rabbit },
  { value: "other", label: "Other", icon: null },
];

const PetsStep = ({ formData, addPet, updatePet, removePet }: PetsStepProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground">
          Tell us about your pets
        </h2>
        <p className="text-muted-foreground mt-2">
          Add all the furry (or not so furry) friends that need care
        </p>
      </div>

      <div className="space-y-6">
        {formData.pets.map((pet, index) => (
          <Card key={pet.id} className="relative">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Pet {index + 1}</CardTitle>
                {formData.pets.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removePet(pet.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Pet Type Selection */}
              <div className="space-y-2">
                <Label>Pet Type *</Label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {petTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => updatePet(pet.id, { type: type.value })}
                        className={cn(
                          "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all",
                          pet.type === type.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        {Icon && <Icon className="w-5 h-5" />}
                        <span className="text-xs font-medium">{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`pet-name-${pet.id}`}>Name *</Label>
                  <Input
                    id={`pet-name-${pet.id}`}
                    placeholder="Pet's name"
                    value={pet.name}
                    onChange={(e) => updatePet(pet.id, { name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`pet-age-${pet.id}`}>Age</Label>
                  <Input
                    id={`pet-age-${pet.id}`}
                    placeholder="e.g., 3 years old"
                    value={pet.age}
                    onChange={(e) => updatePet(pet.id, { age: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`pet-personality-${pet.id}`}>Personality</Label>
                <Textarea
                  id={`pet-personality-${pet.id}`}
                  placeholder="Describe their personality, quirks, and what makes them special..."
                  value={pet.personality}
                  onChange={(e) => updatePet(pet.id, { personality: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`pet-feeding-${pet.id}`}>Feeding Details</Label>
                <Textarea
                  id={`pet-feeding-${pet.id}`}
                  placeholder="Food type, portions, feeding schedule..."
                  value={pet.feeding_details}
                  onChange={(e) => updatePet(pet.id, { feeding_details: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`pet-routine-${pet.id}`}>Daily Routine</Label>
                <Textarea
                  id={`pet-routine-${pet.id}`}
                  placeholder="Typical daily schedule, nap times, play preferences..."
                  value={pet.daily_routine}
                  onChange={(e) => updatePet(pet.id, { daily_routine: e.target.value })}
                  rows={2}
                />
              </div>

              {(pet.type === "dog" || pet.type === "other") && (
                <div className="space-y-2">
                  <Label htmlFor={`pet-walks-${pet.id}`}>Walks & Exercise</Label>
                  <Textarea
                    id={`pet-walks-${pet.id}`}
                    placeholder="Walk frequency, duration, favorite routes..."
                    value={pet.walks_exercise}
                    onChange={(e) => updatePet(pet.id, { walks_exercise: e.target.value })}
                    rows={2}
                  />
                </div>
              )}

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <Label className="text-base">Requires Medication?</Label>
                  <p className="text-sm text-muted-foreground">
                    Does this pet need regular medication?
                  </p>
                </div>
                <Switch
                  checked={pet.has_medication}
                  onCheckedChange={(checked) => updatePet(pet.id, { has_medication: checked })}
                />
              </div>

              {pet.has_medication && (
                <div className="space-y-2">
                  <Label htmlFor={`pet-medication-${pet.id}`}>Medication Instructions *</Label>
                  <Textarea
                    id={`pet-medication-${pet.id}`}
                    placeholder="Medication name, dosage, frequency, and how to administer..."
                    value={pet.medication_instructions}
                    onChange={(e) => updatePet(pet.id, { medication_instructions: e.target.value })}
                    rows={3}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor={`pet-vet-${pet.id}`}>Vet Information</Label>
                <Textarea
                  id={`pet-vet-${pet.id}`}
                  placeholder="Vet clinic name, phone number, address..."
                  value={pet.vet_info}
                  onChange={(e) => updatePet(pet.id, { vet_info: e.target.value })}
                  rows={2}
                />
              </div>

              {/* Pet Photos */}
              <ImageUpload
                images={pet.photos}
                onImagesChange={(photos) => updatePet(pet.id, { photos })}
                maxImages={4}
                folder={`pets/${pet.id}`}
                label="Pet Photos"
              />
            </CardContent>
          </Card>
        ))}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={addPet}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Another Pet
        </Button>
      </div>
    </div>
  );
};

export default PetsStep;
