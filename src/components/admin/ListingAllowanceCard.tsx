import { useEffect, useState } from "react";
import { Home, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin only: how many listings this member may have (profiles.max_listings,
 * private) and how many they have. Read and set through admin-checked RPCs.
 */
export const ListingAllowanceCard = ({ userId }: { userId: string }) => {
  const { toast } = useToast();
  const [maxListings, setMaxListings] = useState<number | null>(null);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("admin_get_listing_allowance", { p_user_id: userId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        toast({ variant: "destructive", title: "Could not load the listing allowance", description: error.message });
        return;
      }
      const d = (data ?? {}) as { max_listings?: number; listing_count?: number };
      setMaxListings(d.max_listings ?? 1);
      setListingCount(d.listing_count ?? 0);
      setDraft(String(d.max_listings ?? 1));
    });
    return () => {
      cancelled = true;
    };
  }, [userId, toast]);

  const save = async () => {
    const next = Number(draft);
    if (!Number.isInteger(next) || next < 1 || next > 10) {
      toast({ variant: "destructive", title: "Choose a whole number from 1 to 10" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("admin_set_max_listings", { p_user_id: userId, p_max_listings: next });
    setSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Could not save", description: error.message });
      return;
    }
    const saved = (data as number | null) ?? next;
    setMaxListings(saved);
    setDraft(String(saved));
    toast({ title: "Listing allowance saved" });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Home className="w-5 h-5 text-primary" />
          Listing allowance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {maxListings === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {listingCount} listing{listingCount === 1 ? "" : "s"} now (drafts, paused and published). Existing
              listings are never removed; the allowance only blocks new ones.
            </p>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="max-listings" className="text-xs">
                  Maximum listings
                </Label>
                <Input
                  id="max-listings"
                  type="number"
                  min={1}
                  max={10}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-24"
                />
              </div>
              <Button onClick={save} disabled={saving || draft === String(maxListings)}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
