import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Camera, Loader2 } from "lucide-react";
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-lg p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <span>{KIND_ICON[kind]}</span>
            {CHECKIN_LABELS[kind]}
          </h4>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a short note (optional)"
          maxLength={200}
        />

        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer">
            <div className="flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors text-sm text-muted-foreground">
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : photoUrl ? (
                <span className="text-emerald-600">Photo added ✓</span>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  Add photo
                </>
              )}
            </div>
            <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
          </label>
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

        <Button onClick={handleSubmit} disabled={addCheckin.isPending || uploading} className="w-full">
          {addCheckin.isPending ? "Posting…" : `Send ${CHECKIN_LABELS[kind]} update`}
        </Button>
      </div>
    </div>
  );
};
