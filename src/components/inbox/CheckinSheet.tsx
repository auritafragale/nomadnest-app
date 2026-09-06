import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Camera, Loader2, Upload } from "lucide-react";
import { useAddSitCheckin, CHECKIN_LABELS, type CheckinKind } from "@/hooks/useSitCheckins";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CheckinSheetProps {
  kind: CheckinKind;
  sitId: string;
  ownerUserId: string;
  listingId: string;
  onClose: () => void;
  onPosted: () => void;
}

const KIND_ICON: Record<CheckinKind, string> = {
  pets_fed: "🐾",
  meds_given: "💊",
  walk_completed: "🦮",
};

export const CheckinSheet = ({
  kind,
  sitId,
  ownerUserId,
  listingId,
  onClose,
  onPosted,
}: CheckinSheetProps) => {
  const { user } = useAuth();
  const addCheckin = useAddSitCheckin(sitId);
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    // Camera captures can arrive with an empty/generic MIME type; the input
    // already restricts selection to images, so accept those too.
    const looksLikeImage =
      file.type.startsWith("image/") || !file.type || file.type === "application/octet-stream";
    if (!looksLikeImage) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setUploading(true);
    try {
      const nameExt = file.name.includes(".") ? file.name.split(".").pop() : null;
      const typeExt = file.type.startsWith("image/") ? file.type.split("/")[1] : null;
      const ext = (nameExt || typeExt || "jpg").toLowerCase().replace("jpeg", "jpg");
      const path = `${user.id}/checkins/${Date.now()}-${Math.random().toString(36).slice(7)}.${ext}`;
      const { error } = await supabase.storage.from("listing-images").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    addCheckin.mutate(
      { kind, note, photoUrl, ownerUserId, listingId: listingId || null },
      { onSuccess: onPosted },
    );
  };

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-16 z-[60] flex items-end justify-center bg-black/50 md:bottom-0 md:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[calc(100svh-5rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-lg sm:max-w-md sm:rounded-2xl md:max-h-[calc(100svh-1rem)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <span>{KIND_ICON[kind]}</span>
            {CHECKIN_LABELS[kind]}
          </h4>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a short note (optional)"
            maxLength={200}
          />

          <div className="flex gap-2">
            {photoUrl ? (
              <div className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-sm text-emerald-600">
                Photo added ✓
              </div>
            ) : uploading ? (
              <div className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading…
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto flex-1 border-2 border-dashed border-border py-2 font-normal text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-muted-foreground"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4" />
                  Take Photo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto flex-1 border-2 border-dashed border-border py-2 font-normal text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-muted-foreground"
                  onClick={() => libraryInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4" />
                  Upload
                </Button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhoto}
                  className="hidden"
                />
                <input
                  ref={libraryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhoto}
                  className="hidden"
                />
              </>
            )}
            {photoUrl && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPhotoUrl(null)}
                className="h-auto border border-border px-3 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                Remove
              </Button>
            )}
          </div>

          {photoUrl && (
            <img
              src={photoUrl}
              alt="Check-in preview"
              className="w-full max-h-40 object-cover rounded-lg"
            />
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button onClick={handleSubmit} disabled={addCheckin.isPending || uploading} className="w-full">
            {addCheckin.isPending ? "Posting…" : `Send ${CHECKIN_LABELS[kind]} update`}
          </Button>
        </div>
      </div>
    </div>
  );
};
