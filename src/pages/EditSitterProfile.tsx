import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Camera, Home as HomeIcon, Images, Languages as LanguagesIcon, Lock, MapPin, PawPrint, PenLine, X } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile } from "@/lib/myProfile";
import { useToast } from "@/hooks/use-toast";
import { useMyAvailability } from "@/hooks/useMyAvailability";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { geocodeCityCountry } from "@/lib/geocode";
import { SITTER_PROFILE_COLUMNS } from "@/lib/profileColumns";
import { PET_TYPE_OPTIONS, canonicalPetType, formatPetType } from "@/lib/petTypes";
import { useHideBottomNav } from "@/lib/bottomNav";
import ImageUpload, { deleteStoredImages } from "@/components/listing/ImageUpload";
import PlacesAutocompleteField from "@/components/maps/PlacesAutocompleteField";
import { FieldLabel, PillGroup, inputClass } from "@/components/listing/form/FormBits";
import { NN_PAGE, RoleTheme, nnButton } from "@/components/nn/ui";
import { BioField, CouldNotLoad, EditorHub, LimitedInput, PrivateDetailsFields, SectionPage, type SectionDef } from "@/components/profile/edit/EditorParts";
import { cn } from "@/lib/utils";

// Stored values stay as they are; only the words shown change.
const WHY = [
  { value: "I Love Pets", label: "I love pets" },
  { value: "I Love Travelling", label: "I love travelling" },
  { value: "I Am A Digital Nomad", label: "I work remotely" },
  { value: "Budget Travel", label: "Budget travel" },
];
const LEVELS = [
  { value: "beginner", label: "Beginner", sub: "0–5 sits" },
  { value: "intermediate", label: "Intermediate", sub: "5–15 sits" },
  { value: "experienced", label: "Experienced", sub: "15–30 sits" },
  { value: "expert", label: "Expert", sub: "30+ sits" },
];
const PETS = PET_TYPE_OPTIONS.map((v) => ({ value: v, label: v === "farm" ? "Farm animals" : formatPetType(v) }));
const COMFY = [
  { value: "Puppies/Kittens", label: "Puppies and kittens" },
  { value: "Senior pets", label: "Senior pets" },
  { value: "Pets with medication", label: "Pets with medication" },
  { value: "Anxious pets", label: "Anxious pets" },
  { value: "Multiple pets", label: "Several pets" },
  { value: "Large dogs", label: "Large dogs" },
  { value: "Exotic pets", label: "Exotic pets" },
];
const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Japanese", "Mandarin", "Korean", "Arabic", "Russian"].map((l) => ({ value: l, label: l }));
const STYLES = [
  { value: "homebody", label: "Homebody", sub: "I prefer staying in most of the time" },
  { value: "explorer", label: "Explorer", sub: "I like to go out and explore the area" },
  { value: "balanced", label: "Balanced", sub: "A mix of staying in and going out" },
];
const HOME_PREFS = ["House with garden", "Apartment", "Rural/countryside", "City center", "Near public transport", "Near nature/trails"].map((v) => ({
  value: v,
  label: v === "Rural/countryside" ? "Countryside" : v === "City center" ? "City centre" : v === "Near nature/trails" ? "Near nature and trails" : v,
}));

const HUB = "/edit-sitter-profile";
const NOTE = "Never shown on your profile: your last name, email, phone number, date of birth, ID documents or exact location.";

interface NomadData {
  first_name: string;
  last_name: string;
  avatar_url: string;
  city: string;
  country: string;
  phone: string | null;
  phone_verified: boolean;
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
  preferred_cities: string[];
  preferred_countries: string[];
  gallery: string[];
}

