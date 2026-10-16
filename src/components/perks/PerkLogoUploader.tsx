import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PerkLogo } from "@/components/perks/PerkParts";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { checkLogoFile, PERK_LOGO_BUCKET, PERK_LOGO_TYPES, perkLogoPath } from "@/lib/perkPlacements";

/**
 * Admin only: uploads a partner logo to our private perk-logos bucket as
 * "<slug>-<timestamp>.<ext>" and hands back that file name, which is what
 * perks.logo_url stores. The app shows it through a signed link. Uploads
 * replaced before saving are deleted here; the editor deletes the old saved
 * file once the perk is saved.
 */
export const PerkLogoUploader = ({
  name,
  slug,
  value,
  onChange,
  onUploaded,
}: {
  name: string;
  slug: string;
  value: string | null;
  onChange: (path: string | null) => void;
  /** Every file uploaded in this editing session, so the editor can tidy up. */
  onUploaded: (path: string) => void;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const mine = useRef<Set<string>>(new Set());
  const { isAdmin } = useIsAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ours = !!perkLogoPath(value);

  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const problem = checkLogoFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()!.toLowerCase();
      const base = (slug || name || "perk").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "perk";
      const path = `${base}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(PERK_LOGO_BUCKET).upload(path, file, { contentType: PERK_LOGO_TYPES[ext], upsert: false });
      if (upErr) throw upErr;
      mine.current.add(path);
      onUploaded(path);
      // An upload from this session that was never saved: nothing else uses it.
      const previous = perkLogoPath(value);
      if (previous && mine.current.has(previous)) {
        const { error: rmErr } = await supabase.storage.from(PERK_LOGO_BUCKET).remove([previous]);
        if (rmErr && isAdmin) console.error("[perk logo] could not delete the replaced upload", rmErr);
      }
      onChange(path);
    } catch (e) {
      // The real storage error, for admins only, so a failed upload can be diagnosed.
      if (isAdmin) console.error("[perk logo] upload failed", e);
      setError("We couldn't upload the logo. Please try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <PerkLogo name={name || "Perk"} logoUrl={value} size={48} />
        <div className="flex min-w-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            {ours ? "Replace logo" : "Upload logo"}
          </button>
          <span className="text-xs text-muted-foreground">
            {ours
              ? "Shown on a white tile in light and dark."
              : "PNG, WebP, SVG or JPG, 512 KB at most. Without one, the app shows the letter tile."}
          </span>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept=".png,.webp,.svg,.jpg,.jpeg,image/png,image/webp,image/svg+xml,image/jpeg"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  );
};
