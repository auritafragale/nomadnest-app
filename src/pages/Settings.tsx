import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { startWalkthrough } from "@/components/walkthrough/GuidedWalkthrough";
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
  Loader2,
  Bell,
  Shield,
  Compass,
  Briefcase,
  Home,
  MessageSquare,
  FileText,
  Star,
  Trash2,
  AlertTriangle,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Phone,
  Crown,
  ChevronDown,
} from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/layout/Navbar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import UpgradeRoleDialog from "@/components/dashboard/UpgradeRoleDialog";
import { useNotificationPreferences, useUpdateNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { useProfileVisibility, useUpdateProfileVisibility } from "@/hooks/useProfileVisibility";
import PushNotificationSettings from "@/components/settings/PushNotificationSettings";
import { useVerification } from "@/hooks/useVerification";
import { PhoneVerification } from "@/components/settings/PhoneVerification";

interface Profile {
  email: string;
}

const Settings = () => {
  const navigate = useNavigate();
  const { user, role, refreshRole } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile>({
    email: "",
  });
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  
  // Email change state
  const [newEmail, setNewEmail] = useState("");
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);
  
  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);

  // Use DB-based notification preferences
  const { data: notifications, isLoading: notificationsLoading } = useNotificationPreferences();
  const updateNotifications = useUpdateNotificationPreferences();
  const deleteAccount = useDeleteAccount();
  
  // Profile visibility
  const { data: profileVisibility, isLoading: visibilityLoading } = useProfileVisibility();
  const updateVisibility = useUpdateProfileVisibility();

  // Identity verification
  const { data: verificationData } = useVerification();

  // Phone verification state (loaded alongside profile)
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchProfile();
  }, [user, navigate]);

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data: contact } = await supabase.rpc("get_my_contact_info").maybeSingle();
      setProfile({ email: (contact as any)?.email || user.email || "" });
      setPhoneVerified(!!(contact as any)?.phone_verified);
      setPhoneNumber((contact as any)?.phone_number ?? null);
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationChange = (key: string, value: boolean) => {
    updateNotifications.mutate({ [key]: value });
  };

  const handleEmailChange = async () => {
    if (!newEmail) {
      toast({
        title: "Email required",
        description: "Please enter a new email address",
        variant: "destructive",
      });
      return;
    }

    setEmailChangeLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (error) throw error;

      toast({
        title: "Verification email sent",
        description: "Please check both your old and new email to confirm the change",
      });
      setNewEmail("");
    } catch (error: any) {
      console.error("Error changing email:", error);
      toast({
        title: "Error changing email",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setEmailChangeLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!newPassword || !confirmPassword) {
      toast({
        title: "Password required",
        description: "Please enter and confirm your new password",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    setPasswordChangeLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully",
      });
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error("Error changing password:", error);
      toast({
        title: "Error changing password",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setPasswordChangeLoading(false);
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
          <Breadcrumbs />
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
                Settings
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your account and preferences
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {(role === "sitter" || role === "owner") && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-primary" />
                    Membership
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">Upgrade to Combined</p>
                    <p className="text-sm text-muted-foreground">
                      {role === "sitter"
                        ? "Add Pet Parent access to list your home and pets."
                        : "Add Nomad access to browse and apply for sits."}
                    </p>
                  </div>
                  <UpgradeRoleDialog currentRole={role} onUpgrade={() => refreshRole()} />
                </CardContent>
              </Card>
            )}

            {/* Login & Security */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5" />
                  Login &amp; Security
                  <HelpTooltip label="About login and security" content="Update your email address or account password" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="email">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="email" className="gap-2"><Mail className="h-4 w-4" />Email</TabsTrigger>
                    <TabsTrigger value="password" className="gap-2"><Lock className="h-4 w-4" />Password</TabsTrigger>
                  </TabsList>
                  <TabsContent value="email" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Current Email</Label>
                  <div className="flex items-center gap-2">
                    <Input value={profile.email} disabled className="bg-muted flex-1" />
                    {user?.email_confirmed_at ? (
                      <Badge className="gap-1 bg-blue-50 text-blue-600 border border-blue-300 dark:bg-blue-950 dark:text-blue-400 whitespace-nowrap">
                        <Mail className="w-3 h-3" />
                        Email Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-muted-foreground whitespace-nowrap">
                        <Mail className="w-3 h-3" />
                        Not Verified
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_email">New Email</Label>
                  <Input
                    id="new_email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Enter new email address"
                  />
                  <p className="text-xs text-muted-foreground">
                    You'll receive a confirmation email at both addresses
                  </p>
                </div>
                <Button 
                  onClick={handleEmailChange} 
                  disabled={emailChangeLoading || !newEmail}
                >
                  {emailChangeLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  Update Email
                </Button>
                  </TabsContent>
                  <TabsContent value="password" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="new_password">New Password</Label>
                  <Input
                    id="new_password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirm New Password</Label>
                  <Input
                    id="confirm_password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 6 characters
                  </p>
                </div>
                <Button 
                  onClick={handlePasswordChange} 
                  disabled={passwordChangeLoading || !newPassword || !confirmPassword}
                >
                  {passwordChangeLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4 mr-2" />
                  )}
                  Update Password
                </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Verification */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  Verification
                  <HelpTooltip label="About verification" content="Manage your identity and phone verification" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="identity">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="identity" className="gap-2"><ShieldCheck className="h-4 w-4" />Identity</TabsTrigger>
                    <TabsTrigger value="phone" className="gap-2"><Phone className="h-4 w-4" />Phone</TabsTrigger>
                  </TabsList>
                  <TabsContent value="identity" className="pt-4">
                    {verificationData?.id_verified ? (
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                        <div>
                          <p className="font-medium text-green-700 dark:text-green-400">Identity Verified</p>
                          <p className="text-sm text-muted-foreground">Your identity has been verified successfully.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">Not Verified</p>
                          <p className="text-sm text-muted-foreground">Verify your identity to apply for sits and create listings.</p>
                        </div>
                        <Button onClick={() => navigate("/verify-identity")} className="shrink-0">
                          <ShieldCheck className="w-4 h-4 mr-2" />Verify Now
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="phone" className="pt-4">
                    <PhoneVerification
                      phoneVerified={phoneVerified}
                      phoneNumber={phoneNumber}
                      onVerified={() => { setPhoneVerified(true); fetchProfile(); }}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Founder admin panel */}
            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    Founder Admin
                  </CardTitle>
                  <CardDescription>
                    Verifications, member perks, email templates and community stats
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => navigate("/admin")} className="w-full sm:w-auto">
                    Open admin panel
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Profile Visibility */}
            <Collapsible asChild>
              <Card className="group">
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-between p-0 text-left hover:bg-transparent" aria-label="Toggle profile visibility settings">
                      <CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5" />Profile Visibility</CardTitle>
                      <ChevronDown className="h-5 w-5 transition-transform group-data-[state=open]:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                  <HelpTooltip label="About profile visibility" content="Control whether your profiles are visible to others. Pausing hides your profile from search and maps, but keeps your data." />
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                {visibilityLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (
                  <>
                    {profileVisibility?.hasSitterProfile && (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Briefcase className="w-5 h-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">Nomad Profile</p>
                              <p className="text-sm text-muted-foreground">
                                {profileVisibility.sitterProfileActive
                                  ? "Your Nomad profile is visible to Pet Parents"
                                  : "Your Nomad profile is hidden from search results"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {profileVisibility.sitterProfileActive ? (
                              <Badge variant="secondary" className="gap-1">
                                <Eye className="w-3 h-3" />
                                Visible
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-muted-foreground">
                                <EyeOff className="w-3 h-3" />
                                Hidden
                              </Badge>
                            )}
                            <Switch
                              checked={profileVisibility.sitterProfileActive ?? false}
                              onCheckedChange={(checked) =>
                                updateVisibility.mutate({ profileType: "sitter", isActive: checked })
                              }
                              disabled={updateVisibility.isPending}
                            />
                          </div>
                        </div>
                        {profileVisibility?.hasOwnerProfile && <Separator />}
                      </>
                    )}

                    {profileVisibility?.hasOwnerProfile && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Home className="w-5 h-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Pet Parent Profile & Listings</p>
                            <p className="text-sm text-muted-foreground">
                              {profileVisibility.ownerProfileActive
                                ? "Your listings are visible to pet sitters"
                                : "Your listings are hidden from search results"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {profileVisibility.ownerProfileActive ? (
                            <Badge variant="secondary" className="gap-1">
                              <Eye className="w-3 h-3" />
                              Visible
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <EyeOff className="w-3 h-3" />
                              Hidden
                            </Badge>
                          )}
                          <Switch
                            checked={profileVisibility.ownerProfileActive ?? false}
                            onCheckedChange={(checked) =>
                              updateVisibility.mutate({ profileType: "owner", isActive: checked })
                            }
                            disabled={updateVisibility.isPending}
                          />
                        </div>
                      </div>
                    )}

                    {!profileVisibility?.hasSitterProfile && !profileVisibility?.hasOwnerProfile && (
                      <div className="text-center py-4 text-muted-foreground">
                        <p>No profiles found. Complete your profile setup first.</p>
                      </div>
                    )}

                    <div className="bg-muted/50 rounded-lg p-4 mt-4">
                      <p className="text-sm text-muted-foreground">
                        <strong>Note:</strong> Pausing your profile will hide it from search results and browse pages.
                        Existing conversations and confirmed sits will not be affected.
                      </p>
                    </div>
                  </>
                )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Notification Preferences */}
            <Collapsible asChild>
              <Card className="group">
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-between p-0 text-left hover:bg-transparent" aria-label="Toggle notification settings">
                      <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5" />Notifications</CardTitle>
                      <ChevronDown className="h-5 w-5 transition-transform group-data-[state=open]:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                  <HelpTooltip label="About notifications" content="Choose what updates you want to receive" />
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                {/* Push Notifications */}
                <PushNotificationSettings />
                
                <Separator />

                {notificationsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">Email Notifications</p>
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
                        checked={notifications?.email_new_applications ?? true}
                        onCheckedChange={(checked) =>
                          handleNotificationChange("email_new_applications", checked)
                        }
                        disabled={updateNotifications.isPending}
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
                        checked={notifications?.email_messages ?? true}
                        onCheckedChange={(checked) =>
                          handleNotificationChange("email_messages", checked)
                        }
                        disabled={updateNotifications.isPending}
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
                        checked={notifications?.email_sit_updates ?? true}
                        onCheckedChange={(checked) =>
                          handleNotificationChange("email_sit_updates", checked)
                        }
                        disabled={updateNotifications.isPending}
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
                        checked={notifications?.email_reviews ?? true}
                        onCheckedChange={(checked) =>
                          handleNotificationChange("email_reviews", checked)
                        }
                        disabled={updateNotifications.isPending}
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Bell className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Application Status</p>
                          <p className="text-sm text-muted-foreground">
                            When your applications are accepted or declined
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={notifications?.email_application_status ?? true}
                        onCheckedChange={(checked) =>
                          handleNotificationChange("email_application_status", checked)
                        }
                        disabled={updateNotifications.isPending}
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Crown className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Membership</p>
                          <p className="text-sm text-muted-foreground">
                            Payment confirmations, renewals and membership updates
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={notifications?.email_membership ?? true}
                        onCheckedChange={(checked) =>
                          handleNotificationChange("email_membership", checked)
                        }
                        disabled={updateNotifications.isPending}
                      />
                    </div>
                  </>
                )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Guided walkthrough */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Compass className="w-5 h-5" />
                  App walkthrough
                  <HelpTooltip label="About the app walkthrough" content="A quick 5-step tour of browsing, applying, messaging, reviews and settings" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    Replay the guided walkthrough at any time
                  </p>
                  <Button variant="outline" onClick={startWalkthrough}>
                    Replay tour
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone - Delete Account */}
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  Danger Zone
                  <HelpTooltip label="About the danger zone" content="Irreversible and destructive actions" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium">Delete Account</h4>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete your account and all associated data. This action
                      cannot be undone.
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-4">
                          <p>
                            This will permanently delete your account and all data including:
                          </p>
                          <ul className="list-disc list-inside text-sm space-y-1">
                            <li>All your listings and applications</li>
                            <li>All your messages and conversations</li>
                            <li>All your reviews and favorites</li>
                            <li>Your sitter and owner profiles</li>
                          </ul>
                          <p className="font-medium">
                            Type "DELETE" to confirm:
                          </p>
                          <Input
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder="Type DELETE"
                          />
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteAccount.mutate()}
                          disabled={deleteConfirmText !== "DELETE" || deleteAccount.isPending}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {deleteAccount.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 mr-2" />
                          )}
                          Delete Account
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