const useNomadData = (userId: string | undefined) =>
  useQuery({
    queryKey: ["edit-nomad-profile", userId],
    queryFn: async (): Promise<NomadData> => {
      const [{ data: me }, { data: sp, error }] = await Promise.all([
        fetchMyProfile(),
        supabase.from("sitter_profiles").select(SITTER_PROFILE_COLUMNS as "*").eq("user_id", userId!).maybeSingle(),
      ]);
      if (error) throw error;
      const s = (sp ?? {}) as Record<string, unknown>;
      const arr = (k: string) => (Array.isArray(s[k]) ? (s[k] as string[]) : []);
      const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
      return {
        first_name: me?.first_name ?? "",
        last_name: me?.last_name ?? "",
        avatar_url: me?.avatar_url ?? "",
        city: me?.city ?? "",
        country: me?.country ?? "",
        phone: me?.phone_number ?? null,
        phone_verified: !!me?.phone_verified,
        headline: str("headline"),
        bio: str("bio"),
        why_i_sit: str("why_i_sit"),
        experience_level: str("experience_level"),
        experience_details: str("experience_details"),
        languages: arr("languages"),
        pet_types: arr("pet_types").map(canonicalPetType),
        comfortable_with: arr("comfortable_with"),
        sit_style: str("sit_style"),
        home_preferences: arr("home_preferences"),
        preferred_cities: arr("preferred_cities"),
        preferred_countries: arr("preferred_countries"),
        gallery: arr("gallery"),
      };
    },
    enabled: !!userId,
  });

/** Chips you can add to and take away from (preferred cities and countries). */
const ChipInput = ({ id, label, values, onChange, placeholder }: { id: string; label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) => {
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setText("");
  };
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {values.map((v) => (
            <li key={v} className="inline-flex min-h-11 items-center gap-1 rounded-full border-[1.5px] border-[var(--nn-accent)] bg-[var(--nn-tint)] pl-4 text-sm font-bold">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="flex h-11 w-11 items-center justify-center rounded-full">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={inputClass}
        />
        <button type="button" onClick={add} disabled={!text.trim()} className={nnButton("secondary", "shrink-0")}>
          Add
        </button>
      </div>
    </div>
  );
};

const ChoiceCards = ({ label, options, value, onChange, cols = "grid-cols-2" }: { label: string; options: { value: string; label: string; sub: string }[]; value: string; onChange: (v: string) => void; cols?: string }) => (
  <fieldset className="flex flex-col gap-2">
    <legend className="mb-2 text-[15px] font-bold">{label}</legend>
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", cols)}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn("flex min-h-[60px] flex-col items-start justify-center rounded-2xl px-3 py-2 text-left", on ? "border-2 border-[var(--nn-accent)] bg-[var(--nn-tint)]" : "border-[1.5px] border-border bg-card")}
          >
            <span className="text-[15px] font-bold">{o.label}</span>
            <span className="text-sm text-muted-foreground">{o.sub}</span>
          </button>
        );
      })}
    </div>
  </fieldset>
);

