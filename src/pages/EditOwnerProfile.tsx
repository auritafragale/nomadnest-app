import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Home as HomeIcon, Lock, MapPin, PawPrint, PenLine } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile } from "@/lib/myProfile";
import { useToast } from "@/hooks/use-toast";
import { OWNER_PROFILE_COLUMNS } from "@/lib/profileColumns";
import { useHideBottomNav } from "@/lib/bottomNav";
import ImageUpload, { deleteStoredImages } from "@/components/listing/ImageUpload";
import PlacesAutocompleteField from "@/components/maps/PlacesAutocompleteField";
import { FieldLabel, inputClass } from "@/components/listing/form/FormBits";
import { NN_PAGE, RoleTheme } from "@/components/nn/ui";
import { BioField, CouldNotLoad, EditorHub, PrivateDetailsFields, SectionPage, type SectionDef } from "@/components/profile/edit/EditorParts";
import { cn } from "@/lib/utils";

const HUB = "/edit-owner-profile";
const NOTE =
  "Your pets and home live in your listing, so you only fill them in once. Never shown on your profile: your last name, email, phone number, ID documents or address.";

interface ParentData {
  first_name: string;
  last_name: string;
  avatar_url: string;
  city: string;
  country: string;
  phone: string | null;
  phone_verified: boolean;
  bio: string;
  /** The newest listing, for Your pets and Your home. */
  listing_id: string | null;
  pet_names: string[];
  home_type: string | null;
}

const useParentData = (userId: string | undefined) =>
  useQuery({
    queryKey: ["edit-parent-profile", userId],
    queryFn: async (): Promise<ParentData> => {
      const [{ data: me }, { data: op, error }, { data: listings, error: listingsError }] = await Promise.all([
        fetchMyProfile(),
        supabase.from("owner_profiles").select(OWNER_PROFILE_COLUMNS as "*").eq("user_id", userId!).maybeSingle(),
        supabase.from("listings").select("id, home_type, created_at, pets (name)").eq("owner_user_id", userId!).order("created_at", { ascending: false }).limit(1),
      ]);
      if (error) throw error;
      if (listingsError) throw listingsError;
      const l = (listings ?? [])[0] as { id: string; home_type: string | null; pets: { name: string | null }[] } | undefined;
      return {
        first_name: me?.first_name ?? "",
        last_name: me?.last_name ?? "",
        avatar_url: me?.avatar_url ?? "",
        city: me?.city ?? "",
        country: me?.country ?? "",
        phone: me?.phone_number ?? null,
        phone_verified: !!me?.phone_verified,
        bio: ((op as { bio?: string | null } | null)?.bio ?? "") || "",
        listing_id: l?.id ?? null,
        pet_names: (l?.pets ?? []).map((p) => p.name ?? "").filter(Boolean),
        home_type: l?.home_type ?? null,
      };
    },
    enabled: !!userId,
  });

