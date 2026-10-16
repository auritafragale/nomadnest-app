import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PerkLogo } from "@/components/perks/PerkParts";
import { isOurPerkLogo, PERK_LOGO_BUCKET } from "@/lib/perkPlacements";

const TYPES: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg", "image/jpeg": "jpg" };
const MAX_BYTES = 512 * 1024;

/**
 * Admin only: uploads a partner logo to our public perk-logos bucket and
 * hands back its URL (the app never shows logos from anywhere else). PNG,
 * WebP, SVG or JPG, 512 KB at most (the storage rules check the type too).
 */
export const PerkLogoUploader = ({
  name,
  slug,
  value,
  onChange,
}: {
  name: string;
  slug: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ours = isOurPerkLogo(value, import.meta.env.VITE_SUPABASE_URL);

  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const ext = TYPES[file.type];
    if (!ext) {
      setError("Please choose a PNG, WebP, SVG or JPG file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That file is larger than 512 KB. Please choose a smaller one.");
      return;
    }
    setBusy(true);
    try {
      const base = (slug || name || "perk").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "perk";
      const path = `${base}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(PERK_LOGO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      onChange(supabase.storage.from(PERK_LOGO_BUCKET).getPublicUrl(path).data.publicUrl);
    } catch {
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
              : value
                ? "The current logo is from another website, so the app shows the letter tile. Please upload one."
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
        accept="image/png,image/webp,image/svg+xml,image/jpeg"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  );
};
