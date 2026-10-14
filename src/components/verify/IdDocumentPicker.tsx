import { useRef, useState } from "react";
import { Camera, FileText, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IdDraft } from "@/hooks/useIdDrafts";

/**
 * One item on Verify your identity (Photo ID or selfie): take a photo with
 * the camera, or choose a file. Once saved it shows a thumbnail with
 * "Added ✓", Replace and Remove.
 */
const IdDocumentPicker = ({
  title,
  hint,
  takeLabel,
  chooseLabel,
  capture,
  chooseAccept,
  draft,
  saving,
  error,
  onPick,
  onRemove,
}: {
  title: string;
  hint: string;
  takeLabel: string;
  chooseLabel: string;
  capture: "environment" | "user";
  chooseAccept: string;
  draft: IdDraft | null;
  saving: boolean;
  error: string;
  onPick: (file: File | undefined) => void;
  onRemove: () => void;
}) => {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setReplacing(false);
    setThumbFailed(false);
    onPick(file);
  };

  const showButtons = !draft || replacing;

  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>

      {draft && (
        <div className="flex items-center gap-3">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
            {draft.url && !draft.isPdf && !thumbFailed ? (
              <img src={draft.url} alt={`${title}, added`} className="h-full w-full object-cover" onError={() => setThumbFailed(true)} />
            ) : (
              <FileText className="h-7 w-7 text-muted-foreground" aria-label={draft.isPdf ? "PDF added" : "File added"} />
            )}
          </span>
          <p className="min-w-0 flex-1 whitespace-nowrap text-[15px] font-semibold text-brand-teal-text">Added ✓</p>
          <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
            <Button type="button" variant="outline" className="h-11" onClick={() => setReplacing((r) => !r)} disabled={saving} aria-expanded={replacing}>
              Replace
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={onRemove} disabled={saving}>
              Remove
            </Button>
          </div>
        </div>
      )}

      {saving && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Saving…
        </p>
      )}

      {showButtons && !saving && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" className="h-11" onClick={() => cameraRef.current?.click()}>
            <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
            {takeLabel}
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => fileRef.current?.click()}>
            <FolderOpen className="mr-2 h-4 w-4" aria-hidden="true" />
            {chooseLabel}
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture={capture} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
      <input ref={fileRef} type="file" accept={chooseAccept} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
    </section>
  );
};

export default IdDocumentPicker;
