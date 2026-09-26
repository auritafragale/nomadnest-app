import { useParams, Navigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWelcomeGuide } from "@/hooks/useWelcomeGuide";
import { GuideEditor } from "@/components/welcome-guide/GuideEditor";
import { EMERGENCY_FIELDS, HOUSE_FIELDS } from "@/lib/welcomeGuide";
import { ArrowLeft, WifiOff, BookOpen, Printer } from "lucide-react";
import { printWelcomeGuide } from "@/lib/printGuide";

const READ_FIELDS = [...EMERGENCY_FIELDS, ...HOUSE_FIELDS];

/**
 * /listing/:id/welcome-guide
 * Owner: the sectioned editor. Anyone else who can read the guide (the
 * listing's confirmed sitter): the non-sensitive fields, read-only. The full
 * sitter view with timed access to arrival details comes in Stage 2.
 */
const WelcomeGuidePage = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();

  const { data: listing, isLoading: listingLoading } = useQuery({
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

  const isOwner = !!user && !!listing && listing.owner_user_id === user.id;
  const { guide, isLoading, isOffline, cachedAt } = useWelcomeGuide(!isOwner ? id : undefined);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  const naFields = guide?.na_fields ?? [];
  const readItems = READ_FIELDS.flatMap((f) => {
    const text = (guide?.[f.key] || "").trim();
    if (text) return [{ key: f.key, label: f.label, value: text }];
    if (f.naLabel && naFields.includes(f.key)) return [{ key: f.key, label: f.label, value: f.naLabel }];
    return [];
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20 container max-w-3xl px-4 py-8 print-guide-root">
        <Link
          to={id ? `/listing/${id}` : "/browse-sits"}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-5 print-hidden"
        >
          <ArrowLeft className="w-4 h-4" /> Back to listing
        </Link>

        {authLoading || listingLoading ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : isOwner && id ? (
          <GuideEditor listingId={id} />
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary" />
              Welcome Guide
            </h1>
            <p className="text-muted-foreground mb-6">{listing?.title || "Everything a Nomad needs on arrival"}</p>

            {(isOffline || cachedAt) && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <WifiOff className="w-4 h-4" />
                Saved for offline, last updated {cachedAt ? new Date(cachedAt).toLocaleDateString() : "recently"}
              </p>
            )}

            {isLoading && !guide ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : readItems.length > 0 ? (
              <>
                <Button variant="outline" size="sm" className="mb-4 print-hidden" onClick={printWelcomeGuide}>
                  <Printer className="w-4 h-4 mr-2" />
                  Download / Print
                </Button>
                <div className="space-y-4">
                  {readItems.map((item) => (
                    <Card key={item.key}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{item.label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm whitespace-pre-line text-muted-foreground">{item.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  The Pet Parent hasn't added a Welcome Guide yet.
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default WelcomeGuidePage;
