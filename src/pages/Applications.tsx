import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { ApplicationCard } from "@/components/applications/ApplicationCard";
import ApplicationFilterSheet, {
  ApplicationFilters,
  applicationFiltersActive,
  defaultApplicationFilters,
} from "@/components/applications/ApplicationFilterSheet";
import {
  useOwnerApplications,
  useUpdateApplicationStatus,
  useAcceptApplication,
} from "@/hooks/useApplications";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Inbox, SlidersHorizontal } from "lucide-react";
import { canonicalPetType } from "@/lib/petTypes";
import { publicProfiles } from "@/lib/publicProfile";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type ApplicationStatus = Database["public"]["Enums"]["application_status"];
type FilterStatus = ApplicationStatus | "all";

const statusTabs: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
];

const Applications = () => {
  const { user, loading, role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = (searchParams.get("status") || "all") as FilterStatus;
  const [statusFilter, setStatusFilter] = useState<FilterStatus>(
    statusTabs.some((t) => t.value === initialStatus) ? initialStatus : "all",
  );
  const { toast } = useToast();
  const [filters, setFilters] = useState<ApplicationFilters>(defaultApplicationFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: applications = [], isLoading } = useOwnerApplications(statusFilter);

  const dateOptions = useMemo(() => {
    const map = new Map<string, { label: string; start: string }>();
    applications.forEach((app) => {
      if (app.sit_dates?.id && !map.has(app.sit_dates.id)) {
        map.set(
          app.sit_dates.id,
          {
            label: `${format(new Date(app.sit_dates.start_date), "MMM d")} – ${format(
              new Date(app.sit_dates.end_date),
              "MMM d, yyyy",
            )}`,
            start: app.sit_dates.start_date,
          },
        );
      }
    });
    return Array.from(map, ([id, { label, start }]) => ({ id, label, start })).sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
  }, [applications]);


  // Your own country decides what counts as a local Nomad
  const { data: ownCountry } = useQuery({
    queryKey: ["own-country", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await publicProfiles("country").eq("id", user.id).maybeSingle();
      return ((data as unknown as { country: string | null } | null)?.country) ?? null;
    },
    enabled: !!user,
  });
  const updateStatus = useUpdateApplicationStatus();
  const acceptApplication = useAcceptApplication();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Only owners can access this page
  if (role !== "owner" && role !== "both") {
    return <Navigate to="/dashboard" replace />;
  }

  const visibleApplications = applications
    .filter((app) => filters.sitDatesId === "all" || app.sit_dates?.id === filters.sitDatesId)
    .filter((app) => {
      if (filters.placeKey === "any") return true;
      const sameCountry =
        !!ownCountry &&
        !!app.sitter_user?.country &&
        app.sitter_user.country.toLowerCase() === ownCountry.toLowerCase();
      return filters.placeKey === "local" ? sameCountry : !sameCountry;
    })
    .filter((app) => {
      if (filters.petFilter === "any") return true;
      return (app.sitter_profile?.pet_types || []).some(
        (t) => canonicalPetType(t) === filters.petFilter,
      );
    })
    .sort((a, b) => {
      if (filters.sortKey === "reviews") return b.review_count - a.review_count;
      if (filters.sortKey === "rating") return (b.avg_rating ?? -1) - (a.avg_rating ?? -1);
      if (filters.sortKey === "recent")
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      // default: chronological — earliest sit start date first
      const aStart = a.sit_dates?.start_date ?? "";
      const bStart = b.sit_dates?.start_date ?? "";
      return aStart.localeCompare(bStart);
    });


  const handleStatusChange = async (
    application: (typeof applications)[0],
    status: "shortlisted" | "declined"
  ) => {
    try {
      await updateStatus.mutateAsync({ 
        applicationId: application.id, 
        status,
        sitterUserId: application.sitter_user_id,
        listingTitle: application.listing?.title,
      });
      toast({
        title: status === "shortlisted" ? "Shortlisted" : "Declined",
        description: `Application has been ${status}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update application status.",
        variant: "destructive",
      });
    }
  };

  const handleAccept = async (application: (typeof applications)[0]) => {
    try {
      await acceptApplication.mutateAsync(application);
      toast({
        title: "Application Accepted",
        description: "The sitter has been confirmed for this sit!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to accept application.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-20">
        <div className="container max-w-4xl mx-auto px-4 py-8">
          <Breadcrumbs />
          <div className="mb-6">
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="h-5 w-5 md:h-6 md:w-6 flex-shrink-0" />
              Applications
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Review and manage nomad applications for your listings
            </p>
          </div>

          {/* Status Filter Tabs */}
          <Tabs
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as FilterStatus);
              setSearchParams(v === "all" ? {} : { status: v }, { replace: true });
            }}
            className="mb-6"
          >
            <TabsList className="w-full justify-start flex-nowrap overflow-x-auto overflow-y-hidden">
              {statusTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Filters */}
          <div className="mb-6">
            <Button
              variant="outline"
              className="w-full relative"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Filters
              {applicationFiltersActive(filters) && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#E8735A]" />
              )}
            </Button>
          </div>

          <ApplicationFilterSheet
            open={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            filters={filters}
            dateOptions={dateOptions}
            onApply={setFilters}
          />


          {/* Applications List */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64 w-full rounded-lg" />
              ))}
            </div>
          ) : visibleApplications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground">No applications yet</h3>
              <p className="text-muted-foreground mt-1 max-w-md">
                {applications.length > 0
                  ? "No applications match these filters yet."
                  : statusFilter === "all"
                    ? "When nomads apply to your listings, they'll appear here."
                    : `No ${statusFilter} applications found.`}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {visibleApplications.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  onStatusChange={(status) => handleStatusChange(application, status)}
                  onAccept={() => handleAccept(application)}
                  isUpdating={updateStatus.isPending || acceptApplication.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Applications;
