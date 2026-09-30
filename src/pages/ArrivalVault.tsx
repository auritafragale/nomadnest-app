import { useRef, useState } from "react";
import { useParams, Navigate, Link, useLocation } from "react-router-dom";
import { Camera, Check, ChevronDown, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { BackButton } from "@/components/layout/BackButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { NN_MAIN, RoleTheme, SectionCard, SerifTitle, nnButton } from "@/components/nn/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSits } from "@/hooks/useSits";
import {
  ArrivalPhotoEvidenceError,
  useAddArrivalVaultPhotos,
  useArrivalVaultPhotos,
  useDeleteArrivalPhoto,
  type ArrivalVaultPhoto,
} from "@/hooks/useArrivalVault";
import { cn } from "@/lib/utils";

const CHECKLIST = [
  { id: "indoor-cameras", label: "Indoor cameras", hint: "Any camera inside, even if switched off or not in the listing" },
  { id: "outdoor-cameras", label: "Outdoor cameras", hint: "Doorbell, garden, driveway or entrance cameras" },
  { id: "front-door", label: "Front door and lock" },
  { id: "living-room", label: "Living room and sofa" },
  { id: "kitchen", label: "Kitchen, hob and fridge" },
  { id: "bathroom", label: "Bathroom" },
  { id: "pet-supplies", label: "Pet food, meds and supplies" },
  { id: "marked", label: "Anything already marked or broken" },
] as const;

/** Ticks are kept on this device only (per sit); nothing is stored online. */
const useChecklist = (sitId: string | undefined) => {
  const key = `nomadnest-arrival-checklist:${sitId}`;
  const [done, setDone] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const toggle = (id: string) =>
    setDone((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Private mode: ticks last for this visit only.
      }
      return next;
    });
  return { done, toggle };
};

const when = (photo: ArrivalVaultPhoto) => {
  const d = new Date(photo.taken_at ?? photo.created_at);
  const text = d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return photo.taken_at ? `Taken ${text}` : `Added ${text}`;
};

/**
 * Arrival Check-In (design: ArrivalPhone, ArrivalTablet, ArrivalDesktop).
 * The Nomad's private photos of the home as they found it. Photos are
 * re-encoded on the device before upload, so no location or other metadata
 * is stored; the date taken is read first and kept.
 */