/** Edit Nomad profile (design: ProfileEditPhone, ProfileEditTablet, ProfileEditDesktopDark). */
const EditSitterProfile = () => {
  const { section } = useParams<{ section?: string }>();
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useNomadData(user?.id);
  const { data: availability } = useMyAvailability();
  const { data: mapsConfig } = useGoogleMapsKey();
  const [form, setForm] = useState<NomadData | null>(null);
  const [aiBio, setAiBio] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const [picked, setPicked] = useState<{ latitude: number; longitude: number } | null>(null);
  const [saving, setSaving] = useState(false);
  useHideBottomNav(!!section);

  // Each section page starts from the saved values.
  useEffect(() => {
    if (data) setForm(data);
    setAiBio(false);
    setRemoved([]);
    setPicked(null);
  }, [data, section]);

  const notNomad = !!user && !!role && role !== "sitter" && role !== "both";
  useEffect(() => {
    if (notNomad) toast({ title: "This page is for Nomads", description: "Only Nomads have a Nomad profile.", variant: "destructive" });
  }, [notNomad, toast]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (notNomad) return <Navigate to="/dashboard" replace />;

  const shell = (children: React.ReactNode) => (
    <RoleTheme role="sitter" className="flex min-h-screen flex-col">
      <Navbar wide />
      {children}
    </RoleTheme>
  );

  if (isError) return shell(<CouldNotLoad onRetry={() => refetch()} />);
  if (isLoading || !data || !form) {
    return shell(
      <main className={cn(NN_PAGE, "flex flex-col gap-4 pt-20 md:pt-24")}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28 w-full rounded-[22px]" />
        <Skeleton className="h-72 w-full rounded-[22px]" />
      </main>,
    );
  }

  const set = (patch: Partial<NomadData>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const why = form.why_i_sit.split(",").map((s) => s.trim()).filter(Boolean);
  const ranges = availability?.ranges?.length ?? 0;

  // ── Hub ───────────────────────────────────────────────────────────────
  if (!section) {
    const d = data;
    const levelLabel = LEVELS.find((l) => l.value === d.experience_level)?.label;
    const checks: { id: string; done: boolean }[] = [
      { id: "photo", done: !!d.avatar_url && !!d.first_name },
      { id: "about", done: !!d.headline && !!d.bio },
      { id: "photos", done: d.gallery.length >= 2 },
      { id: "pets", done: !!d.experience_level && d.pet_types.length > 0 },
      { id: "languages", done: d.languages.length > 0 },
      { id: "city", done: !!d.city && !!d.country },
      { id: "style", done: !!d.sit_style },
    ];
    const done = checks.filter((c) => c.done).length;
    const percent = Math.round((done / checks.length) * 100);
    const firstTodo = checks.find((c) => !c.done)?.id;
    const missingPhotos = Math.max(0, 2 - d.gallery.length);
    const HINTS: Record<string, string> = {
      photo: "Add your photo and first name. Pet Parents like to see who they're inviting.",
      about: "Add a headline and a few lines about you. Pet Parents read this first.",
      photos: `Add ${missingPhotos} more ${missingPhotos === 1 ? "photo" : "photos"} to finish. Profiles with 2+ photos get more invitations.`,
      pets: "Add your experience and the pets you can look after.",
      languages: "Add the languages you speak.",
      city: "Add your city so you show up on the Nomad map.",
      style: "Add your sitting style so Pet Parents know what to expect.",
    };
    const st = (id: string, ok: boolean, todo: string): Pick<SectionDef, "status" | "kind" | "highlight"> =>
      ok ? { status: "✓ Done", kind: "done" } : { status: todo, kind: "todo", highlight: id === firstTodo };
    const sections: SectionDef[] = [
      { id: "photo", title: "Photo and name", icon: Camera, to: `${HUB}/photo`, summary: d.first_name || undefined, ...st("photo", checks[0].done, "Add photo") },
      { id: "about", title: "About you", icon: PenLine, to: `${HUB}/about`, summary: d.headline || undefined, ...st("about", checks[1].done, "Add a few lines") },
      {
        id: "photos",
        title: "Your photos",
        icon: Images,
        to: `${HUB}/photos`,
        summary: `${d.gallery.length} of 6 photos`,
        ...st("photos", checks[2].done, `Add ${missingPhotos} ${missingPhotos === 1 ? "photo" : "photos"}`),
      },
      {
        id: "pets",
        title: "Pets and experience",
        icon: PawPrint,
        to: `${HUB}/pets`,
        summary: [levelLabel, d.pet_types.map((t) => formatPetType(t).toLowerCase()).join(", ")].filter(Boolean).join(" · ") || undefined,
        ...st("pets", checks[3].done, "Add experience"),
      },
      { id: "languages", title: "Languages", icon: LanguagesIcon, to: `${HUB}/languages`, summary: d.languages.join(", ") || undefined, ...st("languages", checks[4].done, "Add languages") },
      {
        id: "city",
        title: "Your city",
        icon: MapPin,
        to: `${HUB}/city`,
        summary: d.city ? `${[d.city, d.country].filter(Boolean).join(", ")} · city only on the map` : undefined,
        ...st("city", checks[5].done, "Add your city"),
      },
      {
        id: "dates",
        title: "Your dates",
        icon: Calendar,
        to: "/availability",
        summary: "Opens your calendar",
        status: ranges > 0 ? `${ranges} ${ranges === 1 ? "range" : "ranges"} set` : "Add your dates",
        kind: "link",
      },
      {
        id: "style",
        title: "Sitting style",
        icon: HomeIcon,
        to: `${HUB}/style`,
        summary: [STYLES.find((s) => s.value === d.sit_style)?.label, [...d.preferred_countries, ...d.preferred_cities].slice(0, 2).join(", ")].filter(Boolean).join(" · ") || undefined,
        ...st("style", checks[6].done, "Add your style"),
      },
      { id: "private", title: "Private details", icon: Lock, to: `${HUB}/private`, summary: "Last name and phone · only you see these", status: "🔒 Only you", kind: "private" },
    ];
    return shell(
      <EditorHub
        title="Your Nomad profile"
        percent={percent}
        hint={firstTodo ? HINTS[firstTodo] : "Pet Parents can see everything they need to invite you."}
        previewTo={`/sitter/${user.id}?preview=1`}
        sections={sections}
        note={NOTE}
      />,
    );
  }

  // ── Sections: each saves only its own fields ───────────────────────────
  const upsertSitter = async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from("sitter_profiles").upsert({ user_id: user.id, ...fields }, { onConflict: "user_id" });
    if (error) throw error;
  };
  const updateProfile = async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from("profiles").update(fields).eq("id", user.id);
    if (error) throw error;
  };

  const SECTIONS: Record<string, { title: string; intro?: string; save: () => Promise<void>; body: React.ReactNode }> = {
    photo: {
      title: "Photo and name",
      save: async () => {
        if (!form.first_name.trim()) throw new Error("Add your first name.");
        await updateProfile({ first_name: form.first_name.trim(), avatar_url: form.avatar_url || null });
      },
      body: (
        <>
          <ImageUpload
            images={form.avatar_url ? [form.avatar_url] : []}
            onImagesChange={(urls) => set({ avatar_url: urls[0] ?? "" })}
            onRemove={(u) => setRemoved((r) => [...r, u])}
            maxImages={1}
            folder="avatar"
            label="Profile photo"
          />
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="first-name">First name</FieldLabel>
            <input id="first-name" value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} autoComplete="given-name" className={inputClass} />
            <p className="text-sm text-muted-foreground">Members only ever see your first name.</p>
          </div>
        </>
      ),
    },
    about: {
      title: "About you",
      save: () => upsertSitter({ headline: form.headline.trim() || null, bio: form.bio.trim() || null, why_i_sit: form.why_i_sit || null }),
      body: (
        <>
          <LimitedInput id="headline" label="Headline" value={form.headline} onChange={(v) => set({ headline: v })} max={100} hint="Shows on your card in Browse Nomads." />
          <BioField
            id="bio"
            label="About you"
            value={form.bio}
            onChange={(v) => set({ bio: v })}
            kind="nomad_bio"
            aiUsed={aiBio}
            onAiUsed={setAiBio}
            aiNote="AI suggestion. Keep your own voice: change anything that isn't you."
            helper="Tip: mention the pets you've looked after. Pet Parents read this first."
          />
          <PillGroup label="Why you sit" options={WHY} values={why} onChange={(v) => set({ why_i_sit: v.join(", ") })} />
        </>
      ),
    },
    photos: {
      title: "Your photos",
      intro: "Photos of you with pets help Pet Parents picture you in their home. Add at least 2.",
      save: () => upsertSitter({ gallery: form.gallery }),
      body: (
        <ImageUpload
          images={form.gallery}
          onImagesChange={(gallery) => set({ gallery })}
          onRemove={(u) => setRemoved((r) => [...r, u])}
          maxImages={6}
          folder="gallery"
          label="Your photos (up to 6)"
          sortable
        />
      ),
    },
    pets: {
      title: "Pets and experience",
      save: () =>
        upsertSitter({
          experience_level: form.experience_level || null,
          pet_types: form.pet_types,
          comfortable_with: form.comfortable_with,
          experience_details: form.experience_details.trim() || null,
        }),
      body: (
        <>
          <ChoiceCards label="How experienced are you?" options={LEVELS} value={form.experience_level} onChange={(v) => set({ experience_level: v })} />
          <PillGroup label="Pets you can look after" options={PETS} values={form.pet_types} onChange={(v) => set({ pet_types: v })} />
          <PillGroup label="You're comfortable with" options={COMFY} values={form.comfortable_with} onChange={(v) => set({ comfortable_with: v })} />
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="experience">Your experience in your own words</FieldLabel>
            <textarea id="experience" rows={5} value={form.experience_details} onChange={(e) => set({ experience_details: e.target.value })} className={cn(inputClass, "resize-y")} />
          </div>
        </>
      ),
    },
    languages: {
      title: "Languages",
      save: () => upsertSitter({ languages: form.languages }),
      body: <PillGroup label="Languages you speak" options={LANGUAGES} values={form.languages} onChange={(v) => set({ languages: v })} />,
    },
    city: {
      title: "Your city",
      save: async () => {
        await updateProfile({ city: form.city.trim(), country: form.country.trim() });
        // The Nomad map uses the city's coordinates, never an address.
        const coords = picked ?? (mapsConfig?.key && form.city ? await geocodeCityCountry(mapsConfig.key, form.city, form.country).catch(() => null) : null);
        if (coords) await upsertSitter({ latitude: coords.latitude, longitude: coords.longitude });
      },
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="city">City</FieldLabel>
            <PlacesAutocompleteField
              id="city"
              value={form.city}
              types={["(cities)"]}
              placeholder="Start typing your city…"
              onChange={(v) => set({ city: v })}
              onSelect={(place) => {
                set({ city: place.city || place.description, country: place.country || form.country });
                if (place.latitude != null && place.longitude != null) setPicked({ latitude: place.latitude, longitude: place.longitude });
              }}
            />
            <p className="text-sm text-muted-foreground">Pick your city from the suggestions so you appear on the Nomad map. Update it when you move.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="country">Country</FieldLabel>
            <PlacesAutocompleteField
              id="country"
              value={form.country}
              types={["country"]}
              placeholder="Start typing your country…"
              onChange={(v) => set({ country: v })}
              onSelect={(place) => set({ country: place.country || place.description })}
            />
          </div>
        </div>
      ),
    },
    style: {
      title: "Sitting style",
      save: () =>
        upsertSitter({
          sit_style: form.sit_style || null,
          home_preferences: form.home_preferences,
          preferred_cities: form.preferred_cities,
          preferred_countries: form.preferred_countries,
        }),
      body: (
        <>
          <ChoiceCards label="How you like to sit" options={STYLES} value={form.sit_style} onChange={(v) => set({ sit_style: v })} cols="grid-cols-1 sm:grid-cols-3" />
          <PillGroup label="Homes you like" options={HOME_PREFS} values={form.home_preferences} onChange={(v) => set({ home_preferences: v })} />
          <ChipInput id="pref-cities" label="Favourite cities" values={form.preferred_cities} onChange={(v) => set({ preferred_cities: v })} placeholder="e.g. Lisbon" />
          <ChipInput id="pref-countries" label="Favourite countries" values={form.preferred_countries} onChange={(v) => set({ preferred_countries: v })} placeholder="e.g. Portugal" />
        </>
      ),
    },
    private: {
      title: "Private details",
      save: () => updateProfile({ last_name: form.last_name.trim() || null }),
      body: <PrivateDetailsFields lastName={form.last_name} onLastName={(v) => set({ last_name: v })} phone={data.phone} phoneVerified={data.phone_verified} />,
    },
  };

  if (section === "dates") return <Navigate to="/availability" replace />;
  const s = SECTIONS[section];
  if (!s) return <Navigate to={HUB} replace />;

  const onSave = async () => {
    setSaving(true);
    try {
      await s.save();
      // Photos taken out are only deleted once the change is saved.
      await deleteStoredImages(removed.filter((u) => u !== form.avatar_url && !form.gallery.includes(u)));
      queryClient.invalidateQueries({ queryKey: ["edit-nomad-profile"] });
      queryClient.invalidateQueries({ queryKey: ["nomads-map"] });
      queryClient.invalidateQueries({ queryKey: ["sitters"] });
      toast({ title: "Saved", description: "Your profile is up to date." });
      navigate(HUB);
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return shell(
    <SectionPage hubTo={HUB} hubLabel="Your Nomad profile" title={s.title} intro={s.intro} onSave={onSave} saving={saving}>
      {s.body}
    </SectionPage>,
  );
};

export default EditSitterProfile;