/** Edit Pet Parent profile (design: ParentProfileEditPhone, ParentProfileEditTablet, ParentProfileEditDesktop). */
const EditOwnerProfile = () => {
  const { section } = useParams<{ section?: string }>();
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useParentData(user?.id);
  const [form, setForm] = useState<ParentData | null>(null);
  const [aiBio, setAiBio] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useHideBottomNav(!!section);

  useEffect(() => {
    if (data) setForm(data);
    setAiBio(false);
    setRemoved([]);
  }, [data, section]);

  const notParent = !!user && !!role && role !== "owner" && role !== "both";
  useEffect(() => {
    if (notParent) toast({ title: "This page is for Pet Parents", description: "Only Pet Parents have a Pet Parent profile.", variant: "destructive" });
  }, [notParent, toast]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (notParent) return <Navigate to="/dashboard" replace />;

  const shell = (children: React.ReactNode) => (
    <RoleTheme role="owner" className="flex min-h-screen flex-col">
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
        <Skeleton className="h-60 w-full rounded-[22px]" />
      </main>,
    );
  }

  const set = (patch: Partial<ParentData>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const listingTo = (step: "pets" | "home") => (data.listing_id ? `/edit-listing/${data.listing_id}?step=${step}` : "/create-listing");

  if (!section) {
    const checks = [
      { id: "photo", done: !!data.avatar_url && !!data.first_name },
      { id: "city", done: !!data.city && !!data.country },
      { id: "about", done: !!data.bio.trim() },
    ];
    const done = checks.filter((c) => c.done).length;
    const percent = Math.round((done / checks.length) * 100);
    const firstTodo = checks.find((c) => !c.done)?.id;
    const HINTS: Record<string, string> = {
      photo: "Add your photo and first name. Nomads like to see who they'll be sitting for.",
      city: "Add the city you live in.",
      about: "Add a few words about you and your pets. Nomads feel more at ease applying.",
    };
    const st = (id: string, ok: boolean, todo: string): Pick<SectionDef, "status" | "kind" | "highlight"> =>
      ok ? { status: "✓ Done", kind: "done" } : { status: todo, kind: "todo", highlight: id === firstTodo };
    const sections: SectionDef[] = [
      { id: "photo", title: "Photo and name", icon: Camera, to: `${HUB}/photo`, summary: data.first_name || undefined, ...st("photo", checks[0].done, "Add photo") },
      { id: "city", title: "Your city", icon: MapPin, to: `${HUB}/city`, summary: [data.city, data.country].filter(Boolean).join(", ") || undefined, ...st("city", checks[1].done, "Add your city") },
      { id: "about", title: "About you", icon: PenLine, to: `${HUB}/about`, summary: data.bio ? `${data.bio.slice(0, 40)}${data.bio.length > 40 ? "…" : ""}` : undefined, ...st("about", checks[2].done, "Add a few words") },
      {
        id: "pets",
        title: "Your pets",
        icon: PawPrint,
        to: listingTo("pets"),
        summary: data.pet_names.join(" and ") || undefined,
        status: data.listing_id ? "In listing" : "Create your listing",
        kind: "link",
      },
      { id: "home", title: "Your home", icon: HomeIcon, to: listingTo("home"), summary: data.home_type ? `${data.home_type.charAt(0).toUpperCase()}${data.home_type.slice(1)}` : undefined, status: data.listing_id ? "In listing" : "Create your listing", kind: "link" },
      { id: "private", title: "Private details", icon: Lock, to: `${HUB}/private`, summary: "Last name and phone · only you see these", status: "🔒 Only you", kind: "private" },
    ];
    return shell(
      <EditorHub
        title="Your Pet Parent profile"
        percent={percent}
        hint={firstTodo ? HINTS[firstTodo] : "Photo, name, city and a few words about you. Nomads have what they need."}
        previewTo={`/owner/${user.id}?preview=1`}
        sections={sections}
        note={NOTE}
      />,
    );
  }

  const updateProfile = async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from("profiles").update(fields).eq("id", user.id);
    if (error) throw error;
  };

  const SECTIONS: Record<string, { title: string; save: () => Promise<void>; body: React.ReactNode }> = {
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
    city: {
      title: "Your city",
      save: () => updateProfile({ city: form.city.trim(), country: form.country.trim() }),
      body: (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="city">City</FieldLabel>
              <PlacesAutocompleteField
                id="city"
                value={form.city}
                types={["(cities)"]}
                placeholder="Start typing your city…"
                onChange={(v) => set({ city: v })}
                onSelect={(place) => set({ city: place.city || place.description, country: place.country || form.country })}
              />
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
          <p className="text-sm text-muted-foreground">City and country only. Your address stays on your listing, private.</p>
        </>
      ),
    },
    about: {
      title: "About you",
      save: async () => {
        const { error } = await supabase.from("owner_profiles").upsert({ user_id: user.id, bio: form.bio.trim() || null }, { onConflict: "user_id" });
        if (error) throw error;
      },
      body: (
        <BioField
          id="bio"
          label="About you"
          value={form.bio}
          onChange={(v) => set({ bio: v })}
          kind="parent_bio"
          aiUsed={aiBio}
          onAiUsed={setAiBio}
          aiNote="AI suggestion. Change anything that isn't you."
          helper="Nomads feel more at ease applying when they know a little about you and your pets."
        />
      ),
    },
    private: {
      title: "Private details",
      save: () => updateProfile({ last_name: form.last_name.trim() || null }),
      body: <PrivateDetailsFields lastName={form.last_name} onLastName={(v) => set({ last_name: v })} phone={data.phone} phoneVerified={data.phone_verified} />,
    },
  };

  if (section === "pets" || section === "home") return <Navigate to={listingTo(section)} replace />;
  const s = SECTIONS[section];
  if (!s) return <Navigate to={HUB} replace />;

  const onSave = async () => {
    setSaving(true);
    try {
      await s.save();
      await deleteStoredImages(removed.filter((u) => u !== form.avatar_url));
      queryClient.invalidateQueries({ queryKey: ["edit-parent-profile"] });
      toast({ title: "Saved", description: "Your profile is up to date." });
      navigate(HUB);
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return shell(
    <SectionPage hubTo={HUB} hubLabel="Your Pet Parent profile" title={s.title} onSave={onSave} saving={saving}>
      {s.body}
    </SectionPage>,
  );
};

export default EditOwnerProfile;
