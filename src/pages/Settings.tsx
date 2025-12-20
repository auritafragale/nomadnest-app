import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Save,
  Loader2,
  User,
  Bell,
  Shield,
  LogOut,
  Briefcase,
  Home,
  Mail,
  MessageSquare,
  FileText,
  Star,
  Camera,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/layout/Navbar";
import ImageUpload from "@/components/listing/ImageUpload";
import UpgradeRoleDialog from "@/components/dashboard/UpgradeRoleDialog";

interface Profile {
  first_name: string;
  last_name: string;
  avatar_url: string;
  city: string;
  country: string;
  email: string;
}

interface NotificationPreferences {
  email_new_applications: boolean;
  email_messages: boolean;
  email_sit_updates: boolean;
  email_reviews: boolean;
}

const Settings = () => {
  const navigate = useNavigate();
  const { user, role, signOut, refreshRole } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    first_name: "",
    last_name: "",
    avatar_url: "",
    city: "",
    country: "",
    email: "",
  });

  // Notification preferences (stored in localStorage for now)
  const [notifications, setNotifications] = useState<NotificationPreferences>({
    email_new_applications: true,
    email_messages: true,
    email_sit_updates: true,
    email_reviews: true,
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    fetchProfile();
    loadNotificationPreferences();
  }, [user, navigate]);

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url, city, country, email")
        .eq("id", user.id)
        .maybeSingle();

      if (data) {
        setProfile({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          avatar_url: data.avatar_url || "",
          city: data.city || "",
          country: data.country || "",
          email: data.email || user.email || "",
        });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadNotificationPreferences = () => {
    if (!user) return;
    const stored = localStorage.getItem(`notifications_${user.id}`);
    if (stored) {
      setNotifications(JSON.parse(stored));
    }
  };

  const saveNotificationPreferences = (prefs: NotificationPreferences) => {
    if (!user) return;
    localStorage.setItem(`notifications_${user.id}`, JSON.stringify(prefs));
    setNotifications(prefs);
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: profile.first_name,
          last_name: profile.last_name,
          avatar_url: profile.avatar_url,
          city: profile.city,
          country: profile.country,
        })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Settings saved!",
        description: "Your changes have been saved successfully",
      });
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast({
        title: "Error saving settings",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const getRoleLabel = () => {
    switch (role) {
      case "sitter":
        return "Pet Sitter";
      case "owner":
        return "Pet Owner";
      case "both":
        return "Pet Sitter & Owner";
      default:
        return "Unknown";
    }
  };

  const getRoleIcon = () => {
    switch (role) {
      case "sitter":
        return <Briefcase className="w-4 h-4" />;
      case "owner":
        return <Home className="w-4 h-4" />;
      case "both":
        return (
          <div className="flex items-center gap-1">
            <Briefcase className="w-4 h-4" />
            <Home className="w-4 h-4" />
          </div>
        );
      default:
        return <User className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 pb-12">
          <div className="container mx-auto px-4 max-w-3xl">
            <Skeleton className="h-8 w-48 mb-6" />
            <div className="space-y-6">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-20 pb-12">
        <div className="container mx-auto px-4 max-w-3xl">
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
              <h1 className="text-3xl font-display font-bold text-foreground">
                Settings
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your account and preferences
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Account Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Account
                </CardTitle>
                <CardDescription>
                  Your personal information and profile
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-6">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src={profile.avatar_url} />
                    <AvatarFallback>
                      <User className="w-8 h-8" />
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

                <Separator />

                {/* Name */}
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
                    />
                  </div>
                </div>

                {/* Email (read-only) */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Contact support to change your email address
                  </p>
                </div>

                {/* Location */}
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
                    />
                  </div>
                </div>

                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            {/* Role Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Role & Access
                </CardTitle>
                <CardDescription>
                  Manage how you use NomadNest
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">Current Role</p>
                    <p className="text-sm text-muted-foreground">
                      Your account type determines what features you can access
                    </p>
                  </div>
                  <Badge variant="secondary" className="gap-2 text-sm py-1.5 px-3">
                    {getRoleIcon()}
                    {getRoleLabel()}
                  </Badge>
                </div>

                <Separator />

                {/* Upgrade option for single-role users */}
                {(role === "sitter" || role === "owner") && (
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">Expand Your Role</p>
                      <p className="text-sm text-muted-foreground">
                        {role === "sitter"
                          ? "Add pet owner capabilities to find sitters for your own pets"
                          : "Add sitter capabilities to browse and apply for sits"}
                      </p>
                    </div>
                    <UpgradeRoleDialog
                      currentRole={role}
                      onUpgrade={() => refreshRole()}
                    />
                  </div>
                )}

                {role === "both" && (
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">
                      You have full access to both sitter and owner features. Use the
                      toggle on your dashboard to switch between modes.
                    </p>
                  </div>
                )}

                {/* Profile links */}
                <Separator />
                <div className="space-y-2">
                  <p className="font-medium text-sm">Edit Detailed Profiles</p>
                  <div className="flex flex-wrap gap-2">
                    {(role === "sitter" || role === "both") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/edit-sitter-profile")}
                      >
                        <Briefcase className="w-4 h-4 mr-2" />
                        Sitter Profile
                      </Button>
                    )}
                    {(role === "owner" || role === "both") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/edit-owner-profile")}
                      >
                        <Home className="w-4 h-4 mr-2" />
                        Owner Profile
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notification Preferences */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notifications
                </CardTitle>
                <CardDescription>
                  Choose what updates you want to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">New Applications</p>
                      <p className="text-sm text-muted-foreground">
                        When someone applies to your listing
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={notifications.email_new_applications}
                    onCheckedChange={(checked) =>
                      saveNotificationPreferences({
                        ...notifications,
                        email_new_applications: checked,
                      })
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Messages</p>
                      <p className="text-sm text-muted-foreground">
                        When you receive a new message
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={notifications.email_messages}
                    onCheckedChange={(checked) =>
                      saveNotificationPreferences({
                        ...notifications,
                        email_messages: checked,
                      })
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Home className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Sit Updates</p>
                      <p className="text-sm text-muted-foreground">
                        Status changes for your sits
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={notifications.email_sit_updates}
                    onCheckedChange={(checked) =>
                      saveNotificationPreferences({
                        ...notifications,
                        email_sit_updates: checked,
                      })
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Star className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Reviews</p>
                      <p className="text-sm text-muted-foreground">
                        When someone leaves you a review
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={notifications.email_reviews}
                    onCheckedChange={(checked) =>
                      saveNotificationPreferences({
                        ...notifications,
                        email_reviews: checked,
                      })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Sign out of your account on this device
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign Out
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Sign out?</AlertDialogTitle>
                        <AlertDialogDescription>
                          You will need to sign in again to access your account.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSignOut}>
                          Sign Out
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
