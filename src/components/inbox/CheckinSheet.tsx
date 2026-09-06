import { useState } from "react";
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

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/checkins/${Date.now()}-${Math.random().toString(36).slice(7)}.${ext}`;
      const { error } = await supabase.storage.from("listing-images").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (e.target.value) e.target.value = "";
    }
  };

  const handleSubmit = () => {
    addCheckin.mutate(
      { kind, note, photoUrl, ownerUserId, listingId: listingId || null },
      { onSuccess: onPosted },
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[calc(100svh-1rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-lg sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
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
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors text-sm text-muted-foreground">
                    <Camera className="w-4 h-4" />
                    Take Photo
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhoto}
                    className="hidden"
                  />
                </label>
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors text-sm text-muted-foreground">
                    <Upload className="w-4 h-4" />
                    Upload
                  </div>
                  <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
                </label>
              </>
            )}
            {photoUrl && (
              <button
                onClick={() => setPhotoUrl(null)}
                className="px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground"
              >
                Remove
              </button>
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