const ArrivalVault = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  // Return to where the Nomad came from (the sit card passes it). Without it
  // (a notification or push tap), go to the sit.
  const from = (location.state as { from?: string } | null)?.from;
  const backTo = from && from.startsWith("/") && !from.startsWith("//") ? from : id ? `/sits/${id}` : "/dashboard?mode=sitter";
  const { user, loading: authLoading } = useAuth();
  const { data: sits, isLoading: sitsLoading } = useSits();
  const { data: photos = [], isLoading: photosLoading } = useArrivalVaultPhotos(id);
  const addPhotos = useAddArrivalVaultPhotos(id);
  const deletePhoto = useDeleteArrivalPhoto(id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [viewing, setViewing] = useState<ArrivalVaultPhoto | null>(null);
  const [deleting, setDeleting] = useState<ArrivalVaultPhoto | null>(null);
  const checklist = useChecklist(id);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  const sit = sits?.find((s) => s.id === id);
  const isSitter = !!user && sit?.sitter_user_id === user.id;
  const owner = sit?.owner_profile?.first_name || "The Pet Parent";

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      await addPhotos.mutateAsync(Array.from(files));
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const photo = deleting;
    setDeleting(null);
    deletePhoto.mutate(
      { id: photo.id, path: photo.path },
      {
        onSuccess: () => toast.success("Photo deleted"),
        onError: (err) =>
          err instanceof ArrivalPhotoEvidenceError ? toast.info(err.message, { duration: 8000 }) : toast.error(err.message),
      },
    );
  };

  return (
    <RoleTheme role="sitter" className="flex min-h-screen flex-col">
      <Navbar wide />
      <main className={NN_MAIN}>
        <div className="flex flex-col gap-2">
          <BackButton fallback={backTo} className="h-11 self-start" />
          <SerifTitle as="h1">Arrival Check-In</SerifTitle>
          {sit?.listing?.title && <p className="text-[15px] text-muted-foreground">{sit.listing.title}</p>}
        </div>

        {sitsLoading && !sit ? (
          <Skeleton className="h-64 w-full rounded-[24px]" />
        ) : !sit ? (
          <SectionCard className="p-8 text-center text-muted-foreground">This sit could not be found.</SectionCard>
        ) : !isSitter ? (
          <SectionCard className="p-8 text-center text-muted-foreground">Only the Nomad on this sit can add Arrival Check-In photos.</SectionCard>
        ) : (
          <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-7">
            <div className="flex min-w-0 flex-col gap-[18px] lg:gap-4">
              <p className="flex items-start gap-3 rounded-[20px] bg-[var(--nn-ok-bg)] px-4 py-3.5 text-[15px] leading-snug">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--nn-ok-text)]" aria-hidden="true" />
                <span>
                  <strong>Only you can see these photos.</strong> {owner} is never told. They're only used if you ever need to
                  report a problem, like a camera that wasn't in the listing, and only when you choose to attach one to a private
                  flag in your review.
                </span>
              </p>

              <SectionCard label="What to photograph" className="overflow-hidden">
                <button
                  type="button"
                  aria-expanded={listOpen}
                  aria-controls="arrival-checklist"
                  onClick={() => setListOpen((v) => !v)}
                  className="flex min-h-[56px] w-full items-center justify-between gap-3 px-[18px] py-3 text-left"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[16px] font-bold">What to photograph</span>
                    <span className="text-[13px] text-muted-foreground">
                      {checklist.done.filter((d) => CHECKLIST.some((c) => c.id === d)).length} of {CHECKLIST.length} done
                    </span>
                  </span>
                  <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", listOpen && "rotate-180")} aria-hidden="true" />
                </button>
                {listOpen && (
                  <div id="arrival-checklist" className="flex flex-col border-t border-[var(--nn-line)] px-[18px] py-1">
                    {CHECKLIST.map((c, i) => {
                      const on = checklist.done.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => checklist.toggle(c.id)}
                          className={cn("flex min-h-[52px] items-start gap-3 py-3 text-left", i > 0 && "border-t border-[var(--nn-line)]")}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
                              on ? "border-primary bg-primary text-primary-foreground" : "border-[var(--nn-border)]",
                            )}
                          >
                            {on && <Check className="h-4 w-4" aria-hidden="true" />}
                          </span>
                          <span className="flex flex-col gap-0.5">
                            <span className={cn("text-[15px] font-semibold", on && "text-muted-foreground line-through")}>{c.label}</span>
                            {"hint" in c && <span className="text-[13px] text-muted-foreground">{c.hint}</span>}
                          </span>
                        </button>
                      );
                    })}
                    <p className="pb-2 pt-1 text-xs text-muted-foreground">Your ticks stay on this device only.</p>
                  </div>
                )}
              </SectionCard>
            </div>

            <SectionCard label="Your photos" className="flex min-w-0 flex-col gap-3.5 p-[18px] lg:p-5">
              <div className="flex items-baseline justify-between">
                <SerifTitle className="text-[22px]">Your photos</SerifTitle>
                <span className="text-sm text-muted-foreground">
                  {photos.length} {photos.length === 1 ? "photo" : "photos"}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {photosLoading ? (
                <Skeleton className="h-32 w-full rounded-2xl" />
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    aria-label="Add photos"
                    className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-primary/40 bg-[var(--nn-soft)] text-[15px] font-bold text-[var(--nn-accent-dark)] disabled:opacity-60"
                  >
                    {uploading ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <Camera className="h-6 w-6" aria-hidden="true" />}
                    {uploading ? "Adding…" : "Add photos"}
                  </button>
                  {photos.map((photo, i) => (
                    <div key={photo.id} className="flex flex-col gap-1">
                      <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#DCCDBB]">
                        <button
                          type="button"
                          onClick={() => setViewing(photo)}
                          aria-label={`Open photo ${i + 1}, ${when(photo)}`}
                          className="block h-full w-full"
                        >
                          {photo.signedUrl && <img src={photo.signedUrl} alt="" className="h-full w-full object-cover" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(photo)}
                          aria-label="Delete photo"
                          className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <span className="text-xs text-muted-foreground">{when(photo)}</span>
                    </div>
                  ))}
                </div>
              )}
              {!photosLoading && photos.length === 0 && (
                <p className="text-[15px] text-muted-foreground">
                  No photos yet. Take a few as you arrive, so you have them if you ever need them.
                </p>
              )}
            </SectionCard>

            <Link to={backTo} replace className={nnButton("primary", "h-[52px] rounded-2xl text-[15px] lg:col-start-2 lg:justify-self-end lg:px-12")}>
              Done
            </Link>
          </div>
        )}
      </main>
      <Footer />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl border-0 bg-black p-0">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          {viewing?.signedUrl && <img src={viewing.signedUrl} alt="" className="max-h-[80vh] w-full object-contain" />}
          {viewing && <p className="px-4 pb-4 text-sm text-white/85">{when(viewing)}</p>}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be gone for good. You can't use it later if you need to report a problem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RoleTheme>
  );
};

export default ArrivalVault;
