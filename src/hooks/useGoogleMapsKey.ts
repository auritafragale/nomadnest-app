import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface GoogleMapsConfig {
  key: string;
  listingMapId: string;
  nomadMapId: string;
}

export const useGoogleMapsKey = () => {
  return useQuery({
    queryKey: ["google-maps-key"],
    queryFn: async (): Promise<GoogleMapsConfig> => {
      const { data, error } = await supabase.functions.invoke("get-google-maps-key");
      if (error) throw error;
      return {
        key: data.key as string,
        listingMapId: data.listingMapId as string,
        nomadMapId: data.nomadMapId as string,
      };
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
};
