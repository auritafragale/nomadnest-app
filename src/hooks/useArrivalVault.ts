import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { resizeImage } from "@/lib/imageResize";
import { readPhotoTakenAt } from "@/lib/photoTakenAt";

export const ARRIVAL_VAULT_BUCKET = "arrival-vault-photos";

export interface ArrivalVaultPhoto {
  id: string;
  path: string;
  signedUrl: string | null;
  created_at: string;
  /** When the photo was taken (read on the device before upload); null for older photos. */
  taken_at: string | null;
}

/**
 * A Nomad's private Arrival Check-In photos for one sit. The bucket is
 * private, so each photo needs a freshly signed URL to display.
 */
export const useArrivalVaultPhotos = (sitId: string | undefined) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["arrival-vault-photos", sitId],
    queryFn: async (): Promise<ArrivalVaultPhoto[]> => {
      if (!sitId) return [];
      const { data, error } = await supabase
        .from("arrival_vault_photos")
        .select("id, photo_url, created_at, taken_at")
        .eq("sit_id", sitId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const paths = (data ?? []).map((p) => p.photo_url);
      let signedByPath: Record<string, string> = {};
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from(ARRIVAL_VAULT_BUCKET)
          .createSignedUrls(paths, 300);
        signedByPath = Object.fromEntries(
          (signed ?? [])
            .filter((s) => s.path && s.signedUrl)
            .map((s) => [s.path as string, s.signedUrl as string])
        );
      }

      return (data ?? []).map((p) => ({
        id: p.id,
        path: p.photo_url,
        signedUrl: signedByPath[p.photo_url] ?? null,
        created_at: p.created_at,
        taken_at: p.taken_at ?? null,
      }));
    },
    enabled: !!sitId && !!user,
  });
};

export const useAddArrivalVaultPhotos = (sitId: string | undefined) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: File[]) => {
      if (!user || !sitId) throw new Error("Not authenticated");

      for (const file of files) {
        // Read when it was taken first, then resize and re-encode on the
        // device: the new JPEG carries no location or other metadata.
        const takenAt = await readPhotoTakenAt(file);
        const blob = await resizeImage(file, 1600, 0.85);
        const path = `${user.id}/${sitId}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from(ARRIVAL_VAULT_BUCKET)
          .upload(path, blob, { upsert: false, contentType: "image/jpeg" });
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from("arrival_vault_photos").insert({
          sit_id: sitId,
          sitter_user_id: user.id,
          photo_url: path,
          taken_at: takenAt,
        });
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arrival-vault-photos", sitId] });
      queryClient.invalidateQueries({ queryKey: ["arrival-vault-count", sitId] });
      toast({ title: "Photos added to your Arrival Check-In" });
    },
    onError: (error: Error) => {
      console.error("Error uploading arrival vault photos:", error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Could not upload one or more photos. Please try again.",
      });
    },
  });
};

/**
 * How many Arrival Check-In photos the Nomad has saved for a sit. Only the
 * Nomad can read these rows; the Pet Parent never asks and is never told.
 */
export const useArrivalPhotoCount = (sitId: string | undefined, enabled = true) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["arrival-vault-count", sitId],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("arrival_vault_photos")
        .select("id", { count: "exact", head: true })
        .eq("sit_id", sitId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!sitId && !!user && enabled,
  });
};

export class ArrivalPhotoEvidenceError extends Error {}

/**
 * Delete one of the Nomad's own Arrival Check-In photos: the row first (the
 * database refuses a photo attached to a flag as evidence), then its file.
 */
export const useDeleteArrivalPhoto = (sitId: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photo: { id: string; path: string }) => {
      const { data, error } = await supabase.from("arrival_vault_photos").delete().eq("id", photo.id).select("id");
      if (error) throw new Error("That photo couldn't be deleted. Please try again.");
      if (!data || data.length === 0) {
        throw new ArrivalPhotoEvidenceError(
          "This photo is attached to a private flag you raised, so it has to stay. It's still only visible to you and our team.",
        );
      }
      // Best effort: the row is gone, so the photo no longer shows either way.
      await supabase.storage.from(ARRIVAL_VAULT_BUCKET).remove([photo.path]).catch(() => undefined);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["arrival-vault-photos", sitId] });
      queryClient.invalidateQueries({ queryKey: ["arrival-vault-count", sitId] });
    },
  });
};
