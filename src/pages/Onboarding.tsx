import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Home, ArrowRight, ArrowLeft, User, Users, Briefcase, 
  Cat, Dog, Rabbit, MapPin, Calendar, Check, Loader2
} from "lucide-react";
import { AvatarUpload } from "@/components/onboarding/AvatarUpload";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import GoogleMapsProvider from "@/components/maps/GoogleMapsProvider";
import PlacesAutocompleteField from "@/components/maps/PlacesAutocompleteField";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { geocodeCityCountry } from "@/lib/geocode";

type Step = 1 | 2 | 3 | 4 | 5 | 6;
type RoleChoice = "sitter" | "owner" | "both";

const Onboarding = () => {
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { user, refreshRole, onboardingCompleted, loading, roleLoading } = useAuth();
  const { toast } = useToast();
  const { data: mapsConfig } = useGoogleMapsKey();

  // Form state
  const [roleChoice, setRoleChoice] = useState<RoleChoice | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  
  // Sitter preferences
  const [petTypes, setPetTypes] = useState<string[]>([]);
  const [sitStyle, setSitStyle] = useState<string>("");
  const [availabilityType, setAvailabilityType] = useState<string>("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableTo, setAvailableTo] = useState("");
  
  // Owner preferences
  const [wantsToCreateListing, setWantsToCreateListing] = useState<boolean | null>(null);

  // Redirect if not logged in, or if already onboarded
  useEffect(() => {
    if (loading || roleLoading) return; // Wait for auth state and role to be determined

    if (!user) {
      navigate("/auth");
    } else if (onboardingCompleted) {
      navigate("/dashboard");
    }
  }, [user, onboardingCompleted, loading, roleLoading, navigate]);

  // Pre-fill from profile if available
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, country, city")
        .eq("id", user.id)
        .maybeSingle();
      
      if (data) {
        setFirstName(data.first_name || "");
        setLastName(data.last_name || "");
        setCountry(data.country || "");
        setCity(data.city || "");
      }
    };
    
    fetchProfile();
  }, [user]);

  const handleNext = () => {
    if (step < 6) setStep((step + 1) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleComplete = async () => {
    if (!user || !roleChoice) return;
    
    setIsLoading(true);
    
    try {
      // Update profile
      await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          country,
          city,
        })
        .eq("id", user.id);

      // Create or update user role
      await supabase
        .from("user_roles")
        .upsert({
          user_id: user.id,
          role: roleChoice,
          onboarding_completed: true,
        }, { onConflict: 'user_id' });

      // Create sitter profile if applicable
      if (roleChoice === "sitter" || roleChoice === "both") {
        // Geocode city/country so the new nomad shows up on the Browse Nomads map.
        const coords = mapsConfig?.key
          ? await geocodeCityCountry(mapsConfig.key, city, country)
          : null;

        await supabase
          .from("sitter_profiles")
          .upsert({
            user_id: user.id,
            pet_types: petTypes,
            sit_style: sitStyle,
            availability_type: availabilityType,
            available_from: availableFrom || null,
            available_to: availableTo || null,
            ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
          }, { onConflict: 'user_id' });
      }

      // Create owner profile if applicable
      if (roleChoice === "owner" || roleChoice === "both") {
        await supabase
          .from("owner_profiles")
          .upsert({
            user_id: user.id,
          }, { onConflict: 'user_id' });
      }

      await refreshRole();

      // Redeem a pending invite code if one was stashed during signup.
      const pendingCode = sessionStorage.getItem("pendingInviteCode");
      if (pendingCode) {
        sessionStorage.removeItem("pendingInviteCode");
        const { data: codeResult, error: codeError } = await supabase.rpc(
          "redeem_founding_member_code",
          { p_code: pendingCode, p_user_id: user.id }
        );

        if (codeError) {
          toast({
            variant: "destructive",
            title: "Invite code error",
            description: "Your invite code could not be applied. Contact support if you need help.",
          });
        } else if (codeResult === "ok") {
          toast({
            title: "Founding Member unlocked!",
            description: "You have free lifetime combined membership. Welcome aboard!",
          });
        } else if (codeResult === "exhausted") {
          toast({
            variant: "destructive",
            title: "All founding spots claimed",
            description: "The code was valid but all 900 spots are taken. You can join with a paid plan.",
          });
        } else {
          toast({
            variant: "destructive",
            title: "Invalid invite code",
            description: "That code wasn't recognised. You can enter a valid code later in Settings.",
          });
        }
      } else {
        toast({
          title: "You're in!",
          description: "Your profile is ready. Welcome to NomadNest!",
        });
      }

      navigate("/dashboard");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePetType = (type: string) => {
    setPetTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type) 
        : [...prev, type]
    );
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6 text-center">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
              <Home className="w-10 h-10 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl mb-2">Welcome to NomadNest</CardTitle>
              <CardDescription className="text-base">
                Let's set up your account in under 2 minutes.
              </CardDescription>
            </div>
            <Button onClick={handleNext} className="w-full h-12">
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <CardTitle className="text-xl mb-2">How will you use NomadNest?</CardTitle>
              <CardDescription>You can change this later in Settings.</CardDescription>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={() => setRoleChoice("sitter")}
                className={cn(
                  "w-full p-4 rounded-xl border-2 text-left transition-all",
                  roleChoice === "sitter" 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    roleChoice === "sitter" ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">Nomad</p>
                    <p className="text-sm text-muted-foreground">I travel and offer pet sitting</p>
                  </div>
                  {roleChoice === "sitter" && <Check className="w-5 h-5 text-primary ml-auto" />}
                </div>
              </button>

              <button
                onClick={() => setRoleChoice("owner")}
                className={cn(
                  "w-full p-4 rounded-xl border-2 text-left transition-all",
                  roleChoice === "owner" 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    roleChoice === "owner" ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">Pet Parent</p>
                    <p className="text-sm text-muted-foreground">I need a sitter for my pets</p>
                  </div>
                  {roleChoice === "owner" && <Check className="w-5 h-5 text-primary ml-auto" />}
                </div>
              </button>

              <button
                onClick={() => setRoleChoice("both")}
                className={cn(
                  "w-full p-4 rounded-xl border-2 text-left transition-all",
                  roleChoice === "both" 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    roleChoice === "both" ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">Combined</p>
                    <p className="text-sm text-muted-foreground">I do both — sit and need sitters</p>
                  </div>
                  {roleChoice === "both" && <Check className="w-5 h-5 text-primary ml-auto" />}
                </div>
              </button>
            </div>

            <Button 
              onClick={handleNext} 
              className="w-full h-12"
              disabled={!roleChoice}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        );

      case 3:
        return (
          <GoogleMapsProvider height="520px">
            <div className="space-y-6">
              <div className="text-center">
                <CardTitle className="text-xl mb-2">Your basics</CardTitle>
                <CardDescription>Tell us a bit about yourself.</CardDescription>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Emma"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Thompson"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <PlacesAutocompleteField
                    id="country"
                    value={country}
                    onChange={setCountry}
                    onSelect={(place) => {
                      setCountry(place.country || place.description);
                    }}
                    types={["country"]}
                    placeholder="United Kingdom"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <PlacesAutocompleteField
                    id="city"
                    value={city}
                    onChange={setCity}
                    onSelect={(place) => {
                      if (place.city) setCity(place.city);
                      if (!country && place.country) setCountry(place.country);
                    }}
                    types={["(cities)"]}
                    placeholder="London"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="flex-1 h-12">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleNext}
                  className="flex-1 h-12"
                  disabled={!firstName || !lastName}
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </GoogleMapsProvider>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <CardTitle className="text-xl mb-2">Add a profile photo</CardTitle>
              <CardDescription>Clear, friendly photos build trust quickly.</CardDescription>
            </div>
            
            {user && (
              <AvatarUpload
                userId={user.id}
                firstName={firstName}
                onUploadComplete={() => {}}
              />
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack} className="flex-1 h-12">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleNext} className="flex-1 h-12">
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 5:
        if (roleChoice === "sitter" || roleChoice === "both") {
          return (
            <div className="space-y-6">
              <div className="text-center">
                <CardTitle className="text-xl mb-2">Quick preferences</CardTitle>
                <CardDescription>What sits are you open to?</CardDescription>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label className="mb-3 block">Pet types (select all that apply)</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "cats", label: "Cats", icon: Cat },
                      { value: "dogs", label: "Dogs", icon: Dog },
                      { value: "small_pets", label: "Small pets", icon: Rabbit },
                      { value: "farm", label: "Farm animals", icon: Home },
                      { value: "exotic", label: "Exotics", icon: Rabbit },
                    ].map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => togglePetType(value)}
                        className={cn(
                          "px-4 py-2 rounded-full border text-sm font-medium transition-all flex items-center gap-2",
                          petTypes.includes(value)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:border-primary/50"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="mb-3 block">Do you usually sit as…</Label>
                  <div className="flex flex-wrap gap-2">
                    {["Solo", "Couple", "Friends", "Family"].map((style) => (
                      <button
                        key={style}
                        onClick={() => setSitStyle(style.toLowerCase())}
                        className={cn(
                          "px-4 py-2 rounded-full border text-sm font-medium transition-all",
                          sitStyle === style.toLowerCase()
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:border-primary/50"
                        )}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="mb-3 block">Your availability</Label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setAvailabilityType("dates")}
                      className={cn(
                        "px-4 py-2 rounded-full border text-sm font-medium transition-all flex items-center gap-2",
                        availabilityType === "dates"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-primary/50"
                      )}
                    >
                      <Calendar className="w-4 h-4" />
                      I have dates in mind
                    </button>
                    <button
                      onClick={() => setAvailabilityType("flexible")}
                      className={cn(
                        "px-4 py-2 rounded-full border text-sm font-medium transition-all",
                        availabilityType === "flexible"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-primary/50"
                      )}
                    >
                      I'm flexible
                    </button>
                  </div>
                </div>

                {availabilityType === "dates" && (
                  <div className="grid grid-cols-2 gap-4 animate-fade-in">
                    <div className="space-y-2">
                      <Label htmlFor="availableFrom">Available from</Label>
                      <Input 
                        id="availableFrom"
                        type="date"
                        value={availableFrom}
                        onChange={(e) => setAvailableFrom(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="availableTo">Available to</Label>
                      <Input 
                        id="availableTo"
                        type="date"
                        value={availableTo}
                        onChange={(e) => setAvailableTo(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="flex-1 h-12">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleNext} className="flex-1 h-12">
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          );
        } else {
          // Owner-specific step
          return (
            <div className="space-y-6">
              <div className="text-center">
                <CardTitle className="text-xl mb-2">Ready to post a sit?</CardTitle>
                <CardDescription>Are you here to post a sit now?</CardDescription>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={() => setWantsToCreateListing(true)}
                  className={cn(
                    "w-full p-4 rounded-xl border-2 text-left transition-all",
                    wantsToCreateListing === true
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      wantsToCreateListing === true ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      <Check className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium">Yes, I want to create a listing</p>
                      <p className="text-sm text-muted-foreground">I'll set up my sit right after</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setWantsToCreateListing(false)}
                  className={cn(
                    "w-full p-4 rounded-xl border-2 text-left transition-all",
                    wantsToCreateListing === false
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      wantsToCreateListing === false ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium">Not yet, just exploring</p>
                      <p className="text-sm text-muted-foreground">I'll look around first</p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="flex-1 h-12">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleNext} className="flex-1 h-12">
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          );
        }

      case 6:
        return (
          <div className="space-y-6 text-center">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-accent/20 flex items-center justify-center">
              <span className="text-4xl">🎉</span>
            </div>
            <div>
              <CardTitle className="text-2xl mb-2">You're in!</CardTitle>
              <CardDescription className="text-base">
                Your profile is ready to complete anytime — the more detail, the better matches.
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pb-8">
              <Button 
                variant="outline" 
                onClick={handleComplete} 
                className="w-full sm:flex-1 h-12"
                disabled={isLoading}
              >
                Go to dashboard
              </Button>
              <Button 
                onClick={handleComplete} 
                className="w-full sm:flex-1 h-12"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Complete my profile
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        );
    }
  };

  // Progress indicator
  const progress = ((step - 1) / 5) * 100;

  return (
    <div className="min-h-screen bg-gradient-warm flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-2 text-center">
            Step {step} of 6
          </p>
        </div>

        <Card variant="elevated" className="animate-scale-in">
          <CardContent className="pt-6">
            {renderStep()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Onboarding;
