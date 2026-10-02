import { photoWithoutMetadata } from "@/lib/imageResize";
import { useRef, useState } from "react";
import { Camera, Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BUCKET = "listing-images";

/** Deletes uploaded files, once the change that removed them has been saved. */
export const deleteStoredImages = async (urls: string[]) => {
  const paths = urls
    .map((u) => {
      try {
        return new URL(u).pathname.split(`/storage/v1/object/public/${BUCKET}/`)[1] ?? null;
      } catch {
        return null;
      }
    })
    .filter((p): p is string => !!p);
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.error("Removing old photos failed", error.message);
};

interface ImageUploadProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  /** Called with each photo taken out. Nothing is deleted from storage until the page saves. */
  onRemove?: (url: string) => void;
  maxImages?: number;
  folder: string;
  label?: string;
  /** Drag (or arrow keys) to reorder; the first photo is marked as the cover. */
  sortable?: boolean;
  /** When true, also shows a "Take photo" tile that opens the device camera on mobile. */
  allowCamera?: boolean;
}

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const ImageUpload = ({
  images,
  onImagesChange,
  onRemove,
  maxImages = 5,
  folder,
  label = "Photos",
  sortable = false,
  allowCamera = false,
}: ImageUploadProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number; index: number; pointerId: number } | null>(null);
  const [announce, setAnnounce] = useState("");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;
    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      toast({ title: "That's the most photos", description: `You can add up to ${maxImages}.`, variant: "destructive" });
      return;
    }
    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setIsUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of filesToUpload) {
        if (!file.type.startsWith("image/")) {
          toast({ title: "That isn't a photo", description: "Please choose JPG, PNG or WebP photos.", variant: "destructive" });
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast({ title: "Photo too large", description: "Photos must be under 5MB.", variant: "destructive" });
          continue;
        }
        // Re-encoded on the device so no location or other metadata is published.
        const clean = await photoWithoutMetadata(file);
        const fileName = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${clean.ext}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(fileName, clean.body, { contentType: clean.contentType });
        if (uploadError) throw uploadError;
        uploadedUrls.push(supabase.storage.from(BUCKET).getPublicUrl(fileName).data.publicUrl);
      }
      onImagesChange([...images, ...uploadedUrls]);
    } catch (error) {
      console.error("Error uploading images:", error instanceof Error ? error.message : error);
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const remove = (url: string) => {
    onImagesChange(images.filter((u) => u !== url));
    onRemove?.(url);
  };

  // ── Reordering: mouse drags straight away; touch after a short hold. ──
  const indexAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest("[data-photo-index]") as HTMLElement | null;
    return el ? Number(el.dataset.photoIndex) : null;
  };
  const clearHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
    if (!sortable || (e.target as HTMLElement).closest("button[data-remove]")) return;
    start.current = { x: e.clientX, y: e.clientY, index, pointerId: e.pointerId };
    if (e.pointerType === "touch") {
      const target = e.currentTarget;
      holdTimer.current = window.setTimeout(() => {
        target.setPointerCapture(e.pointerId);
        setDrag({ from: index, over: index });
      }, 250);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    if (!drag) {
      const moved = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 6;
      if (!moved) return;
      if (e.pointerType === "touch") {
        clearHold(); // a scroll, not a hold
        start.current = null;
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ from: start.current.index, over: start.current.index });
      return;
    }
    const over = indexAt(e.clientX, e.clientY);
    if (over !== null && over !== drag.over) setDrag({ ...drag, over });
  };
  const onPointerUp = () => {
    clearHold();
    if (drag && drag.from !== drag.over) {
      onImagesChange(move(images, drag.from, drag.over));
      setAnnounce(`Photo moved to position ${drag.over + 1}${drag.over === 0 ? ", now the cover" : ""}.`);
    }
    setDrag(null);
    start.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (!sortable) return;
    const to = e.key === "ArrowLeft" || e.key === "ArrowUp" ? index - 1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? index + 1 : null;
    if (to === null || to < 0 || to >= images.length) return;
    e.preventDefault();
    onImagesChange(move(images, index, to));
    setAnnounce(`Photo moved to position ${to + 1}${to === 0 ? ", now the cover" : ""}.`);
    window.requestAnimationFrame(() => (document.querySelector(`[data-photo-key="${folder}-${to}"]`) as HTMLElement | null)?.focus());
  };

  const shown = drag ? move(images, drag.from, drag.over) : images;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-bold">{label}</span>
        <span className="text-sm text-muted-foreground">
          {images.length} of {maxImages}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {shown.map((url, index) => (
          <div
            key={url}
            data-photo-index={index}
            data-photo-key={`${folder}-${index}`}
            role={sortable ? "button" : undefined}
            tabIndex={sortable ? 0 : undefined}
            aria-label={sortable ? `Photo ${index + 1} of ${images.length}${index === 0 ? ", cover" : ""}. Use the arrow keys to move it.` : undefined}
            onPointerDown={(e) => onPointerDown(e, index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={(e) => onKeyDown(e, index)}
            onContextMenu={(e) => sortable && e.preventDefault()}
            className={cn(
              "relative aspect-square select-none overflow-hidden rounded-2xl border border-border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-[var(--nn-accent)]",
              sortable && "cursor-grab touch-none",
              drag && drag.over === index && "ring-2 ring-[var(--nn-accent)]",
            )}
          >
            <img src={url} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />
            {sortable && index === 0 && (
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-card px-2 py-0.5 text-xs font-bold">Cover</span>
            )}
            <button
              type="button"
              data-remove
              onClick={() => remove(url)}
              aria-label={`Remove photo ${index + 1}`}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-card shadow">
                <X className="h-4 w-4" aria-hidden="true" />
              </span>
            </button>
          </div>
        ))}
        {allowCamera && images.length < maxImages && (
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isUploading}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-sm text-muted-foreground"
          >
            <Camera className="h-6 w-6" aria-hidden="true" />
            Take photo
          </button>
        )}
        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            aria-label={`Add ${label.toLowerCase()}`}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground"
          >
            {isUploading ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <Plus className="h-6 w-6" aria-hidden="true" />}
            {isUploading ? "Uploading" : "Add"}
          </button>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
      {allowCamera && <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <p className="text-sm text-muted-foreground">
        {sortable ? "Hold and drag to reorder. The first photo is the cover. " : ""}JPG, PNG or WebP, up to 5MB each.
      </p>
    </div>
  );
};

export default ImageUpload;
