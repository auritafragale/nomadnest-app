import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { PET_PUBLIC_COLUMNS, fetchOwnPetPrivateDetails } from "@/lib/privateColumns";
import { resizeImage } from "@/lib/imageResize";
import { GUIDE_PHOTO_BUCKET, type GuideCompletion, type GuideSection } from "@/lib/welcomeGuide";

// Sitters read the guide only through get_sitter_guide (see useSitterGuide).

export interface WelcomeGuide {
  listing_id: string;
  emergency_contacts: string | null;
  out_of_hours_vet: string | null;
  house_notes: string | null;
  bins_recycling: string | null;
  plants: string | null;
  appliances: string | null;
  heating_cooling: string | null;
  parking: string | null;
  neighbours: string | null;
  na_fields: string[];
  updated_at?: string | null;
}

// ─── Completion (single source: get_guide_completion) ───────────────────────

export const useGuideCompletion = (listingId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ["guide-completion", listingId],
    queryFn: async (): Promise<GuideCompletion | null> => {
      if (!listingId) return null;
      const { data, error } = await supabase.rpc("get_guide_completion", { p_listing_id: listingId });
      if (error) throw error;
      return data as unknown as GuideCompletion;
    },
    enabled: !!listingId && enabled,
  });

// ─── Owner editor ────────────────────────────────────────────────────────────

export interface GuideRow extends WelcomeGuide {
  migrated_notes: string | null;
}

export interface AccessRow {
  listing_id: string;
  key_handover: string | null;
  door_codes: string | null;
  alarm_instructions: string | null;
  wifi_details: string | null;
  na_fields: string[];
}

export interface GuidePet {
  id: string;
  name: string | null;
  type: string;
  requires_medication: boolean | null;
  has_medication: boolean | null;
  feeding_details: string | null;
  walks_exercise: string | null;
  daily_routine: string | null;
  medication_instructions: string | null;
  behaviour_notes: string | null;
  vet_info: string | null;
}

export interface GuidePhoto {
  id: string;
  section: GuideSection;
  pet_id: string | null;
  storage_path: string;
  note: string | null;
  instruction: string | null;
  signedUrl: string | null;
}

export interface GuideEditorData {
  listing: { id: string; title: string; owner_user_id: string };
  guide: GuideRow | null;
  access: AccessRow | null;
  pets: GuidePet[];
  photos: GuidePhoto[];
}

const editorKey = (listingId: string | undefined) => ["guide-editor", listingId];

export const useGuideEditorData = (listingId: string | undefined) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: editorKey(listingId),
    queryFn: async (): Promise<GuideEditorData | null> => {
      if (!listingId || !user) return null;

      const { data: listing, error: listingError } = await supabase
        .from("listings")
        .select("id, title, owner_user_id")
        .eq("id", listingId)
        .maybeSingle();
      if (listingError) throw listingError;
      if (!listing || listing.owner_user_id !== user.id) return null;

      const [guideRes, accessRes, petsRes, photosRes, petPrivate] = await Promise.all([
        supabase.from("welcome_guides").select("*").eq("listing_id", listingId).maybeSingle(),
        supabase.from("welcome_guide_access").select("*").eq("listing_id", listingId).maybeSingle(),
        supabase.from("pets").select(PET_PUBLIC_COLUMNS).eq("listing_id", listingId).order("created_at"),
        supabase
          .from("welcome_guide_photos")
          .select("id, section, pet_id, storage_path, note, instruction")
          .eq("listing_id", listingId)
          .order("sort_order")
          .order("created_at"),
        // Throws rather than returning blanks, so a save can't wipe private fields.
        fetchOwnPetPrivateDetails(listingId),
      ]);
      for (const res of [guideRes, accessRes, petsRes, photosRes]) {
        if (res.error) throw res.error;
      }

      const photoRows = (photosRes.data ?? []) as Omit<GuidePhoto, "signedUrl">[];
      let signed: Record<string, string> = {};
      if (photoRows.length > 0) {
        const { data: urls } = await supabase.storage
          .from(GUIDE_PHOTO_BUCKET)
          .createSignedUrls(photoRows.map((p) => p.storage_path), 60 * 60);
        signed = Object.fromEntries((urls ?? []).filter((u) => u.signedUrl).map((u) => [u.path, u.signedUrl]));
      }

      return {
        listing,
        guide: (guideRes.data as GuideRow | null) ?? null,
        access: (accessRes.data as AccessRow | null) ?? null,
        pets: (petsRes.data ?? []).map((p) => {
          const priv = petPrivate.get(p.id);
          return {
            id: p.id,
            name: p.name,
            type: p.type,
            requires_medication: p.requires_medication,
            has_medication: p.has_medication,
            feeding_details: p.feeding_details,
            walks_exercise: p.walks_exercise,
            daily_routine: p.daily_routine,
            medication_instructions: priv?.medication_instructions ?? null,
            behaviour_notes: priv?.behaviour_notes ?? null,
            vet_info: priv?.vet_info ?? null,
          };
        }),
        photos: photoRows.map((p) => ({ ...p, signedUrl: signed[p.storage_path] ?? null })),
      };
    },
    enabled: !!listingId && !!user,
  });
};

