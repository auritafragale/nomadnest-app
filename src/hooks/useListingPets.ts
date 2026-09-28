import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Names and a short summary ("2 cats") of a listing's pets, from the public
 * pet columns (readable for published listings).
 */
export const useListingPets = (listingId: string | null | undefined) =>
  useQuery({
    queryKey: ["listing-pet-names", listingId],
    queryFn: async () => {
      const { data } = await supabase.from("pets").select("name, type").eq("listing_id", listingId!);
      const pets = data ?? [];
      const names = pets.map((p) => p.name || p.type).filter(Boolean) as string[];
      const byType = new Map<string, number>();
      for (const p of pets) byType.set(p.type, (byType.get(p.type) ?? 0) + 1);
      const summary = [...byType]
        .map(([type, n]) => `${n} ${n === 1 ? type : type.endsWith("s") ? type : `${type}s`}`)
        .join(", ");
      const joined = names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
      return { names: joined, summary };
    },
    enabled: !!listingId,
  });
