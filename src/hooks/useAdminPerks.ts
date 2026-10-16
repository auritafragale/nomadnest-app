import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

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
  /** Batch P1: where the perk sits on the page, and how it's shown. */
  trip_moment: "before" | "road" | "sit";
  benefit_headline: string | null;
  benefit_subline: string | null;
  is_perk_of_month: boolean;
  spotlight_text: string | null;
  picked_for_sits: boolean;
  /** P2: up to 30 characters; {country} and {city} filled in on the member's device. */
  short_title: string | null;
}

export interface PerkStats {
  perk_id: string;
  total_clicks: number;
  clicks_30d: number;
  /** P2: clicks per placement (perks_page, sit_confirmed, sit_upcoming, sit_now, dashboard, menu). */
  by_placement?: Record<string, number> | null;
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

  // Since Batch P1 members (admins included) have no direct access to the
  // perks table: admins write through admin_save_perk / admin_delete_perk.
  // Turning on Perk of the month turns the previous one off.
  const createPerk = async (input: PerkInput) => {
    const { error } = await supabase.rpc("admin_save_perk", { p_id: null, p_perk: input as unknown as Json });
    if (error) throw error;
    await fetchAll();
  };

  const updatePerk = async (id: string, input: Partial<PerkInput>) => {
    const { error } = await supabase.rpc("admin_save_perk", { p_id: id, p_perk: input as unknown as Json });
    if (error) throw error;
    await fetchAll();
  };

  const deletePerk = async (id: string) => {
    const { error } = await supabase.rpc("admin_delete_perk", { p_id: id });
    if (error) throw error;
    await fetchAll();
  };

  return { perks, stats, loading, refetch: fetchAll, createPerk, updatePerk, deletePerk };
};
