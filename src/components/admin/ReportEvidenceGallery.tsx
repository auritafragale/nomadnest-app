import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const BUCKET = "report-evidence";
// Short-lived links, signed again when they're about to expire.
const EXPIRES_IN_SECONDS = 300;
const RESIGN_AFTER_MS = 240_000;

const isImage = (path: string) => /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(path);

/**
 * Admin only (the storage rule lets only admins read report evidence):
 * thumbnails for images, a chip for other files, and a tap-to-enlarge viewer.
 */
export const ReportEvidenceGallery = ({ paths }: { paths: string[] }) => {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [signedAt, setSignedAt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);

  const sign = useCallback(async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, EXPIRES_IN_SECONDS);
    if (error) {
      setFailed(true);
      return {};
    }
    const next = Object.fromEntries(
      (data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl]),
    );
    setUrls(next);
    setSignedAt(Date.now());
    setFailed(false);
    return next;
  }, [paths]);

  useEffect(() => {
    if (paths.length > 0) sign();
  }, [paths, sign]);

  const fresh = async () => (Date.now() - signedAt > RESIGN_AFTER_MS ? await sign() : urls);

  const images = paths.filter(isImage);
  const files = paths.filter((p) => !isImage(p));

  const openFile = async (path: string) => {
    const current = await fresh();
    if (current[path]) window.open(current[path], "_blank", "noopener,noreferrer");
  };

  const openViewer = async (index: number) => {
    await fresh();
    setViewer(index);
  };

  if (paths.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Proof ({paths.length} file{paths.length === 1 ? "" : "s"})
      </p>
      {failed && <p className="text-xs text-destructive">The proof couldn't be loaded. Refresh to try again.</p>}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((path, i) => (
            <button
              key={path}
              type="button"
              onClick={() => openViewer(i)}
              className="h-20 w-20 overflow-hidden rounded-lg border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Open proof image ${i + 1}`}
            >
              {urls[path] ? (
                <img src={urls[path]} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <ImageOff className="m-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((path) => {
            const name = path.split("/").pop() || "File";
            return (
              <Button key={path} variant="outline" size="sm" className="gap-1.5" onClick={() => openFile(path)}>
                <FileText className="h-3.5 w-3.5" />
                {name.length > 24 ? `${name.slice(0, 21)}…` : name}
              </Button>
            );
          })}
        </div>
      )}

      <Dialog open={viewer !== null} onOpenChange={(open) => !open && setViewer(null)}>
        <DialogContent className="max-w-3xl p-2 sm:p-4">
          <DialogTitle className="sr-only">Proof image</DialogTitle>
          {viewer !== null && images[viewer] && (
            <div className="space-y-3">
              {urls[images[viewer]] ? (
                <img
                  src={urls[images[viewer]]}
                  alt={`Proof image ${viewer + 1} of ${images.length}`}
                  className="max-h-[75vh] w-full rounded-lg object-contain"
                />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">This image couldn't be loaded.</p>
              )}
              {images.length > 1 && (
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous image"
                    onClick={() => openViewer((viewer - 1 + images.length) % images.length)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {viewer + 1} of {images.length}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next image"
                    onClick={() => openViewer((viewer + 1) % images.length)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
