import { useRef, useState } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useSits } from "@/hooks/useSits";
import { useArrivalVaultPhotos, useAddArrivalVaultPhotos } from "@/hooks/useArrivalVault";
import { ArrowLeft, Plus, Loader2, ShieldCheck } from "lucide-react";

const ArrivalVault = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { data: sits, isLoading: sitsLoading } = useSits();
  const { data: photos, isLoading: photosLoading } = useArrivalVaultPhotos(id);
  const addPhotos = useAddArrivalVaultPhotos(id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  const sit = sits?.find((s) => s.id === id);
  const isSitter = !!user && sit?.sitter_user_id === user.id;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      await addPhotos.mutateAsync(Array.from(files));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20 container py-8 max-w-2xl">
        <Link to={`/sits/${id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to sit
        </Link>

        {(sitsLoading && !sit) ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : !sit ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              This sit could not be found.
            </CardContent>
          </Card>
        ) : !isSitter ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Only the Nomad on this sit can add Arrival Check-In photos.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Arrival Check-In</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {sit.listing?.title || "Your sit"}
              </p>
            </div>

            <Card className="bg-muted/30 border-dashed">
              <CardContent className="py-4 flex gap-3 items-start">
                <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  These photos are private and only visible to you — unless you later need to
                  attach one as evidence for a private community flag when leaving your review.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Your photos</CardTitle>
              </CardHeader>
              <CardContent>
                {photosLoading ? (
                  <Skeleton className="h-24 w-full rounded-lg" />
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {photos?.map((photo) => (
                      <div
                        key={photo.id}
                        className="aspect-square rounded-lg overflow-hidden bg-muted border border-border"
                      >
                        {photo.signedUrl && (
                          <img
                            src={photo.signedUrl}
                            alt="Arrival Check-In"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {uploading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-5 h-5" />
                          <span className="text-xs">Add photo</span>
                        </>
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                )}

                {!photosLoading && (!photos || photos.length === 0) && (
                  <p className="text-sm text-muted-foreground mt-3">
                    No photos yet — add a few from move-in day so you have them on hand later.
                  </p>
                )}
              </CardContent>
            </Card>

            <Button asChild variant="outline" className="w-full">
              <Link to={`/sits/${id}`}>Done</Link>
            </Button>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default ArrivalVault;
