import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Save,
  Loader2,
  User,
  Phone,
  FileText,
  Camera,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/layout/Navbar";
import ImageUpload from "@/components/listing/ImageUpload";
import { OWNER_PROFILE_COLUMNS } from "@/lib/profileColumns";

interface Profile {
  first_name: string;
  last_name: string;
  avatar_url: string;
  city: string;
  country: string;
}

interface OwnerProfile {
  bio: string;
  phone: string;
}

const EditOwnerProfile = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    first_name: "",
    last_name: "",
    avatar_url: "",
    city: "",
    country: "",
  });
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile>({
    bio: "",
    phone: "",
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (role !== "owner" && role !== "both") {
      toast({
        title: "Access denied",
        description: "Only owners can access this page",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }

    fetchProfiles();
  }, [user, role, navigate]);

  const fetchProfiles = async () => {
    if (!user) return;

    try {
      // Fetch main profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url, city, country")
        .eq("id", user.id)
        .maybeSingle();

      if (profileData) {
        setProfile({
          first_name: profileData.first_name || "",
          last_name: profileData.last_name || "",
          avatar_url: profileData.avatar_url || "",
          city: profileData.city || "",
          country: profileData.country || "",
        });
      }

      // Fetch owner profile
      const { data: ownerData } = await supabase
        .from("owner_profiles")
        .select(OWNER_PROFILE_COLUMNS as "*")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: contact } = await supabase.rpc("get_my_contact_info").maybeSingle();

      if (ownerData) {
        setOwnerProfile({
          bio: ownerData.bio || "",
          phone: (contact as any)?.owner_phone || "",
        });
      }
    } catch (error) {
      console.error("Error fetching profiles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);

    try {
      // Update main profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: profile.first_name,
          last_name: profile.last_name,
          avatar_url: profile.avatar_url,
          city: profile.city,
          country: profile.country,
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Upsert owner profile
      const { error: ownerError } = await supabase
        .from("owner_profiles")
        .upsert(
          {
            user_id: user.id,
            bio: ownerProfile.bio || null,
            phone: ownerProfile.phone || null,
          },
          { onConflict: "user_id" }
        );

      if (ownerError) throw ownerError;

      toast({
        title: "Profile saved!",
        description: "Your changes have been saved successfully",
      });
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast({
        title: "Error saving profile",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 pb-12">
          <div className="container mx-auto px-4 max-w-2xl">
            <Skeleton className="h-8 w-48 mb-6" />
            <Skeleton className="h-96 w-full" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-20 pb-12">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <Button
                variant="ghost"
                onClick={() => navigate("/dashboard")}
                className="mb-2"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                Edit Pet Parent Profile
              </h1>
              <p className="text-muted-foreground mt-1">
                Update your profile information
              </p>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>

          <div className="space-y-6">
            {/* Profile Photo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Profile Photo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={profile.avatar_url} />
                    <AvatarFallback>
                      <User className="w-10 h-10" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <ImageUpload
                      images={profile.avatar_url ? [profile.avatar_url] : []}
                      onImagesChange={(urls) =>
                        setProfile((prev) => ({
                          ...prev,
                          avatar_url: urls[0] || "",
                        }))
                      }
                      maxImages={1}
                      folder="avatar"
                      label="Profile Photo"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name</Label>
                    <Input
                      id="first_name"
                      value={profile.first_name}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          first_name: e.target.value,
                        }))
                      }
                      placeholder="Your first name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      value={profile.last_name}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          last_name: e.target.value,
                        }))
                      }
                      placeholder="Your last name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={profile.city}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          city: e.target.value,
                        }))
                      }
                      placeholder="Your city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={profile.country}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          country: e.target.value,
                        }))
                      }
                      placeholder="Your country"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="w-5 h-5" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={ownerProfile.phone}
                    onChange={(e) =>
                      setOwnerProfile((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    placeholder="+1 234 567 8900"
                  />
                  <p className="text-sm text-muted-foreground">
                    Your phone number will only be shared with confirmed sitters
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Bio */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  About You
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={ownerProfile.bio}
                    onChange={(e) =>
                      setOwnerProfile((prev) => ({
                        ...prev,
                        bio: e.target.value,
                      }))
                    }
                    placeholder="Tell sitters a bit about yourself, your home, and your pets..."
                    rows={6}
                  />
                  <p className="text-sm text-muted-foreground">
                    This helps sitters get to know you and feel more comfortable
                    applying for your sits
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom Save Button */}
          <div className="mt-8 flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default EditOwnerProfile;
