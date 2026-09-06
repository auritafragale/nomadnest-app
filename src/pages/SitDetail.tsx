import { useState } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useSits } from "@/hooks/useSits";
import ImageUpload from "@/components/listing/ImageUpload";
import {
  CHECKIN_LABELS,
  CheckinKind,
  useAddSitCheckin,
  useSitCheckins,
} from "@/hooks/useSitCheckins";
import { ArrowLeft, BookOpen, Bone, Pill, Footprints, MapPin } from "lucide-react";

const KIND_ICONS: Record<CheckinKind, typeof Bone> = {
  pets_fed: Bone,
  meds_given: Pill,
  walk_completed: Footprints,
};

const SitDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { data: sits, isLoading } = useSits();
  const { data: checkins } = useSitCheckins(id);
  const addCheckin = useAddSitCheckin(id);

  const [activeKind, setActiveKind] = useState<CheckinKind | null>(null);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  const sit = sits?.find((s) => s.id === id);
  const isSitter = !!user && sit?.sitter_user_id === user.id;
  const canPost = isSitter && (sit?.status === "in_progress" || sit?.status === "confirmed");

  const submit = () => {
    if (!activeKind || !sit) return;
    addCheckin.mutate(
      {
        kind: activeKind,
        note,
        photoUrl: photos[0] || null,
        ownerUserId: sit.owner_user_id,
        listingId: sit.listing_id,
      },
      {
        onSuccess: () => {
          setActiveKind(null);
          setNote("");
          setPhotos([]);
        },
      },
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20 container py-8 max-w-3xl">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>

        {isLoading && !sit ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : !sit ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              This sit could not be found.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold">{sit.listing?.title || "Your sit"}</h1>
                <Badge variant="secondary" className="capitalize">
                  {sit.status.replace("_", " ")}
                </Badge>
              </div>
              {(sit.listing?.city || sit.listing?.country) && (
                <p className="text-muted-foreground flex items-center gap-1 text-sm">
                  <MapPin className="w-4 h-4" />
                  {[sit.listing?.city, sit.listing?.country].filter(Boolean).join(", ")}
                </p>
              )}
              {sit.sit_dates && (
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(sit.sit_dates.start_date).toLocaleDateString()} –{" "}
                  {new Date(sit.sit_dates.end_date).toLocaleDateString()}
                </p>
              )}
            </div>

            {sit.listing_id && (
              <Link to={`/listing/${sit.listing_id}/welcome-guide`}>
                <Button variant="secondary" className="w-full sm:w-auto">
                  <BookOpen className="w-4 h-4 mr-2" />
                  Welcome Guide
                </Button>
              </Link>
            )}

            {canPost && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Daily check-in</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(Object.keys(CHECKIN_LABELS) as CheckinKind[]).map((kind) => {
                      const Icon = KIND_ICONS[kind];
                      return (
                        <Button
                          key={kind}
                          variant={activeKind === kind ? "default" : "outline"}
                          onClick={() => setActiveKind(activeKind === kind ? null : kind)}
                        >
                          <Icon className="w-4 h-4 mr-2" />
                          {CHECKIN_LABELS[kind]}
                        </Button>
                      );
                    })}
                  </div>

                  {activeKind && (
                    <div className="space-y-3">
                      <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="Add a short note (optional)"
                      />
                      <ImageUpload
                        images={photos}
                        onImagesChange={setPhotos}
                        maxImages={1}
                        folder="checkins"
                        label="Add a photo (optional)"
                      />
                      <Button onClick={submit} disabled={addCheckin.isPending} className="w-full sm:w-auto">
                        {addCheckin.isPending ? "Posting…" : `Post ${CHECKIN_LABELS[activeKind]}`}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Check-in feed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!checkins || checkins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No check-ins yet.</p>
                ) : (
                  checkins.map((c) => {
                    const Icon = KIND_ICONS[c.kind] || Bone;
                    return (
                      <div key={c.id} className="flex gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{CHECKIN_LABELS[c.kind] || "Check-in"}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(c.created_at).toLocaleString()}
                          </p>
                          {c.note && <p className="text-sm mt-1 whitespace-pre-line">{c.note}</p>}
                          {c.photo_url && (
                            <img
                              src={c.photo_url}
                              alt={`${CHECKIN_LABELS[c.kind]} check-in photo`}
                              loading="lazy"
                              className="mt-2 rounded-lg max-h-48 object-cover"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default SitDetail;
