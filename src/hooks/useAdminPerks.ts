import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AdminPerk {
  id: string;
  name: string;
  slug: string;
  category: string;
  benefit_short: string;
  description: string | null;
  affiliate_url: string;
  logo_url: string | null;
  discount_code: string | null;
  terms: string | null;
  expires_at: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  subid_param: string | null;
}

export interface PerkStats {
  perk_id: string;
  total_clicks: number;
  clicks_30d: number;
}

export type PerkInput = Omit<AdminPerk, "id">;

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const useAdminPerks = () => {
  const [perks, setPerks] = useState<AdminPerk[]>([]);
  const [stats, setStats] = useState<Record<string, PerkStats>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: perkData }, { data: statData }] = await Promise.all([
      supabase.rpc("admin_list_perks"),
      supabase.rpc("admin_perk_click_stats"),
    ]);

    setPerks((perkData as AdminPerk[]) ?? []);

    const map: Record<string, PerkStats> = {};
    ((statData as PerkStats[]) ?? []).forEach((s) => {
      map[s.perk_id] = s;
    });
    setStats(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const createPerk = async (input: PerkInput) => {
    const { error } = await supabase.from("perks").insert(input);
    if (error) throw error;
    await fetchAll();
  };

  const updatePerk = async (id: string, input: Partial<PerkInput>) => {
    const { error } = await supabase.from("perks").update(input).eq("id", id);
    if (error) throw error;
    await fetchAll();
  };

  const deletePerk = async (id: string) => {
    const { error } = await supabase.from("perks").delete().eq("id", id);
    if (error) throw error;
    await fetchAll();
  };

  return { perks, stats, loading, refetch: fetchAll, createPerk, updatePerk, deletePerk };
};
