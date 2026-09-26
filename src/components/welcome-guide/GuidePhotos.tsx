import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, ImageIcon, Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { GuidePet, GuidePhoto } from "@/hooks/useWelcomeGuide";
import type { GuideSection } from "@/lib/welcomeGuide";

interface GuidePhotosProps {
  listingId: string;
  section: GuideSection;
  photos: GuidePhoto[];
  pets?: GuidePet[];
  aiVisible: boolean;
  explainPhoto: (listingId: string, photoId: string) => Promise<string>;
  addPhoto: (args: { file: File; section: GuideSection; petId?: string | null; note?: string }) => Promise<string>;
  updatePhoto: (args: { id: string; note?: string | null; instruction?: string | null }) => Promise<void>;
  deletePhoto: (photo: Pick<GuidePhoto, "id" | "storage_path">) => Promise<void>;
}

const NOTE_MAX = 500;

/**
 * "Snap and explain": photos with a short instruction for the sitter. The
 * owner writes the instruction, or lets AI draft it from the photo and their
 * note, then edits before saving.
 */
export const GuidePhotos = ({
  listingId,
  section,
  photos,
  pets = [],
  aiVisible,
  explainPhoto,
  addPhoto,
  updatePhoto,
  deletePhoto,
}: GuidePhotosProps) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [petId, setPetId] = useState<string>("");
  // Once uploaded (or when editing), the photo being given an instruction.
  const [editing, setEditing] = useState<GuidePhoto | { id: string; signedUrl: string | null; note: string | null } | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<"upload" | "ai" | "save" | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setNote("");
    setPetId("");
    setEditing(null);
    setInstruction("");
    setBusy(null);
  };

  const onPick = (picked: File | undefined) => {
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      toast.error("Please choose a photo.");
      return;
    }
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  };

  const upload = async () => {
    if (!file) return;
    setBusy("upload");
    try {
      const id = await addPhoto({ file, section, petId: petId || null, note });
      setEditing({ id, signedUrl: preview, note: note.trim() || null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't upload that photo.");
    } finally {
      setBusy(null);
    }
  };

  const writeWithAi = async () => {
    if (!editing) return;
    setBusy("ai");
    try {
      setInstruction(await explainPhoto(listingId, editing.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't write that right now.");
    } finally {
      setBusy(null);
    }
  };

  const saveInstruction = async () => {
    if (!editing) return;
    setBusy("save");
    try {
      await updatePhoto({ id: editing.id, note: editing.note, instruction: instruction.trim() || null });
      toast.success("Photo saved");
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that.");
      setBusy(null);
    }
  };

  const remove = async (photo: GuidePhoto) => {
    try {
      await deletePhoto(photo);
      toast.success("Photo removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove that photo.");
    }
  };

  const dialogOpen = !!file || !!editing;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Photos</h3>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileInput.current?.click()}>
          <Camera className="h-4 w-4" aria-hidden="true" />
          Add a photo
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          className="sr-only"
          aria-label="Choose a photo"
          onChange={(e) => {
            onPick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Snap where things are, like the food cupboard or the fuse box, and add a short instruction.
        </p>
      ) : (
        <ul className="grid gap-3">
          {photos.map((photo) => (
            <li key={photo.id} className="flex gap-3 rounded-xl border bg-card p-3">
              {photo.signedUrl ? (
                <img src={photo.signedUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                {photo.pet_id && (
                  <p className="text-xs font-medium text-primary">{pets.find((p) => p.id === photo.pet_id)?.name || "Pet"}</p>
                )}
                <p className="whitespace-pre-line text-sm">
                  {photo.instruction || photo.note || <span className="text-muted-foreground">No instruction yet</span>}
                </p>
                <div className="flex gap-1 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs"
                    onClick={() => {
                      setEditing(photo);
                      setInstruction(photo.instruction || "");
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs text-destructive"
                    onClick={() => remove(photo)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && busy === null && reset()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Add an instruction" : "Add a photo"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Tell your sitter what this photo shows and what to do."
                : "Add a short note if it helps, like \"one scoop, twice a day\"."}
            </DialogDescription>
          </DialogHeader>

          {(editing?.signedUrl || preview) && (
            <img src={editing?.signedUrl || preview || ""} alt="" className="max-h-64 w-full rounded-xl object-cover" />
          )}

          {!editing ? (
            <div className="space-y-4">
              {section === "pets" && pets.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="photo-pet">Which pet? (optional)</Label>
                  <select
                    id="photo-pet"
                    value={petId}
                    onChange={(e) => setPetId(e.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">All pets</option>
                    {pets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.type}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="photo-note">Note (optional)</Label>
                <Input
                  id="photo-note"
                  value={note}
                  maxLength={NOTE_MAX}
                  onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                  placeholder="e.g. Luna's food, one scoop twice a day"
                />
              </div>
              <DialogFooter>
                <Button onClick={upload} disabled={busy !== null} className="w-full sm:w-auto">
                  {busy === "upload" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Uploading…
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {aiVisible && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 border-primary/30 bg-primary/5"
                  onClick={writeWithAi}
                  disabled={busy !== null}
                >
                  {busy === "ai" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  )}
                  {busy === "ai" ? "Writing…" : "Write it with AI"}
                </Button>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="photo-instruction">Instruction for your sitter</Label>
                <Textarea
                  id="photo-instruction"
                  value={instruction}
                  rows={4}
                  readOnly={busy === "ai"}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g. Luna's food is in the bottom-left cupboard. One scoop, twice a day."
                  className="rounded-xl text-base sm:text-sm"
                />
                {aiVisible && (
                  <p className="text-xs text-muted-foreground">AI only describes what's in the photo and your note. Check it before saving.</p>
                )}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={reset} disabled={busy !== null}>
                  Skip for now
                </Button>
                <Button onClick={saveInstruction} disabled={busy !== null}>
                  {busy === "save" ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
