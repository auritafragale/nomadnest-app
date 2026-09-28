import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Short-lived signed URLs (1 hour by default) for files in a private bucket,
 * in one request. Storage policies decide who may read each path; paths the
 * caller can't read are simply missing from the result.
 */
export const useSignedUrls = (bucket: string, paths: string[], expiresInSeconds = 3600) => {
  const unique = [...new Set(paths.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["signed-urls", bucket, expiresInSeconds, unique.join(",")],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, expiresInSeconds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      }
      return map;
    },
    enabled: unique.length > 0,
    // Refresh a little before the links expire.
    staleTime: Math.max(60, expiresInSeconds - 600) * 1000,
    refetchInterval: Math.max(60, expiresInSeconds - 60) * 1000,
  });
};
