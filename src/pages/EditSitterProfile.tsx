import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Save,
  Loader2,
  User,
  Calendar as CalendarIcon,
  MapPin,
  Languages,
  Heart,
  Home,
  Camera,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/layout/Navbar";
import ImageUpload from "@/components/listing/ImageUpload";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { geocodeCityCountry } from "@/lib/geocode";
import PlacesAutocompleteField from "@/components/maps/PlacesAutocompleteField";
import { SITTER_PROFILE_COLUMNS } from "@/lib/profileColumns";
import { PET_TYPE_OPTIONS, formatPetType, canonicalPetType } from "@/lib/petTypes";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

interface Profile {
  first_name: string;
  last_name: string;
  avatar_url: string;
  city: string;
  country: string;
}

interface SitterProfile {
  headline: string;
  bio: string;
  why_i_sit: string;
  experience_level: string;
  experience_details: string;
  languages: string[];
  pet_types: string[];
  comfortable_with: string[];
  sit_style: string;
  home_preferences: string[];
  house_rules_compatibility: string[];
  availability_type: string;
  available_from: string;
  available_to: string;
  preferred_regions: string[];
  preferred_countries: string[];
  preferred_cities: string[];
  phone: string;
  gallery: string[];
  age_range: string;
}

const experienceLevels = [
  { value: "beginner", label: "Beginner (0-5 sits)" },
  { value: "intermediate", label: "Intermediate (5-15 sits)" },
  { value: "experienced", label: "Experienced (15-30 sits)" },
  { value: "expert", label: "Expert (30+ sits)" },
];

const languageOptions = [
  "English", "Spanish", "French", "German", "Portuguese", "Italian",
  "Dutch", "Japanese", "Mandarin", "Korean", "Arabic", "Russian",
];

const petTypeOptions = PET_TYPE_OPTIONS;

const comfortableWithOptions = [
  "Puppies/Kittens",
  "Senior pets",
  "Pets with medication",
  "Anxious pets",
  "Multiple pets",
  "Large dogs",
  "Exotic pets",
];

const sitStyleOptions = [
  { value: "homebody", label: "Homebody - I prefer staying in most of the time" },
  { value: "explorer", label: "Explorer - I like to go out and explore the area" },
  { value: "balanced", label: "Balanced - Mix of staying in and going out" },
];

const homePreferenceOptions = [
  "House with garden",
  "Apartment",
  "Rural/countryside",
  "City center",
  "Near public transport",
  "Near nature/trails",
];

const ageRangeOptions = [
  { value: "18-25", label: "18-25" },
  { value: "26-35", label: "26-35" },
  { value: "36-45", label: "36-45" },
  { value: "46-55", label: "46-55" },
  { value: "56-65", label: "56-65" },
  { value: "65+", label: "65+" },
];

