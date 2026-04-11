import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Home, ArrowRight, MapPin, Loader2 } from "lucide-react";
import { AvatarUpload } from "@/components/onboarding/AvatarUpload";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CompleteProfile = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }

    // Pre-fill from existing profile
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
