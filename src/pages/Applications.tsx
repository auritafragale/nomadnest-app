import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { ApplicationCard } from "@/components/applications/ApplicationCard";
import {
  useOwnerApplications,
  useUpdateApplicationStatus,
  useAcceptApplication,
} from "@/hooks/useApplications";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Inbox } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type ApplicationStatus = Database["public"]["Enums"]["application_status"];
type FilterStatus = ApplicationStatus | "all";

const statusTabs: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "applied", label: "New" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
];

const Applications = () => {
  const { user, loading, role } = useAuth();
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const { toast } = useToast();

  const { data: applications = [], isLoading } = useOwnerApplications(statusFilter);
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
            onValueChange={(v) => setStatusFilter(v as FilterStatus)}
            className="mb-6"
          >
            <TabsList className="w-full justify-start overflow-x-auto">
              {statusTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Applications List */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64 w-full rounded-lg" />
              ))}
            </div>
          ) : applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground">No applications yet</h3>
              <p className="text-muted-foreground mt-1 max-w-md">
                {statusFilter === "all"
                  ? "When nomads apply to your listings, they'll appear here."
                  : `No ${statusFilter} applications found.`}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {applications.map((application) => (
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
