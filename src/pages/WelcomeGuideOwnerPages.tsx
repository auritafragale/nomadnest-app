import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { BackButton } from "@/components/layout/BackButton";
import { Skeleton } from "@/components/ui/skeleton";
import { NN_MAIN, PageHeader, RoleTheme } from "@/components/nn/ui";
import { GuideQuestions } from "@/components/welcome-guide/GuideQuestions";
import { GuideReader } from "@/components/welcome-guide/SitterGuideView";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useGuideEditorData } from "@/hooks/useWelcomeGuide";
import { useGuideQa } from "@/hooks/useAskNest";
import { fetchListingPrivateAddress } from "@/lib/privateColumns";
import { fetchMyProfile } from "@/lib/myProfile";
import type { SitterGuide } from "@/hooks/useSitterGuide";

/** The listing's owner, or null (and the page sends others back to the guide). */
const useIsGuideOwner = (listingId: string | undefined) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["welcome-guide-listing", listingId],
    queryFn: async () => {
      const { data } = await supabase.from("listings").select("id, title, owner_user_id").eq("id", listingId!).maybeSingle();
      return data as { id: string; title: string; owner_user_id: string } | null;
    },
    enabled: !!listingId && !!user,
    select: (l) => (l && l.owner_user_id === user?.id ? l : null),
  });
};

const Shell = ({ children }: { children: React.ReactNode }) => (
  <RoleTheme role="owner" className="flex min-h-screen flex-col">
    <Navbar wide />
    <main className={NN_MAIN}>{children}</main>
    <Footer />
  </RoleTheme>
);

/** /listing/:id/welcome-guide/questions: Questions from your sitters (owner only). */
export const GuideQuestionsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const { data: listing, isLoading } = useIsGuideOwner(id);
  if (!loading && !user) return <Navigate to="/auth" replace />;
  if (!isLoading && id && listing === null) return <Navigate to={`/listing/${id}/welcome-guide`} replace />;
  return (
    <Shell>
      <PageHeader
        title="Questions from your sitters"
        intro="Answer once and it's saved to your guide, so Ask the Nest can answer your next Nomad straight away."
        fallback={`/listing/${id}/welcome-guide`}
      />
      <div className="w-full md:max-w-5xl">{isLoading || !id ? <Skeleton className="h-72 w-full rounded-[24px]" /> : <GuideQuestions listingId={id} />}</div>
    </Shell>
  );
};

/**
 * /listing/:id/welcome-guide/preview: the Nomad's view built from the
 * owner's own guide, with print. Nothing new is shared: it's the owner's own
 * data, shown in the layout their Nomad sees.
 */
export const GuidePreviewPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const { data: listing, isLoading: ownerLoading } = useIsGuideOwner(id);
  const { data, isLoading } = useGuideEditorData(listing ? id : undefined);
  const { data: qa = [] } = useGuideQa(listing ? id : undefined);
  const { data: address = null } = useQuery({
    queryKey: ["listing-private-address", id],
    queryFn: () => fetchListingPrivateAddress(id!),
    enabled: !!listing && !!id,
  });
  const { data: me } = useQuery({ queryKey: ["my-profile-first-name"], queryFn: async () => (await fetchMyProfile()).data, enabled: !!user });

  const guide = useMemo<SitterGuide | null>(() => {
    if (!data) return null;
    const now = new Date();
    return {
      listing_id: data.listing.id,
      listing_title: data.listing.title,
      address,
      sit_id: "preview",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      unlock_at: now.toISOString(),
      ends_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
      access_open: true,
      guide: (data.guide as unknown as SitterGuide["guide"]) ?? null,
      access: data.access
        ? {
            key_handover: data.access.key_handover ?? null,
            door_codes: data.access.door_codes ?? null,
            alarm_instructions: data.access.alarm_instructions ?? null,
            wifi_details: data.access.wifi_details ?? null,
            na_fields: data.access.na_fields ?? [],
          }
        : null,
      pets: data.pets.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        age: null,
        personality: null,
        feeding_details: p.feeding_details,
        walks_exercise: p.walks_exercise,
        daily_routine: p.daily_routine,
        requires_medication: p.requires_medication,
        has_medication: p.has_medication,
        medication_instructions: p.medication_instructions,
        behaviour_notes: p.behaviour_notes,
        vet_info: p.vet_info,
      })),
      photos: data.photos.map((p) => ({
        id: p.id,
        section: p.section,
        pet_id: p.pet_id,
        note: p.note,
        instruction: p.instruction,
        storage_path: p.storage_path,
      })),
      owner_user_id: data.listing.owner_user_id,
      owner_first_name: me?.first_name ?? undefined,
      qa: qa.map((q) => ({ id: q.id, question: q.question, answer: q.answer, arrival_only: q.arrival_only })),
    };
  }, [data, address, qa, me?.first_name]);
  const urls = useMemo(
    () => Object.fromEntries((data?.photos ?? []).filter((p) => p.signedUrl).map((p) => [p.id, p.signedUrl as string])),
    [data],
  );

  if (!loading && !user) return <Navigate to="/auth" replace />;
  if (!ownerLoading && id && listing === null) return <Navigate to={`/listing/${id}/welcome-guide`} replace />;

  return (
    <Shell>
      <BackButton fallback={`/listing/${id}/welcome-guide`} className="h-11 self-start print-hidden" />
      {isLoading || ownerLoading || !guide ? (
        <Skeleton className="h-96 w-full rounded-[24px]" />
      ) : (
        <GuideReader
          guide={guide}
          urls={urls}
          preview
          banner={
            <p className="flex items-start gap-2.5 rounded-[18px] bg-[var(--nn-tint)] px-4 py-3 text-[15px] leading-snug print-hidden">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--nn-accent-dark)]" aria-hidden="true" />
              This is what your Nomad sees. Arrival details show from 48 hours before the sit.
            </p>
          }
        />
      )}
    </Shell>
  );
};
