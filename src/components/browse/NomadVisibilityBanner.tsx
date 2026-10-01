import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";


interface NomadVisibilityBannerProps {
  /** True when rendered over a map, so the card blends into it instead of sitting as a solid block. */
  transparent?: boolean;
  /** True to skip the outer container/spacing wrapper, so the caller controls placement. */
  bare?: boolean;
}

const NomadVisibilityBanner = ({ transparent = false, bare = false }: NomadVisibilityBannerProps = {}) => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [city, setCity] = useState<string | null>(null);
  const [hasSitterProfile, setHasSitterProfile] = useState(false);

  const isSitter = role === "sitter" || role === "both";

  useEffect(() => {
    if (!user || !isSitter) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: sp }, { data: prof }] = await Promise.all([
        supabase
          .from("sitter_profiles")
          .select("is_visible")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("city")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (sp) {
        setHasSitterProfile(true);
        setIsVisible(!!sp.is_visible);
      }
      setCity(prof?.city ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isSitter]);

  if (!user || !isSitter || loading || !hasSitterProfile) return null;

  const handleToggle = async (next: boolean) => {
    if (!user) return;
    setUpdating(true);
    const prev = isVisible;
    setIsVisible(next);
    const { error } = await supabase
      .from("sitter_profiles")
      .update({ is_visible: next })
      .eq("user_id", user.id);
    setUpdating(false);
    if (error) {
      setIsVisible(prev);
      toast({
        title: "Couldn't update visibility",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    // Refresh the map and the nomad directory so the pin appears or disappears
    // straight away, without leaving and re-entering the section.
    queryClient.invalidateQueries({ queryKey: ["nomads-map"] });
    queryClient.invalidateQueries({ queryKey: ["sitters"] });
    toast({
      title: next ? "You're now visible" : "You're now hidden",
      description: next
        ? "Nomads nearby can find you on the map."
        : "You've been removed from the map.",
    });
  };

  // One slim row: a status dot, the state in words, and the switch.
  const row = (
    <div className={cn("flex min-h-[56px] items-center gap-3 rounded-[18px] border border-border px-4 py-2", transparent ? "bg-background/80 backdrop-blur-sm" : "bg-card")}>
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", isVisible ? "bg-brand-teal" : "bg-muted-foreground")} aria-hidden="true" />
      <label htmlFor="nomad-visibility" className="min-w-0 flex-1 cursor-pointer text-[15px] font-semibold">
        {isVisible ? "You are visible on the map" : "You are hidden from the map"}
      </label>
      <Switch id="nomad-visibility" checked={isVisible} onCheckedChange={handleToggle} disabled={updating} />
    </div>
  );

  if (bare) return row;

  return <div className="container pt-4">{row}</div>;
};

export default NomadVisibilityBanner;
