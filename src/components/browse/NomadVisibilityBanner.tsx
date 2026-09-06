import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";


const NomadVisibilityBanner = () => {
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
        : "You've been removed from the map and city chats.",
    });
  };

  return (
    <div className="container pt-4">
      <div
        className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 ${
          isVisible
            ? "border-primary/30 bg-primary/5"
            : "border-border bg-surface"
        }`}
      >
        <p className="text-sm md:text-base">
          {isVisible ? (
            <>
              ✅ You're visible{city ? ` in ${city}` : ""} — nomads nearby can find you
            </>
          ) : (
            <>
              👁️ You're hidden — turn on visibility to appear on the map and connect with nomads nearby
            </>
          )}
        </p>
        <Switch
          checked={isVisible}
          onCheckedChange={handleToggle}
          disabled={updating}
          aria-label="Toggle nomad visibility"
        />
      </div>
    </div>
  );
};

export default NomadVisibilityBanner;