export type GuideFields = Partial<Omit<GuideRow, "listing_id" | "updated_at">>;
export type AccessFields = Partial<Omit<AccessRow, "listing_id">>;
export type PetFields = Partial<
  Pick<GuidePet, "feeding_details" | "walks_exercise" | "daily_routine" | "medication_instructions" | "behaviour_notes" | "vet_info">
>;

/** Save actions for the owner editor. Each refreshes the data and the %. */
export const useGuideEditorActions = (listingId: string | undefined) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: editorKey(listingId) });
    queryClient.invalidateQueries({ queryKey: ["guide-completion", listingId] });
    queryClient.invalidateQueries({ queryKey: ["welcome-guide", listingId] });
  };
  const requireIds = () => {
    if (!listingId || !user) throw new Error("Please sign in again.");
    return { listingId, userId: user.id };
  };

  const saveGuide = useMutation({
    mutationFn: async (values: GuideFields) => {
      const ids = requireIds();
      const { error } = await supabase
        .from("welcome_guides")
        .upsert({ ...values, listing_id: ids.listingId, owner_user_id: ids.userId }, { onConflict: "listing_id" });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const saveAccess = useMutation({
    mutationFn: async (values: AccessFields) => {
      const ids = requireIds();
      const { error } = await supabase
        .from("welcome_guide_access")
        .upsert({ ...values, listing_id: ids.listingId, owner_user_id: ids.userId }, { onConflict: "listing_id" });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  /** Pets are the single source of truth: this edits the same rows the listing shows. */
  const savePets = useMutation({
    mutationFn: async (updates: { petId: string; values: PetFields }[]) => {
      requireIds();
      for (const { petId, values } of updates) {
        const { error } = await supabase.from("pets").update(values).eq("id", petId);
        if (error) throw error;
      }
    },
    onSuccess: refresh,
  });

  const addPhoto = useMutation({
    mutationFn: async ({
      file,
      section,
      petId,
      note,
    }: {
      file: File;
      section: GuideSection;
      petId?: string | null;
      note?: string;
    }) => {
      const ids = requireIds();
      const blob = await resizeImage(file);
      const path = `${ids.userId}/${ids.listingId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(GUIDE_PHOTO_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("welcome_guide_photos")
        .insert({
          listing_id: ids.listingId,
          owner_user_id: ids.userId,
          section,
          pet_id: petId ?? null,
          storage_path: path,
          note: note?.trim() || null,
        })
        .select("id")
        .single();
      if (error) {
        await supabase.storage.from(GUIDE_PHOTO_BUCKET).remove([path]);
        throw error;
      }
      return data.id as string;
    },
    onSuccess: refresh,
  });

  const updatePhoto = useMutation({
    mutationFn: async ({ id, note, instruction }: { id: string; note?: string | null; instruction?: string | null }) => {
      const { error } = await supabase
        .from("welcome_guide_photos")
        .update({ note: note ?? null, instruction: instruction ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const deletePhoto = useMutation({
    mutationFn: async (photo: Pick<GuidePhoto, "id" | "storage_path">) => {
      const { error } = await supabase.from("welcome_guide_photos").delete().eq("id", photo.id);
      if (error) throw error;
      await supabase.storage.from(GUIDE_PHOTO_BUCKET).remove([photo.storage_path]);
    },
    onSuccess: refresh,
  });

  return { saveGuide, saveAccess, savePets, addPhoto, updatePhoto, deletePhoto };
};

// ─── AI helpers (snap and explain, polish) ──────────────────────────────────

export const GUIDE_AI_TIMEOUT_MS = 50_000;
const AI_FRIENDLY_ERROR = "Sorry, that didn't work right now. Please try again in a moment.";
const AI_TIMEOUT_ERROR = "The AI is taking longer than usual. Please try again in a moment.";

/** Behind app_settings.guide_ai_enabled; admins can use it while it's off. */
export const useGuideAi = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();

  const { data: flagEnabled = false } = useQuery({
    queryKey: ["app-setting", "guide_ai_enabled"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "guide_ai_enabled")
        .maybeSingle();
      return data?.value === true;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const call = async (body: Record<string, unknown>): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GUIDE_AI_TIMEOUT_MS);
    try {
      const { data, error } = await supabase.functions.invoke<{ text?: string }>("welcome-guide-ai", {
        body,
        signal: controller.signal,
      });
      if (controller.signal.aborted) throw new Error(AI_TIMEOUT_ERROR);
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const parsed = await error.context.json().catch(() => null);
          throw new Error(parsed?.error || AI_FRIENDLY_ERROR);
        }
        throw new Error(AI_FRIENDLY_ERROR);
      }
      if (!data?.text) throw new Error(AI_FRIENDLY_ERROR);
      return data.text;
    } catch (err) {
      if (controller.signal.aborted) throw new Error(AI_TIMEOUT_ERROR);
      throw err instanceof Error ? err : new Error(AI_FRIENDLY_ERROR);
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    visible: !!user && (flagEnabled || isAdmin === true),
    explainPhoto: (listingId: string, photoId: string) =>
      call({ action: "explain_photo", listing_id: listingId, photo_id: photoId }),
    polish: (listingId: string, section: GuideSection, text: string) =>
      call({ action: "polish", listing_id: listingId, section, text }),
    /** A chat reply to a sitter's question, tidied into a standalone guide answer. */
    polishAnswer: (listingId: string, question: string, text: string) =>
      call({ action: "polish", purpose: "qa_answer", listing_id: listingId, question, text }),
  };
};
