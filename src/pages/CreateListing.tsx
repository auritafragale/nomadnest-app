import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useMembership } from "@/hooks/useMembership";
import { useVerification } from "@/hooks/useVerification";
import { useListingAllowance } from "@/hooks/useListingAllowance";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { geocodeCityCountry } from "@/lib/geocode";
import { firstErrorStep, useListingForm, validateListing, STEP_NAMES, TOTAL_STEPS, type FormErrors } from "@/hooks/useListingForm";
import { useCreateListing } from "@/hooks/useEditListing";
import { useHideBottomNav } from "@/lib/bottomNav";
import ListingFormShell from "@/components/listing/form/ListingFormShell";
import ListingStates from "@/components/listing/form/ListingStates";
import BasicsStep from "@/components/listing/form/BasicsStep";
import PetsStep from "@/components/listing/form/PetsStep";
import ExpectationsStep from "@/components/listing/form/ExpectationsStep";
import HomeStep from "@/components/listing/form/HomeStep";
import { ListingDeclaration } from "@/components/listing/ListingDeclaration";
import { NN_PAGE, RoleTheme, nnButton, shortRange } from "@/components/nn/ui";
import { petLine } from "@/components/listing/ListingParts";
import { cn } from "@/lib/utils";

/** Create a listing (design: ListingFormPhone Create, ListingFormTablet, ListingStatesPhone). */
const CreateListing = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { hasAccess, loading: membershipLoading } = useMembership();
  const { data: verification, isLoading: verificationLoading } = useVerification();
  const { atLimit, isLoading: allowanceLoading } = useListingAllowance();
  const { data: mapsConfig } = useGoogleMapsKey();
  const form = useListingForm();
  const { formData, currentStep: step, setCurrentStep: setStep, updateFormData } = form;
  const create = useCreateListing();
  const [errors, setErrors] = useState<FormErrors>({});
  const [declaration, setDeclaration] = useState(false);
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
  const [published, setPublished] = useState<string | null>(null);
  useHideBottomNav(true);

  const onPhotoRemoved = (url: string) => setRemovedPhotos((r) => [...r, url]);

  const next = () => {
    const e = validateListing(formData, step);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast({ title: "A few things to finish", description: "Look for the notes in red.", variant: "destructive" });
      return;
    }
    setStep(Math.min(step + 1, TOTAL_STEPS));
  };

  const submit = async (status: "draft" | "published") => {
    const e = validateListing(formData);
    setErrors(e);
    const bad = firstErrorStep(e);
    if (bad) {
      setStep(bad);
      toast({ title: "A few things to finish", description: `Have a look at ${STEP_NAMES[bad - 1]}.`, variant: "destructive" });
      return;
    }
    if (status === "published" && !declaration) {
      toast({ title: "Please confirm this is your home", description: "Tick the confirmation above Publish listing.", variant: "destructive" });
      return;
    }
    // A place picked without coordinates: look it up with Google once.
    let data = formData;
    if ((!data.latitude || !data.longitude) && mapsConfig?.key && (data.city || data.country)) {
      const coords = await geocodeCityCountry(mapsConfig.key, data.city, data.country).catch(() => null);
      if (coords) data = { ...data, latitude: coords.latitude, longitude: coords.longitude };
    }
    try {
      const { listingId } = await create.mutateAsync({ formData: data, status, declarationAccepted: status === "published" && declaration, removedPhotos });
      if (status === "published") {
        setPublished(listingId);
        window.scrollTo({ top: 0 });
      } else {
        toast({ title: "Draft saved", description: "You can carry on any time from your dashboard." });
        navigate("/dashboard");
      }
    } catch (err) {
      toast({ title: "Couldn't save your listing", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    }
  };

  const gateLoading = membershipLoading || verificationLoading || allowanceLoading;
  const gate = !hasAccess("owner") ? "membership" : !verification?.id_verified ? "id" : atLimit ? "limit" : null;

  if (gateLoading) {
    return (
      <RoleTheme role="owner" className="flex min-h-screen flex-col">
        <Navbar wide />
        <main className={cn(NN_PAGE, "flex flex-col gap-4 pt-20 md:pt-24")}>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full rounded-[22px]" />
        </main>
      </RoleTheme>
    );
  }

  if (published) {
    const d = formData.sit_dates.find((x) => x.start_date && x.end_date);
    return (
      <RoleTheme role="owner" className="flex min-h-screen flex-col">
        <Navbar wide />
        <ListingStates
          state="live"
          listingId={published}
          preview={{
            title: formData.title,
            line: [formData.city, d ? shortRange(d.start_date, d.end_date) : null, formData.pets.length ? petLine(formData.pets) : null].filter(Boolean).join(" · "),
            photo: formData.photos[0],
          }}
        />
      </RoleTheme>
    );
  }

  if (gate) {
    return (
      <RoleTheme role="owner" className="flex min-h-screen flex-col">
        <Navbar wide />
        <ListingStates state={gate} />
      </RoleTheme>
    );
  }

  const last = step === TOTAL_STEPS;
  const footer = (
    <div className="flex items-center gap-2">
      {step > 1 && (
        <button type="button" onClick={() => setStep(step - 1)} className={nnButton("secondary", "h-12")}>
          Back
        </button>
      )}
      {last && (
        <button type="button" onClick={() => submit("draft")} disabled={create.isPending} className={nnButton("secondary", "h-12")}>
          Save draft
        </button>
      )}
      <button
        type="button"
        onClick={last ? () => submit("published") : next}
        disabled={create.isPending || (last && !declaration)}
        className={nnButton("primary", "h-12 flex-1 md:ml-auto md:flex-none md:px-8 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100")}
      >
        {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {last ? "Publish listing" : `Next: ${STEP_NAMES[step]}`}
      </button>
    </div>
  );

  return (
    <RoleTheme role="owner" className="flex min-h-screen flex-col">
      <Navbar wide />
      <ListingFormShell mode="create" step={step} onStep={setStep} formData={formData} footer={footer}>
        {step === 1 && (
          <BasicsStep
            formData={formData}
            updateFormData={updateFormData}
            addSitDate={form.addSitDate}
            updateSitDate={form.updateSitDate}
            onRemoveDate={(d) => form.removeSitDate(d.id)}
            errors={errors}
          />
        )}
        {step === 2 && (
          <PetsStep
            formData={formData}
            addPet={form.addPet}
            updatePet={form.updatePet}
            removePet={(id) => {
              setRemovedPhotos((r) => [...r, ...(formData.pets.find((p) => p.id === id)?.photos ?? [])]);
              form.removePet(id);
            }}
            onPhotoRemoved={onPhotoRemoved}
            errors={errors}
          />
        )}
        {step === 3 && <ExpectationsStep formData={formData} updateFormData={updateFormData} />}
        {step === 4 && (
          <>
            <HomeStep formData={formData} updateFormData={updateFormData} onPhotoRemoved={onPhotoRemoved} errors={errors} />
            <ListingDeclaration checked={declaration} onCheckedChange={setDeclaration} />
          </>
        )}
      </ListingFormShell>
    </RoleTheme>
  );
};

export default CreateListing;
