import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, Loader2, Tag, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";
import blackLogo from "@/assets/Black_Logo.png";
import whiteLogo from "@/assets/White_Logo.png";
import { z } from "zod";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

const Auth = () => {
  const [searchParams] = useSearchParams();
  const isSignup = searchParams.get("signup") === "true";
  const [mode, setMode] = useState<"login" | "signup" | "check_email">(isSignup ? "signup" : "login");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  
  const { signUp, signIn, user, onboardingCompleted, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme } = useTheme();
  const logo = theme === "dark" ? whiteLogo : blackLogo;

  // Redirect if already logged in - wait for loading to complete first
  useEffect(() => {
    if (loading) return; // Wait for auth state to be determined
    
    if (user) {
      if (onboardingCompleted) {
        navigate("/dashboard");
      } else {
        navigate("/onboarding");
      }
    }
  }, [user, onboardingCompleted, loading, navigate]);

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }
    
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    
    try {
      if (mode === "signup") {
        const { error } = await signUp(email, password, firstName, lastName);
        if (error) {
          if (error.message.includes("already registered")) {
            toast({
              variant: "destructive",
              title: "Account exists",
              description: "This email is already registered. Please log in instead.",
            });
          } else {
            toast({
              variant: "destructive",
              title: "Sign up failed",
              description: error.message,
            });
          }
        } else {
          // Stash the invite code so Onboarding can redeem it once the user
          // is fully authenticated (handles email-confirmation flows too).
          if (inviteCode.trim()) {
            sessionStorage.setItem("pendingInviteCode", inviteCode.trim().toUpperCase());
          }
          // Switch to the "check your email" holding state.
          // If auto-confirm is on the auth listener will fire and redirect
          // before the user even reads this screen — that's fine.
          setMode("check_email");
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          toast({
            variant: "destructive",
            title: "Login failed",
            description: "Invalid email or password. Please try again.",
          });
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!email) return;
    setIsLoading(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setIsLoading(false);
    if (error) {
      toast({ variant: "destructive", title: "Could not resend", description: error.message });
    } else {
      toast({ title: "Email resent", description: "Check your inbox again." });
    }
  };

  if (mode === "check_email") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#FAF7F2" }}>
        <div className="w-full max-w-sm">
          <Link to="/" className="flex items-center justify-center mb-8 hover:opacity-80 transition-opacity">
            <img src={logo} alt="NomadNest" className="h-10 w-auto" />
          </Link>
          <Card variant="elevated" className="animate-scale-in">
            <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-1">Check your email</h2>
                <p className="text-sm text-muted-foreground">
                  We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back here to log in.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleResendConfirmation}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Resend confirmation email"}
              </Button>
              <button
                className="text-sm text-primary hover:underline"
                onClick={() => setMode("login")}
              >
                Back to login
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#FAF7F2" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center justify-center mb-8 hover:opacity-80 transition-opacity"
        >
          <img src={logo} alt="NomadNest" className="h-10 w-auto" />
        </Link>

        <Card variant="elevated" className="animate-scale-in">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">
              {mode === "login" ? "Welcome back" : "Create your profile"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Log in to continue your pet sitting journey"
                : "Join thousands of pet lovers worldwide"
              }
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {/* Email Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        id="firstName" 
                        placeholder="Emma" 
                        className="pl-10"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input 
                      id="lastName" 
                      placeholder="Thompson"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="you@example.com" 
                    className="pl-10"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors(prev => ({ ...prev, email: undefined }));
                    }}
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••" 
                    className="pl-10 pr-10"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors(prev => ({ ...prev, password: undefined }));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>

              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">Have an invite code? (optional)</Label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="inviteCode"
                      placeholder="NOMADNEST2024"
                      className="pl-10 uppercase"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Founding members get free lifetime combined membership.
                  </p>
                </div>
              )}

              {mode === "login" && (
                <div className="text-right">
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
              )}

              <Button type="submit" className="w-full h-12 group text-white" style={{ backgroundColor: "#E8735A" }} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {mode === "login" ? "Log in" : "Create account"}
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </form>

            {/* Toggle mode */}
            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    onClick={() => setMode("signup")}
                    className="text-primary font-medium hover:underline"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    onClick={() => setMode("login")}
                    className="text-primary font-medium hover:underline"
                  >
                    Log in
                  </button>
                </>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Continue as guest */}
        <p className="text-center text-sm text-muted-foreground mt-5">
          <Link to="/browse-sits" className="underline hover:text-foreground">
            Continue as Guest
          </Link>
        </p>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          By continuing, you agree to our{" "}
          <Link to="/terms" className="underline hover:text-foreground">Terms</Link>
          {" "}and{" "}
          <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
};

export default Auth;
