import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
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
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { firstErrorStep, useListingForm, validateListing, STEP_NAMES, TOTAL_STEPS, type FormErrors, type SitDate } from "@/hooks/useListingForm";
import { convertToFormData, useListingDetails, useRemoveListingDates, useUpdateListing } from "@/hooks/useEditListing";
import { useDeleteListing, useUpdateListingStatus } from "@/hooks/useOwnerListingActions";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { geocodeCityCountry } from "@/lib/geocode";
import { useHideBottomNav } from "@/lib/bottomNav";
import ListingFormShell from "@/components/listing/form/ListingFormShell";
import BasicsStep from "@/components/listing/form/BasicsStep";
import PetsStep from "@/components/listing/form/PetsStep";
import ExpectationsStep from "@/components/listing/form/ExpectationsStep";
import HomeStep from "@/components/listing/form/HomeStep";
import { ListingDeclaration } from "@/components/listing/ListingDeclaration";
import { NN_PAGE, RoleTheme, nnButton, shortRange } from "@/components/nn/ui";
import { cn } from "@/lib/utils";

const STEP_PARAM: Record<string, number> = { basics: 1, pets: 2, expectations: 3, home: 4 };

/** Edit a listing (design: ListingFormPhone Edit, ListingFormDesktop). */
const EditListing = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const { data: listing, isLoading, error, refetch } = useListingDetails(id);
  const update = useUpdateListing();
  const removeDates = useRemoveListingDates();
  const setStatus = useUpdateListingStatus();
  const deleteListing = useDeleteListing();
  const { data: mapsConfig } = useGoogleMapsKey();
  const form = useListingForm();
  const { formData, setFormData, currentStep: step, setCurrentStep: setStep, updateFormData } = form;
  const [ready, setReady] = useState(false);
  const [status, setStatusLocal] = useState("draft");
  const [originalPetIds, setOriginalPetIds] = useState<string[]>([]);
  const [originalDateIds, setOriginalDateIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [declaration, setDeclaration] = useState(false);
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
  const [askRemove, setAskRemove] = useState<SitDate | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const focused = useRef(false);
  useHideBottomNav(true);

  // Load once into the form. ?step=pets|home opens that step (from the Pet
  // Parent profile); ?focus=dates adds a date range and scrolls to it.
  useEffect(() => {
    if (!listing || ready) return;
    setFormData(convertToFormData(listing));
    setStatusLocal(listing.status);
    setOriginalPetIds(listing.pets.map((p) => p.id));
    setOriginalDateIds(listing.sit_dates.map((d) => d.id));
    const s = STEP_PARAM[params.get("step") ?? ""];
    if (s) setStep(s);
    setReady(true);
  }, [listing, ready, params, setFormData, setStep]);

  useEffect(() => {
    if (!ready || focused.current || params.get("focus") !== "dates") return;
    focused.current = true;
    setStep(1);
    form.addSitDate();
    window.setTimeout(() => document.getElementById("listing-dates")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, params]);

  const onPhotoRemoved = (url: string) => setRemovedPhotos((r) => [...r, url]);
  const isDraft = status === "draft";

  const save = async (publish = false) => {
    if (!id) return;
    const e = validateListing(formData);
    setErrors(e);
    const bad = firstErrorStep(e);
    if (bad) {
      setStep(bad);
      toast({ title: "A few things to finish", description: `Have a look at ${STEP_NAMES[bad - 1]}.`, variant: "destructive" });
      return;
    }
    if (publish && !declaration) {
      toast({ title: "Please confirm this is your home", description: "Tick the confirmation above Publish listing.", variant: "destructive" });
      return;
    }
    let data = formData;
    if ((!data.latitude || !data.longitude) && mapsConfig?.key && (data.city || data.country)) {
      const coords = await geocodeCityCountry(mapsConfig.key, data.city, data.country).catch(() => null);
      if (coords) data = { ...data, latitude: coords.latitude, longitude: coords.longitude };
    }
    try {
      await update.mutateAsync({
        listingId: id,
        formData: data,
        // Saving keeps the listing's status; only Publish changes it.
        status: publish ? "published" : status,
        originalPetIds,
        originalSitDateIds: originalDateIds,
        declarationAccepted: publish && declaration,
        removedPhotos,
      });
      setRemovedPhotos([]);
      toast({ title: publish ? "Your listing is live" : "Saved", description: publish ? undefined : "Your changes are saved." });
      navigate("/dashboard");
    } catch (err) {
      toast({ title: "Couldn't save your changes", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    }
  };

  // Removing a range: with applicants, ask first and tell them now.
  const onRemoveDate = (d: SitDate) => {
    const saved = originalDateIds.includes(d.id);
    if (saved && (listing?.applicant_counts[d.id] ?? 0) > 0) {
      setAskRemove(d);
      return;
    }
    form.removeSitDate(d.id);
  };
  const confirmRemove = async () => {
    if (!askRemove) return;
    try {
      const { notified } = await removeDates.mutateAsync(askRemove.id);
      form.removeSitDate(askRemove.id);
      setOriginalDateIds((ids) => ids.filter((x) => x !== askRemove.id));
      toast({ title: "Dates removed", description: `We told ${notified ?? 0} ${notified === 1 ? "Nomad" : "Nomads"} kindly.` });
    } catch (err) {
      toast({ title: "Couldn't remove those dates", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    } finally {
      setAskRemove(null);
    }
  };

  const changeStatus = (next: "published" | "paused" | "draft", done: string) =>
    id &&
    setStatus.mutate(
      { listingId: id, status: next },
      {
        onSuccess: () => {
          setStatusLocal(next);
          toast({ title: done });
        },
        onError: (err) => toast({ title: "That didn't work", description: (err as Error).message, variant: "destructive" }),
      },
    );

  if (isLoading || (listing && !ready)) {
    return (
      <RoleTheme role="owner" className="flex min-h-screen flex-col">
        <Navbar wide />
        <main className={cn(NN_PAGE, "flex flex-col gap-4 pt-20 md:pt-24")}>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-[22px]" />
        </main>
      </RoleTheme>
    );
  }

  if (error || !listing) {
    return (
      <RoleTheme role="owner" className="flex min-h-screen flex-col">
        <Navbar wide />
        <main className={cn(NN_PAGE, "flex flex-1 flex-col items-center pt-24")}>
          <div role="alert" className="flex max-w-md flex-col items-center gap-3 rounded-[22px] border border-border p-8 text-center">
            <p className="text-[17px] font-bold">We couldn't load your listing</p>
            <p className="text-[15px] text-muted-foreground">{error instanceof Error ? error.message : "Check your connection and try again."}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => refetch()} className={nnButton("primary")}>
                Try again
              </button>
              <Link to="/dashboard" className={nnButton("secondary")}>
                Back to dashboard
              </Link>
            </div>
          </div>
        </main>
      </RoleTheme>
    );
  }

  const last = step === TOTAL_STEPS;
  const busy = update.isPending;
  const footer = (
    <div className="flex items-center gap-2">
      {step > 1 && (
        <button type="button" onClick={() => setStep(step - 1)} className={nnButton("secondary", "h-12")}>
          Back
        </button>
      )}
      {!last && (
        <button type="button" onClick={() => setStep(step + 1)} className={nnButton("secondary", "h-12")}>
          Next<span className="hidden sm:inline">: {STEP_NAMES[step]}</span>
        </button>
      )}
      {isDraft && last ? (
        <>
          <button type="button" onClick={() => save(false)} disabled={busy} className={nnButton("secondary", "h-12")}>
            Save draft
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={busy || !declaration}
            className={nnButton("primary", "h-12 flex-1 md:ml-auto md:flex-none md:px-8 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100")}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Publish listing
          </button>
        </>
      ) : (
        <button type="button" onClick={() => save(false)} disabled={busy} className={nnButton("primary", "h-12 flex-1 md:ml-auto md:flex-none md:px-8")}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Save changes
        </button>
      )}
    </div>
  );

  return (
    <RoleTheme role="owner" className="flex min-h-screen flex-col">
      <Navbar wide />
      <ListingFormShell
        mode="edit"
        step={step}
        onStep={setStep}
        formData={formData}
        footer={footer}
        menu={{
          status,
          listingId: listing.id,
          busy: setStatus.isPending,
          onPause: () => changeStatus("paused", "Listing paused. Nomads can't apply until you make it live again."),
          onResume: () => changeStatus("published", "Your listing is live again."),
          onTakeOffline: () => changeStatus("draft", "Listing taken offline. It's saved as a draft."),
          onDelete: () => setAskDelete(true),
        }}
      >
        {step === 1 && (
          <BasicsStep
            formData={formData}
            updateFormData={updateFormData}
            addSitDate={form.addSitDate}
            updateSitDate={form.updateSitDate}
            onRemoveDate={onRemoveDate}
            applicantCounts={listing.applicant_counts}
            bookedNames={listing.booked_names}
            errors={errors}
          />
        )}
        {step === 2 && (
          <PetsStep
            formData={formData}
            addPet={form.addPet}
            updatePet={form.updatePet}
            removePet={(petId) => {
              setRemovedPhotos((r) => [...r, ...(formData.pets.find((p) => p.id === petId)?.photos ?? [])]);
              form.removePet(petId);
            }}
            onPhotoRemoved={onPhotoRemoved}
            errors={errors}
          />
        )}
        {step === 3 && <ExpectationsStep formData={formData} updateFormData={updateFormData} />}
        {step === 4 && (
          <>
            <HomeStep formData={formData} updateFormData={updateFormData} onPhotoRemoved={onPhotoRemoved} errors={errors} />
            {isDraft && <ListingDeclaration checked={declaration} onCheckedChange={setDeclaration} />}
          </>
        )}
      </ListingFormShell>

      <AlertDialog open={!!askRemove} onOpenChange={(o) => !o && setAskRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {askRemove ? shortRange(askRemove.start_date, askRemove.end_date) : "these dates"}?</AlertDialogTitle>
            <AlertDialogDescription className="text-[15px]">
              {(() => {
                const n = askRemove ? listing.applicant_counts[askRemove.id] ?? 0 : 0;
                return `${n} ${n === 1 ? "Nomad" : "Nomads"} applied for these dates. If you remove them, we'll tell each one kindly and their applications will close.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Keep these dates</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} disabled={removeDates.isPending} className="min-h-11">
              Remove dates and tell them
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={askDelete} onOpenChange={setAskDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
            <AlertDialogDescription className="text-[15px]">
              This can't be undone. Your listing, its pets, dates and applications are removed for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Keep my listing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => id && deleteListing.mutate(id, { onSuccess: () => navigate("/dashboard") })}
              disabled={deleteListing.isPending}
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteListing.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Delete listing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RoleTheme>
  );
};

export default EditListing;
