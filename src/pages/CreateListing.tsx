import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/layout/Navbar";
import StepIndicator from "@/components/listing/StepIndicator";
import BasicInfoStep from "@/components/listing/steps/BasicInfoStep";
import PetsStep from "@/components/listing/steps/PetsStep";
import DatesStep from "@/components/listing/steps/DatesStep";
import HomeInfoStep from "@/components/listing/steps/HomeInfoStep";
import RequirementsStep from "@/components/listing/steps/RequirementsStep";
import { useListingForm } from "@/hooks/useListingForm";
import { useMembership } from "@/hooks/useMembership";
import MembershipGate from "@/components/membership/MembershipGate";
import { useVerification } from "@/hooks/useVerification";
import { ShieldCheck } from "lucide-react";

const steps = [
  { number: 1, title: "Basics" },
  { number: 2, title: "Pets" },
  { number: 3, title: "Dates" },
  { number: 4, title: "Home" },
  { number: 5, title: "Requirements" },
];

const CreateListing = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { hasAccess, loading: membershipLoading } = useMembership();
  const { data: verificationData, isLoading: verificationLoading } = useVerification();

  const {
    formData,
    currentStep,
    totalSteps,
    updateFormData,
    addPet,
    updatePet,
    removePet,
    addSitDate,
    updateSitDate,
    removeSitDate,
    nextStep,
    prevStep,
    goToStep,
  } = useListingForm();

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 1:
        if (!formData.title.trim()) {
          toast({
            title: "Title required",
            description: "Please add a title for your listing",
            variant: "destructive",
          });
          return false;
        }
        return true;
      case 2:
        const validPets = formData.pets.every(
          (pet) => pet.name.trim() && pet.type
        );
        if (!validPets) {
          toast({
            title: "Pet details required",
            description: "Please add a name for each pet",
            variant: "destructive",
          });
          return false;
        }
        return true;
      case 3:
        const validDates = formData.sit_dates.every(
          (date) => date.start_date && date.end_date
        );
        if (!validDates) {
          toast({
            title: "Dates required",
            description: "Please select start and end dates",
            variant: "destructive",
          });
          return false;
        }
        return true;
      case 4:
        // Location is resolved in handleNext before this runs, so if it's
        // still empty the member genuinely has no location typed.
        if (!formData.city.trim() && !formData.country.trim()) {
          toast({
            title: "Location required",
            description:
              "Please search and pick a city, or type one like 'Dubai, United Arab Emirates'.",
            variant: "destructive",
          });
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  // Resolve a typed-but-not-selected location into city/country/coords before
  // validating, so a member who just types "Dubai" is never trapped.
  // Returns true if the location is resolved (or already was), so the caller
  // can skip the now-stale validation check.
  const resolveLocationIfNeeded = async (): Promise<boolean> => {
    if (currentStep !== 4) return true;
    const typed = (formData.locationQuery || "").trim();
    const hasResolved = formData.city.trim() || formData.country.trim();
    if (hasResolved) return true;
    if (!typed) return false;
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(typed)}&format=json&limit=1`,
      );
      const results = await geoRes.json();
      if (results?.[0]) {
        const parts = typed.split(",").map((s: string) => s.trim()).filter(Boolean);
        const city = parts.length > 1 ? parts[0] : typed;
        const country = parts.length > 1 ? parts.slice(1).join(", ") : "";
        updateFormData({
          city,
          country: country || formData.country || "",
          latitude: parseFloat(results[0].lat),
          longitude: parseFloat(results[0].lon),
        });
        return true;
      }
    } catch (e) {
      console.warn("Location resolution failed", e);
    }
    return false;
  };

  const handleNext = async () => {
    if (currentStep === 4) {
      const resolved = await resolveLocationIfNeeded();
      if (resolved) {
        // State will update on next render; advance immediately.
        nextStep();
        return;
      }
    }
    if (validateCurrentStep()) {
      nextStep();
    }
  };

  const handleSubmit = async (status: "draft" | "published") => {
    if (!user) {
      toast({
        title: "Not authenticated",
        description: "Please sign in to create a listing",
        variant: "destructive",
      });
      return;
    }

    if (!validateCurrentStep()) return;

    setIsSubmitting(true);

    try {
      // Geocode coordinates from city/country if not already set
      let latitude = formData.latitude;
      let longitude = formData.longitude;
      if (!latitude || !longitude) {
        try {
          const geocodeQuery = [formData.city, formData.country].filter(Boolean).join(", ");
          const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(geocodeQuery)}&format=json&limit=1`);
          const results = await res.json();
          if (results?.[0]) {
            latitude = parseFloat(results[0].lat);
            longitude = parseFloat(results[0].lon);
          }
        } catch (e) {
          console.warn("Geocoding failed, listing will be saved without coordinates");
        }
      }

      // Create the listing
      const { data: listing, error: listingError } = await supabase
        .from("listings")
        .insert({
          owner_user_id: user.id,
          title: formData.title,
          description: formData.description,
          status,
          home_type: formData.home_type || null,
          city: formData.city,
          country: formData.country,
          area: formData.area || null,
          address_private: formData.address_private || null,
          latitude,
          longitude,
          wifi_quality: formData.wifi_quality || null,
          sleeping_arrangement: formData.sleeping_arrangement || null,
          amenities: formData.amenities,
          photos: formData.photos,
          requirements: formData.requirements,
          requirements_other: formData.requirements_other || null,
          house_rules: formData.house_rules,
          house_rules_other: formData.house_rules_other || null,
          home_care_tasks: formData.home_care_tasks,
          home_care_tasks_other: formData.home_care_tasks_other || null,
          ideal_sitter_description: formData.ideal_sitter_description || null,
          communication_style: formData.communication_style || null,
        })
        .select()
        .single();

      if (listingError) throw listingError;

      // Create pets
      const petsToInsert = formData.pets.map((pet) => ({
        listing_id: listing.id,
        name: pet.name,
        type: pet.type,
        age: pet.age || null,
        personality: pet.personality || null,
        feeding_details: pet.feeding_details || null,
        daily_routine: pet.daily_routine || null,
        walks_exercise: pet.walks_exercise || null,
        has_medication: pet.has_medication,
        medication_instructions: pet.medication_instructions || null,
        vet_info: pet.vet_info || null,
        photos: pet.photos,
      }));

      const { error: petsError } = await supabase
        .from("pets")
        .insert(petsToInsert);

      if (petsError) throw petsError;

      // Create sit dates
      const datesToInsert = formData.sit_dates.map((date) => ({
        listing_id: listing.id,
        start_date: date.start_date,
        end_date: date.end_date,
        flexibility: date.flexibility || null,
        handover_preference: date.handover_preference || null,
      }));

      const { error: datesError } = await supabase
        .from("sit_dates")
        .insert(datesToInsert);

      if (datesError) throw datesError;

      toast({
        title: status === "published" ? "Listing published!" : "Draft saved!",
        description:
          status === "published"
            ? "Your listing is now visible to nomads"
            : "You can continue editing later",
      });

      navigate("/dashboard");
    } catch (error: any) {
      console.error("Error creating listing:", error);
      toast({
        title: "Error creating listing",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <BasicInfoStep formData={formData} updateFormData={updateFormData} />
        );
      case 2:
        return (
          <PetsStep
            formData={formData}
            addPet={addPet}
            updatePet={updatePet}
            removePet={removePet}
          />
        );
      case 3:
        return (
          <DatesStep
            formData={formData}
            addSitDate={addSitDate}
            updateSitDate={updateSitDate}
            removeSitDate={removeSitDate}
          />
        );
      case 4:
        return (
          <HomeInfoStep formData={formData} updateFormData={updateFormData} />
        );
      case 5:
        return (
          <RequirementsStep
            formData={formData}
            updateFormData={updateFormData}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-20 pb-12">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Header */}
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard")}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
              Create a Listing
            </h1>
            <p className="text-muted-foreground mt-2">
              Find the perfect nomad for your furry friends
            </p>
          </div>

          <MembershipGate type="owner" hasAccess={!membershipLoading && hasAccess("owner")}>
          {!verificationLoading && !verificationData?.id_verified && (
            <Card className="border-2 border-dashed border-muted-foreground/30 mb-6">
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <ShieldCheck className="w-10 h-10 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Identity Verification Required</h3>
                <p className="text-muted-foreground mb-6 max-w-sm">
                  You need to verify your identity before creating a listing. It only takes 5 minutes.
                </p>
                <Button onClick={() => navigate("/verify-identity")}>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Verify My Identity
                </Button>
              </CardContent>
            </Card>
          )}
          {!verificationLoading && verificationData?.id_verified && (<>
          {/* Step Indicator */}
          <div className="mb-8">
            <StepIndicator
              steps={steps}
              currentStep={currentStep}
              onStepClick={goToStep}
            />
          </div>

          {/* Form Content */}
          <Card className="mb-6">
            <CardContent className="pt-6">{renderStep()}</CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              aria-label="Previous step"
              className="px-3 sm:px-4 shrink-0"
            >
              <ArrowLeft className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            <div className="flex gap-3">
              {currentStep === totalSteps ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleSubmit("draft")}
                    disabled={isSubmitting}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Draft
                  </Button>
                  <Button
                    onClick={() => handleSubmit("published")}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Publish Listing
                  </Button>
                </>
              ) : (
                <Button onClick={handleNext}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
          </>)}
          </MembershipGate>
        </div>
      </main>
    </div>
  );
};

export default CreateListing;
