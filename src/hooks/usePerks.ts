import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const PERK_CATEGORIES = [
  "Travel",
  "Insurance",
  "Pet Care",
  "Gear & Tech",
  "Health & Wellness",
  "Coworking",
  "Other",
] as const;

export type PerkCategory = (typeof PERK_CATEGORIES)[number];

export interface PublicPerk {
  id: string;
  name: string;
  slug: string;
  category: string;
  benefit_short: string;
  description: string | null;
  logo_url: string | null;
  terms: string | null;
  expires_at: string | null;
  is_featured: boolean;
  sort_order: number;
}

export const usePerks = () => {
  const [perks, setPerks] = useState<PublicPerk[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPerks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("perks")
      .select(
        "id, name, slug, category, benefit_short, description, logo_url, terms, expires_at, is_featured, sort_order",
      )
      .order("is_featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!error && data) setPerks(data as PublicPerk[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPerks();
  }, [fetchPerks]);

  const getDiscountCode = async (slug: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc("get_perk_discount_code", { p_slug: slug });
    if (error) throw error;
    return (data as string | null) ?? null;
  };

  const openPerk = async (slug: string) => {
    const { data, error } = await supabase.functions.invoke("perk-redirect", {
      body: { slug, referrer: window.location.pathname },
    });
    if (error) throw error;
    if (data?.url) window.open(data.url as string, "_blank", "noopener,noreferrer");
    else throw new Error("Could not open this perk right now.");
  };

  return { perks, loading, refetch: fetchPerks, getDiscountCode, openPerk };
};
