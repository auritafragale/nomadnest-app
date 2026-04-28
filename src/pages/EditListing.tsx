import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Loader2, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/layout/Navbar";
import StepIndicator from "@/components/listing/StepIndicator";
import BasicInfoStep from "@/components/listing/steps/BasicInfoStep";
import PetsStep from "@/components/listing/steps/PetsStep";
import DatesStep from "@/components/listing/steps/DatesStep";
import HomeInfoStep from "@/components/listing/steps/HomeInfoStep";
import RequirementsStep from "@/components/listing/steps/RequirementsStep";
import { ListingFormData, Pet, SitDate } from "@/hooks/useListingForm";
import { 
  useListingDetails, 
  useUpdateListing, 
  convertToFormData 
} from "@/hooks/useEditListing";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

const steps = [
  { number: 1, title: "Basics" },
  { number: 2, title: "Pets" },
  { number: 3, title: "Dates" },
  { number: 4, title: "Home" },
  { number: 5, title: "Requirements" },
];

const initialPet: Pet = {
  id: crypto.randomUUID(),
  name: "",
  type: "dog",
  age: "",
  personality: "",
  feeding_details: "",
  daily_routine: "",
  walks_exercise: "",
  has_medication: false,
  medication_instructions: "",
  vet_info: "",
  photos: [],
};

const initialSitDate: SitDate = {
  id: crypto.randomUUID(),
  start_date: "",
  end_date: "",
  flexibility: "fixed",
  handover_preference: "flexible",
};

const EditListing = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { data: listing, isLoading, error } = useListingDetails(id);
  const updateListing = useUpdateListing();
  
  const [formData, setFormData] = useState<ListingFormData | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [originalPetIds, setOriginalPetIds] = useState<string[]>([]);
  const [originalSitDateIds, setOriginalSitDateIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const totalSteps = 5;

  // Initialize form data from fetched listing
  useEffect(() => {
    if (listing) {
      const converted = convertToFormData(listing);
      setFormData(converted);
      setOriginalPetIds(listing.pets.map((p) => p.id));
      setOriginalSitDateIds(listing.sit_dates.map((d) => d.id));
    }
  }, [listing]);

  const updateFormData = (data: Partial<ListingFormData>) => {
    setFormData((prev) => (prev ? { ...prev, ...data } : null));
  };

  const addPet = () => {
    setFormData((prev) =>
      prev
        ? {
            ...prev,
            pets: [...prev.pets, { ...initialPet, id: crypto.randomUUID() }],
          }
        : null
    );
  };

  const updatePet = (petId: string, data: Partial<Pet>) => {
    setFormData((prev) =>
      prev
        ? {
            ...prev,
            pets: prev.pets.map((pet) =>
              pet.id === petId ? { ...pet, ...data } : pet
            ),
          }
        : null
    );
  };

  const removePet = (petId: string) => {
    setFormData((prev) =>
      prev
        ? {
            ...prev,
            pets: prev.pets.filter((pet) => pet.id !== petId),
          }
        : null
    );
  };

  const addSitDate = () => {
    setFormData((prev) =>
      prev
        ? {
            ...prev,
            sit_dates: [
              ...prev.sit_dates,
              { ...initialSitDate, id: crypto.randomUUID() },
            ],
          }
        : null
    );
  };

  const updateSitDate = (dateId: string, data: Partial<SitDate>) => {
    setFormData((prev) =>
      prev
        ? {
            ...prev,
            sit_dates: prev.sit_dates.map((date) =>
              date.id === dateId ? { ...date, ...data } : date
            ),
          }
        : null
    );
  };

  const removeSitDate = (dateId: string) => {
    setFormData((prev) =>
      prev
        ? {
            ...prev,
            sit_dates: prev.sit_dates.filter((date) => date.id !== dateId),
          }
        : null
    );
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const goToStep = (step: number) => {
    if (step >= 1 && step <= totalSteps) {
      setCurrentStep(step);
    }
  };

  const validateCurrentStep = (): boolean => {
    if (!formData) return false;

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
        if (!formData.city.trim() || !formData.country.trim()) {
          toast({
            title: "Location required",
            description: "Please add your city and country",
            variant: "destructive",
          });
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      nextStep();
    }
  };

  const handleSubmit = async (status: "draft" | "published" | "paused") => {
    if (!user || !formData || !id) return;
    if (!validateCurrentStep()) return;

    updateListing.mutate(
      {
        listingId: id,
        formData,
        status,
        originalPetIds,
        originalSitDateIds,
      },
      {
        onSuccess: () => {
          navigate("/dashboard");
        },
      }
    );
  };

  const handleDelete = async () => {
    if (!id) return;

    setIsDeleting(true);
    try {
      // Delete related records first
      await supabase.from("pets").delete().eq("listing_id", id);
      await supabase.from("sit_dates").delete().eq("listing_id", id);
      
      const { error } = await supabase.from("listings").delete().eq("id", id);
      if (error) throw error;

      toast({
        title: "Listing deleted",
        description: "Your listing has been removed",
      });
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Error deleting listing",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const renderStep = () => {
    if (!formData) return null;

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 pb-12">
          <div className="container mx-auto px-4 max-w-3xl">
            <Skeleton className="h-10 w-48 mb-4" />
            <Skeleton className="h-6 w-64 mb-8" />
            <Skeleton className="h-12 w-full mb-8" />
            <Skeleton className="h-96 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 pb-12">
          <div className="container mx-auto px-4 max-w-3xl text-center">
            <h1 className="text-2xl font-bold text-destructive mb-4">
              Error loading listing
            </h1>
            <p className="text-muted-foreground mb-6">{error.message}</p>
            <Button onClick={() => navigate("/dashboard")}>
              Back to Dashboard
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (!formData) {
    return null;
  }

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
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                  Edit Listing
                </h1>
                <p className="text-muted-foreground mt-2">
                  Update your listing details
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete
                      your listing, all associated pets, dates, and applications.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Delete Listing
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

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
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            <div className="flex gap-3">
              {currentStep === totalSteps ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleSubmit("draft")}
                    disabled={updateListing.isPending}
                  >
                    {updateListing.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save as Draft
                  </Button>
                  {listing?.status === "published" ? (
                    <Button
                      onClick={() => handleSubmit("published")}
                      disabled={updateListing.isPending}
                    >
                      {updateListing.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Save Changes
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleSubmit("published")}
                      disabled={updateListing.isPending}
                    >
                      {updateListing.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Publish Listing
                    </Button>
                  )}
                </>
              ) : (
                <Button onClick={handleNext}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default EditListing;
