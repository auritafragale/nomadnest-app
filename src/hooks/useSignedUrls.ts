import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Short-lived (1 hour) signed URLs for files in a private bucket, in one
 * request. Storage policies decide who may read each path; paths the caller
 * can't read are simply missing from the result.
 */
export const useSignedUrls = (bucket: string, paths: string[]) => {
  const unique = [...new Set(paths.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["signed-urls", bucket, unique.join(",")],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, 3600);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      }
      return map;
    },
    enabled: unique.length > 0,
    staleTime: 50 * 60 * 1000,
  });
};
