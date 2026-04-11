import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Home, ArrowRight, MapPin, Loader2, Navigation } from "lucide-react";
import { AvatarUpload } from "@/components/onboarding/AvatarUpload";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CompleteProfile = () => {
  const { user, loading: authLoading, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeolocating, setIsGeolocating] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }

    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, bio, location, city, country")
        .eq("id", user.id)
        .maybeSingle();

      if (data) {
        const name = `${data.first_name || ""} ${data.last_name || ""}`.trim();
        setFullName(name);
        setBio(data.bio || "");
        setLocation(
          data.location ||
            [data.city, data.country].filter(Boolean).join(", ") ||
            ""
        );
      }
    };

    fetchProfile();
  }, [user, authLoading, navigate]);

  const handleGeolocate = () => {
    if (!navigator.geolocation) return;
    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setIsGeolocating(false);
        toast({ title: "Location captured!", description: "Your coordinates have been set." });
      },
      () => {
        setIsGeolocating(false);
        toast({ variant: "destructive", title: "Location unavailable", description: "Please allow location access or enter your city." });
      },
      { enableHighAccuracy: true }
    );
  };

  const geocodeFromLocation = async () => {
    if (!location.trim()) return;
    setIsGeolocating(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`);
      const results = await res.json();
      if (results?.[0]) {
        setLatitude(parseFloat(results[0].lat));
        setLongitude(parseFloat(results[0].lon));
        toast({ title: "Location set!", description: "Coordinates derived from your location." });
      }
    } catch {
      console.warn("Geocoding failed");
    } finally {
      setIsGeolocating(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !fullName.trim()) return;

    setIsLoading(true);
    try {
      const nameParts = fullName.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          first_name: firstName,
          last_name: lastName,
          bio,
          location,
        })
        .eq("id", user.id);

      // If user is a nomad, update sitter_profiles with coordinates
      if ((role === "sitter" || role === "both") && latitude && longitude) {
        const { data: existing } = await supabase
          .from("sitter_profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("sitter_profiles")
            .update({ latitude, longitude })
            .eq("user_id", user.id);
        }
      }

      toast({
        title: "Profile complete! 🎉",
        description: "You're all set. Welcome to NomadNest!",
      });

      navigate("/dashboard");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save your profile. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-warm">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isNomad = role === "sitter" || role === "both";

  return (
    <div className="min-h-screen bg-gradient-warm flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-lg relative z-10">
        <div className="flex items-center justify-center gap-2 text-2xl font-display mb-8 text-foreground">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Home className="w-5 h-5 text-primary-foreground" />
          </div>
          NomadNest
        </div>

        <Card variant="elevated" className="animate-scale-in">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">Complete your profile</CardTitle>
            <CardDescription>
              Add a few more details so others can get to know you
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {/* Avatar */}
            {user && (
              <div>
                <Label className="mb-3 block">Profile photo</Label>
                <AvatarUpload
                  userId={user.id}
                  firstName={fullName.split(" ")[0] || ""}
                  onUploadComplete={() => {}}
                />
              </div>
            )}

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                placeholder="Emma Thompson"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <Label htmlFor="bio">About you</Label>
              <Textarea
                id="bio"
                placeholder="Tell other members a bit about yourself..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="location"
                  placeholder="London, United Kingdom"
                  className="pl-10"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>

            {/* Geolocation for Nomads */}
            {isNomad && (
              <div className="space-y-2 p-4 rounded-lg border border-border bg-muted/30">
                <Label>Map location (for Find Nomads)</Label>
                <p className="text-xs text-muted-foreground">
                  Set your position so other nomads can find you on the map
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleGeolocate} disabled={isGeolocating}>
                    {isGeolocating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Navigation className="w-4 h-4 mr-2" />}
                    Use my location
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={geocodeFromLocation} disabled={isGeolocating || !location.trim()}>
                    <MapPin className="w-4 h-4 mr-2" />
                    Set from city
                  </Button>
                </div>
                {latitude && longitude && (
                  <p className="text-xs text-muted-foreground">
                    📍 Coordinates set ({latitude.toFixed(4)}, {longitude.toFixed(4)})
                  </p>
                )}
              </div>
            )}

            <Button
              onClick={handleSubmit}
              className="w-full h-12 group"
              disabled={isLoading || !fullName.trim()}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Save & continue
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CompleteProfile;