const EditSitterProfile = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const { data: mapsConfig } = useGoogleMapsKey();
  // Coordinates captured when a city is chosen from the suggestions; saved
  // directly so the nomad map does not depend on a later lookup.
  const [pickedCoords, setPickedCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    first_name: "",
    last_name: "",
    avatar_url: "",
    city: "",
    country: "",
  });
  const [sitterProfile, setSitterProfile] = useState<SitterProfile>({
    headline: "",
    bio: "",
    why_i_sit: "",
    experience_level: "",
    experience_details: "",
    languages: [],
    pet_types: [],
    comfortable_with: [],
    sit_style: "",
    home_preferences: [],
    house_rules_compatibility: [],
    availability_type: "flexible",
    available_from: "",
    available_to: "",
    preferred_regions: [],
    preferred_countries: [],
    preferred_cities: [],
    phone: "",
    gallery: [],
    age_range: "",
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (role !== "sitter" && role !== "both") {
      toast({
        title: "Access denied",
        description: "Only sitters can access this page",
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

      // Fetch sitter profile
      const { data: sitterData } = await supabase
        .from("sitter_profiles")
        .select(SITTER_PROFILE_COLUMNS as "*")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: contact } = await supabase.rpc("get_my_contact_info").maybeSingle();
      const sitterPhone = (contact as any)?.sitter_phone || "";


      if (sitterData) {
        setSitterProfile({
          headline: sitterData.headline || "",
          bio: sitterData.bio || "",
          why_i_sit: sitterData.why_i_sit || "",
          experience_level: sitterData.experience_level || "",
          experience_details: sitterData.experience_details || "",
          languages: sitterData.languages || [],
          pet_types: sitterData.pet_types || [],
          comfortable_with: sitterData.comfortable_with || [],
          sit_style: sitterData.sit_style || "",
          home_preferences: sitterData.home_preferences || [],
          house_rules_compatibility: sitterData.house_rules_compatibility || [],
          availability_type: sitterData.availability_type || "flexible",
          available_from: sitterData.available_from || "",
          available_to: sitterData.available_to || "",
          preferred_regions: sitterData.preferred_regions || [],
          preferred_countries: sitterData.preferred_countries || [],
          preferred_cities: sitterData.preferred_cities || [],
          phone: sitterPhone,
          gallery: sitterData.gallery || [],
          age_range: sitterData.age_range || "",
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

      // Auto-create a city chat room for this city if one doesn't exist yet.
      if (profile.city.trim() && profile.country.trim()) {
        const cityKey = `${profile.city.trim().toLowerCase()}-${profile.country.trim().toLowerCase()}`;
        await supabase
          .from("city_chat_rooms")
          .upsert(
            {
              city: profile.city.trim(),
              country: profile.country.trim(),
              city_key: cityKey,
            },
            { onConflict: "city_key", ignoreDuplicates: true },
          );
      }

      // Geocode city/country so the nomad shows up on the Browse Nomads map.
      const coords =
        pickedCoords ??
        (mapsConfig?.key
          ? await geocodeCityCountry(mapsConfig.key, profile.city, profile.country)
          : null);

      // Upsert sitter profile
      const { error: sitterError } = await supabase
        .from("sitter_profiles")
        .upsert({
          user_id: user.id,
          headline: sitterProfile.headline || null,
          bio: sitterProfile.bio || null,
          why_i_sit: sitterProfile.why_i_sit || null,
          experience_level: sitterProfile.experience_level || null,
          experience_details: sitterProfile.experience_details || null,
          languages: sitterProfile.languages,
          pet_types: sitterProfile.pet_types,
          comfortable_with: sitterProfile.comfortable_with,
          sit_style: sitterProfile.sit_style || null,
          home_preferences: sitterProfile.home_preferences,
          house_rules_compatibility: sitterProfile.house_rules_compatibility,
          availability_type: sitterProfile.availability_type || null,
          available_from: sitterProfile.available_from || null,
          available_to: sitterProfile.available_to || null,
          preferred_regions: sitterProfile.preferred_regions,
          preferred_countries: sitterProfile.preferred_countries,
          preferred_cities: sitterProfile.preferred_cities,
          gallery: sitterProfile.gallery,
          age_range: sitterProfile.age_range || null,
          ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
        }, { onConflict: "user_id" });

      if (sitterError) throw sitterError;

      // Phone numbers are write-only for members (never readable by others),
      // so they are saved through a dedicated secure function.
      const { error: phoneError } = await supabase.rpc("set_my_profile_phone" as any, {
        p_target: "sitter",
        p_phone: sitterProfile.phone || null,
      });
      if (phoneError) throw phoneError;

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

  const toggleArrayItem = (
    array: string[],
    item: string,
    setter: (value: string[]) => void
  ) => {
    if (array.includes(item)) {
      setter(array.filter((i) => i !== item));
    } else {
      setter([...array, item]);
    }
  };

  const updateSitterProfile = (data: Partial<SitterProfile>) => {
    setSitterProfile((prev) => ({ ...prev, ...data }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-16 pb-8">
          <div className="container mx-auto px-4 max-w-4xl">
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

      <main className="pt-16 pb-8 md:pb-12">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6 md:mb-8 pt-4">
            <div>
              <Button
                variant="ghost"
                onClick={() => navigate("/dashboard")}
                className="mb-2 -ml-3"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                Edit Nomad Profile
              </h1>
              <p className="text-sm md:text-base text-muted-foreground mt-1">
                Make your profile stand out to attract pet owners
              </p>
            </div>
          </div>

          <Tabs defaultValue="basics" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 text-xs sm:text-sm">
              <TabsTrigger value="basics" className="px-1 sm:px-3">Basics</TabsTrigger>
              <TabsTrigger value="experience" className="px-1 sm:px-3">Experience</TabsTrigger>
              <TabsTrigger value="availability" className="px-1 sm:px-3">Availability</TabsTrigger>
              <TabsTrigger value="preferences" className="px-1 sm:px-3">Prefs</TabsTrigger>
            </TabsList>

            {/* Basics Tab */}
            <TabsContent value="basics" className="space-y-6">
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

                  <div className="space-y-2">
                    <Label htmlFor="age_range">Age Range</Label>
                    <Select
                      value={sitterProfile.age_range}
                      onValueChange={(value) =>
                        updateSitterProfile({ age_range: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select age range" />
                      </SelectTrigger>
                      <SelectContent>
                        {ageRangeOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={sitterProfile.phone}
                      onChange={(e) =>
                        updateSitterProfile({ phone: e.target.value })
                      }
                      placeholder="+1 234 567 8900"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Location */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Current Location
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <PlacesAutocompleteField
                        id="city"
                        value={profile.city}
                        types={["(cities)"]}
                        placeholder="Start typing your city…"
                        onChange={(value) =>
                          setProfile((prev) => ({ ...prev, city: value }))
                        }
                        onSelect={(place) => {
                          setProfile((prev) => ({
                            ...prev,
                            city: place.city || place.description,
                            country: place.country || prev.country,
                          }));
                          if (place.latitude != null && place.longitude != null) {
                            setPickedCoords({
                              latitude: place.latitude,
                              longitude: place.longitude,
                            });
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Pick your city from the suggestions so you appear on the nomad map.
                      </p>
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
                </CardContent>

              </Card>

              {/* About */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">About You<HelpTooltip label="About this section" content="Tell Pet Parents about yourself" /></CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="headline">Headline</Label>
                    <Input
                      id="headline"
                      value={sitterProfile.headline}
                      onChange={(e) =>
                        updateSitterProfile({ headline: e.target.value })
                      }
                      placeholder="e.g., Calm, reliable sitter who loves cats"
                      maxLength={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      A short tagline that appears on your profile card
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={sitterProfile.bio}
                      onChange={(e) =>
                        updateSitterProfile({ bio: e.target.value })
                      }
                      placeholder="Tell pet owners about yourself, your lifestyle, and what makes you a great sitter..."
                      rows={5}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Why do you sit?</Label>
                    <p className="text-xs text-muted-foreground">Select all that apply</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {["I Love Travelling", "I Love Pets", "I Am A Digital Nomad", "Budget Travel"].map((reason) => {
                        const selected = (sitterProfile.why_i_sit || "").split(",").map(s => s.trim()).filter(Boolean).includes(reason);
                        return (
                          <button
                            key={reason}
                            type="button"
                            onClick={() => {
                              const current = (sitterProfile.why_i_sit || "").split(",").map(s => s.trim()).filter(Boolean);
                              const updated = selected ? current.filter(r => r !== reason) : [...current, reason];
                              updateSitterProfile({ why_i_sit: updated.join(", ") });
                            }}
                            className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-colors ${
                              selected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-border text-foreground"
                            }`}
                          >
                            {reason}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Languages */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Languages className="w-5 h-5" />
                    Languages
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {languageOptions.map((lang) => (
                      <div
                        key={lang}
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                          sitterProfile.languages.includes(lang)
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        )}
                        onClick={() =>
                          toggleArrayItem(
                            sitterProfile.languages,
                            lang,
                            (langs) => updateSitterProfile({ languages: langs })
                          )
                        }
                      >
                        <Checkbox
                          checked={sitterProfile.languages.includes(lang)}
                          onCheckedChange={() =>
                            toggleArrayItem(
                              sitterProfile.languages,
                              lang,
                              (langs) => updateSitterProfile({ languages: langs })
                            )
                          }
                        />
                        <span className="text-sm">{lang}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Gallery */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">Photo Gallery<HelpTooltip label="About your photo gallery" content="Add photos of yourself with pets or during travels" /></CardTitle>
                </CardHeader>
                <CardContent>
                  <ImageUpload
                    images={sitterProfile.gallery}
                    onImagesChange={(urls) =>
                      updateSitterProfile({ gallery: urls })
                    }
                    maxImages={6}
                    folder="gallery"
                    label="Gallery Photos"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Experience Tab */}
            <TabsContent value="experience" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Experience Level</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>How experienced are you?</Label>
                    <Select
                      value={sitterProfile.experience_level}
                      onValueChange={(value) =>
                        updateSitterProfile({ experience_level: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select experience level" />
                      </SelectTrigger>
                      <SelectContent>
                        {experienceLevels.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="experience_details">
                      Tell us about your experience
                    </Label>
                    <Textarea
                      id="experience_details"
                      value={sitterProfile.experience_details}
                      onChange={(e) =>
                        updateSitterProfile({ experience_details: e.target.value })
                      }
                      placeholder="Describe your pet sitting experience, memorable sits, and what you've learned..."
                      rows={4}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="w-5 h-5" />
                    Pet Types
                    <HelpTooltip label="About pet types" content="Choose the types of pets you're comfortable caring for" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {petTypeOptions.map((type) => {
                      const selected = sitterProfile.pet_types.map(canonicalPetType);
                      const isSelected = selected.includes(type);
                      const togglePetType = () =>
                        updateSitterProfile({
                          pet_types: isSelected
                            ? selected.filter((t) => t !== type)
                            : [...selected, type],
                        });
                      return (
                      <div
                        key={type}
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        )}
                        onClick={togglePetType}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={togglePetType}
                        />
                        <span className="text-sm">{formatPetType(type)}</span>
                      </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">Comfortable With<HelpTooltip label="About special care" content="Select any special situations you're comfortable handling" /></CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {comfortableWithOptions.map((option) => (
                      <div
                        key={option}
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                          sitterProfile.comfortable_with.includes(option)
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        )}
                        onClick={() =>
                          toggleArrayItem(
                            sitterProfile.comfortable_with,
                            option,
                            (opts) =>
                              updateSitterProfile({ comfortable_with: opts })
                          )
                        }
                      >
                        <Checkbox
                          checked={sitterProfile.comfortable_with.includes(option)}
                          onCheckedChange={() =>
                            toggleArrayItem(
                              sitterProfile.comfortable_with,
                              option,
                              (opts) =>
                                updateSitterProfile({ comfortable_with: opts })
                            )
                          }
                        />
                        <span className="text-sm">{option}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Availability Tab */}
            <TabsContent value="availability" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5" />
                    Availability
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Availability Type</Label>
                    <Select
                      value={sitterProfile.availability_type}
                      onValueChange={(value) =>
                        updateSitterProfile({ availability_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flexible">
                          Flexible - Open to opportunities anytime
                        </SelectItem>
                        <SelectItem value="specific_dates">
                          Specific Dates - Available during certain periods
                        </SelectItem>
                        <SelectItem value="not_available">
                          Not Available - Currently not taking sits
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {sitterProfile.availability_type === "specific_dates" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Available From</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !sitterProfile.available_from &&
                                  "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {sitterProfile.available_from
                                ? format(
                                    parseISO(sitterProfile.available_from),
                                    "PPP"
                                  )
                                : "Select date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={
                                sitterProfile.available_from
                                  ? parseISO(sitterProfile.available_from)
                                  : undefined
                              }
                              onSelect={(date) =>
                                updateSitterProfile({
                                  available_from: date
                                    ? format(date, "yyyy-MM-dd")
                                    : "",
                                })
                              }
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-2">
                        <Label>Available To</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !sitterProfile.available_to &&
                                  "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {sitterProfile.available_to
                                ? format(
                                    parseISO(sitterProfile.available_to),
                                    "PPP"
                                  )
                                : "Select date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={
                                sitterProfile.available_to
                                  ? parseISO(sitterProfile.available_to)
                                  : undefined
                              }
                              onSelect={(date) =>
                                updateSitterProfile({
                                  available_to: date
                                    ? format(date, "yyyy-MM-dd")
                                    : "",
                                })
                              }
                              disabled={(date) =>
                                sitterProfile.available_from
                                  ? date < parseISO(sitterProfile.available_from)
                                  : false
                              }
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">Preferred Locations<HelpTooltip label="About preferred locations" content="Add cities or countries where you'd like to sit" /></CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="preferred_cities">Preferred Cities</Label>
                    <Input
                      id="preferred_cities"
                      value={sitterProfile.preferred_cities.join(", ")}
                      onChange={(e) =>
                        updateSitterProfile({
                          preferred_cities: e.target.value
                            .split(",")
                            .map((c) => c.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="e.g., Paris, Barcelona, Tokyo"
                    />
                    <p className="text-xs text-muted-foreground">
                      Separate cities with commas
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="preferred_countries">
                      Preferred Countries
                    </Label>
                    <Input
                      id="preferred_countries"
                      value={sitterProfile.preferred_countries.join(", ")}
                      onChange={(e) =>
                        updateSitterProfile({
                          preferred_countries: e.target.value
                            .split(",")
                            .map((c) => c.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="e.g., France, Spain, Japan"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Preferences Tab */}
            <TabsContent value="preferences" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Sitting Style</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {sitStyleOptions.map((style) => (
                      <div
                        key={style.value}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all",
                          sitterProfile.sit_style === style.value
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        )}
                        onClick={() =>
                          updateSitterProfile({ sit_style: style.value })
                        }
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded-full border-2",
                            sitterProfile.sit_style === style.value
                              ? "border-primary bg-primary"
                              : "border-muted-foreground"
                          )}
                        />
                        <span className="text-sm">{style.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Home className="w-5 h-5" />
                    Home Preferences
                    <HelpTooltip label="About home preferences" content="Choose the types of homes you prefer to stay in" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {homePreferenceOptions.map((pref) => (
                      <div
                        key={pref}
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                          sitterProfile.home_preferences.includes(pref)
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        )}
                        onClick={() =>
                          toggleArrayItem(
                            sitterProfile.home_preferences,
                            pref,
                            (prefs) =>
                              updateSitterProfile({ home_preferences: prefs })
                          )
                        }
                      >
                        <Checkbox
                          checked={sitterProfile.home_preferences.includes(pref)}
                          onCheckedChange={() =>
                            toggleArrayItem(
                              sitterProfile.home_preferences,
                              pref,
                              (prefs) =>
                                updateSitterProfile({ home_preferences: prefs })
                            )
                          }
                        />
                        <span className="text-sm">{pref}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Button (bottom) */}
          <div className="flex justify-center mt-8">
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

export default EditSitterProfile;
