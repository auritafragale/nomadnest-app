import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export const ARRIVAL_VAULT_BUCKET = "arrival-vault-photos";

export interface ArrivalVaultPhoto {
  id: string;
  path: string;
  signedUrl: string | null;
  created_at: string;
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
        .select("id, photo_url, created_at")
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
        const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
        const path = `${user.id}/${sitId}/${crypto.randomUUID()}${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(ARRIVAL_VAULT_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from("arrival_vault_photos").insert({
          sit_id: sitId,
          sitter_user_id: user.id,
          photo_url: path,
        });
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arrival-vault-photos", sitId] });
      toast({ title: "Photos added to your Arrival Check-In" });
    },
    onError: (error: any) => {
      console.error("Error uploading arrival vault photos:", error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Could not upload one or more photos. Please try again.",
      });
    },
  });
};
