import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useGoogleMapsKey = () => {
  return useQuery({
    queryKey: ["google-maps-key"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-google-maps-key");
      if (error) throw error;
      return data.key as string;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
};
