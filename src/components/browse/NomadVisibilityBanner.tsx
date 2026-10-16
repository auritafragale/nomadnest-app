import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";


interface NomadVisibilityBannerProps {
  /** "row": the full sentence (desktop panel, empty state). "pill": a small
   *  floating pill on the map ("Visible" or "Hidden" and the switch). */
  variant?: "row" | "pill";
  className?: string;
}

const NomadVisibilityBanner = ({ variant = "row", className }: NomadVisibilityBannerProps = {}) => {
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

  const pill = variant === "pill";
  // The whole row (or pill) is the switch; the switch inside is drawn at its
  // usual size. Row: 56px tap target. Pill: 44px, floating on the map.
  const row = (
    <button
      type="button"
      role="switch"
      aria-checked={isVisible}
      aria-label={pill ? (isVisible ? "You are visible on the map" : "You are hidden from the map") : undefined}
      disabled={updating}
      onClick={() => void handleToggle(!isVisible)}
      className={cn(
        "flex cursor-pointer items-center gap-3 border border-border bg-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-70",
        pill
          ? "h-11 shrink-0 gap-2 whitespace-nowrap rounded-full px-3 text-sm font-bold shadow-[var(--nn-float-shadow)]"
          : "min-h-[56px] w-full rounded-[18px] px-4 py-2",
        className,
      )}
    >
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", isVisible ? "bg-brand-teal" : "bg-muted-foreground")} aria-hidden="true" />
      <span className={cn("min-w-0", pill ? "" : "flex-1 text-[15px] font-semibold")}>
        {pill ? (isVisible ? "Visible" : "Hidden") : isVisible ? "You are visible on the map" : "You are hidden from the map"}
      </span>
      <span
        aria-hidden="true"
        className={cn("inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors", isVisible ? "bg-primary" : "bg-input")}
      >
        <span className={cn("block h-5 w-5 rounded-full bg-background shadow-lg transition-transform", isVisible ? "translate-x-5" : "translate-x-0")} />
      </span>
    </button>
  );

  return row;
};

export default NomadVisibilityBanner;
