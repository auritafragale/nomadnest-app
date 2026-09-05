import { useEffect, useState } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useWelcomeGuide, useSaveWelcomeGuide } from "@/hooks/useWelcomeGuide";
import { ArrowLeft, WifiOff, BookOpen, Printer } from "lucide-react";

const FIELDS = [
  { key: "wifi_info", label: "WiFi", placeholder: "Network name and password, any quirks" },
  { key: "feeding_schedule", label: "Feeding schedule", placeholder: "What, how much and when" },
  { key: "vet_info", label: "Vet details", placeholder: "Practice name, address, phone" },
  { key: "emergency_contacts", label: "Emergency contacts", placeholder: "Who to call and when" },
  { key: "house_notes", label: "House notes", placeholder: "Bins, heating, alarm, neighbours…" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type GuideValues = Record<FieldKey, string>;

const emptyValues: GuideValues = {
  wifi_info: "",
  feeding_schedule: "",
  vet_info: "",
  emergency_contacts: "",
  house_notes: "",
};

const WelcomeGuidePage = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [values, setValues] = useState<GuideValues>(emptyValues);

  // Resolve the listing so we know whose (owner-keyed) guide to load.
  const { data: listing } = useQuery({
    queryKey: ["welcome-guide-listing", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("listings")
        .select("id, title, owner_user_id")
        .eq("id", id!)
        .maybeSingle();
      return data as { id: string; title: string; owner_user_id: string } | null;
    },
    enabled: !!id,
  });

  const ownerUserId = listing?.owner_user_id;
  const { guide, isLoading, isOffline, cachedAt } = useWelcomeGuide(ownerUserId);
  const save = useSaveWelcomeGuide(ownerUserId);

  useEffect(() => {
    if (guide) {
      setValues({
        wifi_info: guide.wifi_info || "",
        feeding_schedule: guide.feeding_schedule || "",
        vet_info: guide.vet_info || "",
        emergency_contacts: guide.emergency_contacts || "",
        house_notes: guide.house_notes || "",
      });
    }
  }, [guide]);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  const isOwner = !!user && ownerUserId === user.id;
  const hasContent = FIELDS.some((f) => (guide?.[f.key] || "").trim().length > 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20 container py-8 max-w-3xl">
        <Link
          to={id ? `/listing/${id}` : "/browse-sits"}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to listing
        </Link>

        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-[#E8735A]" />
          Welcome Guide
        </h1>
        <p className="text-muted-foreground mb-6">{listing?.title || "Everything a Nomad needs on arrival"}</p>

        {(isOffline || cachedAt) && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <WifiOff className="w-4 h-4" />
            Saved for offline — last updated{" "}
            {cachedAt ? new Date(cachedAt).toLocaleDateString() : "recently"}
          </p>
        )}

        {hasContent && (
          <Button
            variant="outline"
            size="sm"
            className="mb-4"
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4 mr-2" />
            Download / Print
          </Button>
        )}

        {isLoading && !guide ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : isOwner ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Edit your guide</CardTitle>
              <p className="text-sm text-muted-foreground">
                This guide is shared across all your listings — update it once and every sit uses the same details.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {FIELDS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Textarea
                    id={field.key}
                    value={values[field.key]}
                    placeholder={field.placeholder}
                    rows={3}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                </div>
              ))}
              <Button onClick={() => save.mutate(values)} disabled={save.isPending} className="w-full sm:w-auto">
                {save.isPending ? "Saving…" : "Save Welcome Guide"}
              </Button>
            </CardContent>
          </Card>
        ) : hasContent ? (
          <div className="space-y-4">
            {FIELDS.filter((f) => (guide?.[f.key] || "").trim()).map((field) => (
              <Card key={field.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{field.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-line text-muted-foreground">{guide?.[field.key]}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              The Pet Parent hasn't added a Welcome Guide yet.
            </CardContent>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default WelcomeGuidePage;
