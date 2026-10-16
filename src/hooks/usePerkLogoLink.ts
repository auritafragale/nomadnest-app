import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createLogoLinkLoader, LOGO_LINK_SECONDS } from "@/lib/perkLogoUrls";
import { PERK_LOGO_BUCKET } from "@/lib/perkPlacements";

// One loader for the whole app: links are shared between screens.
const loader = createLogoLinkLoader(async (paths) => {
  const { data, error } = await supabase.storage.from(PERK_LOGO_BUCKET).createSignedUrls(paths, LOGO_LINK_SECONDS);
  if (error || !data) return {};
  const out: Record<string, string | null> = {};
  for (const row of data) if (row.path) out[row.path] = row.error ? null : row.signedUrl ?? null;
  return out;
});

/**
 * The signed link for a perk logo file (null while loading, or when the file
 * can't be shown). Signed again before it expires; `retry` after an image
 * error signs a new link once.
 */
export const usePerkLogoLink = (path: string | null) => {
  const [url, setUrl] = useState<string | null>(() => (path ? loader.peek(path)?.url ?? null : null));
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      loader.get(path).then((link) => {
        if (!live) return;
        setUrl(link.url);
        timer = setTimeout(load, loader.refreshIn(link));
      });
    void load();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [path, round]);

  const retry = () => {
    if (!path) return;
    loader.forget(path);
    setRound((r) => r + 1);
  };

  return { url, retry };
};
