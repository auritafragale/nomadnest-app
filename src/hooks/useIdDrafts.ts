import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { draftPath, extensionOf, prepareIdFile } from "@/lib/idUpload";

export type IdDraftKind = "id" | "selfie";
export interface IdDraft {
  path: string;
  url: string | null;
  isPdf: boolean;
}

const BUCKET = "id-verification-documents";

/**
 * The member's Photo ID and selfie, saved to storage the moment they are
 * picked ({uid}/draft/{id|selfie}-{timestamp}.{ext}), so a page reload while
 * the camera or file app is open can't lose them. On load, and whenever the
 * page becomes visible again, the newest of each is shown.
 */
export const useIdDrafts = (userId: string | undefined) => {
  const [drafts, setDrafts] = useState<Record<IdDraftKind, IdDraft | null>>({ id: null, selfie: null });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<Record<IdDraftKind, boolean>>({ id: false, selfie: false });
  const [errors, setErrors] = useState<Record<IdDraftKind, string>>({ id: "", selfie: "" });
  // Kinds being saved or removed right now: a reload of the list never overwrites them.
  const busy = useRef<Record<IdDraftKind, boolean>>({ id: false, selfie: false });

  const sign = async (path: string) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  };

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(`${userId}/draft`, { limit: 100, sortBy: { column: "name", order: "desc" } });
    if (error) {
      setLoaded(true);
      return;
    }
    const newest = (prefix: string) =>
      (data ?? [])
        .filter((o) => o.name.startsWith(prefix))
        .sort((a, b) => b.name.localeCompare(a.name))[0];
    const next: Partial<Record<IdDraftKind, IdDraft | null>> = {};
    for (const kind of ["id", "selfie"] as IdDraftKind[]) {
      if (busy.current[kind]) continue;
      const o = newest(`${kind}-`);
      if (!o) {
        next[kind] = null;
        continue;
      }
      const path = `${userId}/draft/${o.name}`;
      next[kind] = { path, url: await sign(path), isPdf: extensionOf(o.name) === "pdf" };
    }
    setDrafts((prev) => ({ ...prev, ...next }));
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // Best effort: the database only lets a member delete their own drafts
  // that no ID check uses, so a submitted file is never removed here.
  const discard = async (path: string | undefined) => {
    if (path && path.includes("/draft/")) await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
  };

  /** Prepare and upload one file; the other item is never touched. */
  const save = async (kind: IdDraftKind, file: File | null | undefined) => {
    if (!userId || !file) return;
    busy.current[kind] = true;
    setSaving((s) => ({ ...s, [kind]: true }));
    setErrors((e) => ({ ...e, [kind]: "" }));
    try {
      const prepared = await prepareIdFile(file, kind === "id");
      if ("error" in prepared) {
        setErrors((e) => ({ ...e, [kind]: prepared.error }));
        return;
      }
      const path = draftPath(userId, kind, prepared.contentType);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, prepared.blob, { upsert: false, contentType: prepared.contentType });
      if (error) throw error;
      const previous = drafts[kind]?.path;
      setDrafts((d) => ({ ...d, [kind]: { path, url: null, isPdf: prepared.contentType === "application/pdf" } }));
      const url = await sign(path);
      setDrafts((d) => (d[kind]?.path === path ? { ...d, [kind]: { ...d[kind]!, url } } : d));
      if (previous !== path) await discard(previous);
    } catch (err) {
      console.error("ID upload failed", (err as { statusCode?: string; name?: string })?.name ?? "error");
      setErrors((e) => ({ ...e, [kind]: "That didn't upload. Please check your connection and try again." }));
    } finally {
      busy.current[kind] = false;
      setSaving((s) => ({ ...s, [kind]: false }));
    }
  };

  const remove = async (kind: IdDraftKind) => {
    const path = drafts[kind]?.path;
    busy.current[kind] = true;
    setDrafts((d) => ({ ...d, [kind]: null }));
    setErrors((e) => ({ ...e, [kind]: "" }));
    try {
      await discard(path);
    } finally {
      busy.current[kind] = false;
    }
  };

  return { drafts, loaded, saving, errors, save, remove, reload: load };
};
