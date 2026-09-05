import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Flag, ExternalLink, FileText } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type ReportStatus = "pending" | "reviewed" | "resolved" | "dismissed";
type ReportTargetType = "user" | "listing" | "message";

interface ReportRow {
  id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  target_name: string | null;
  target_email: string | null;
  target_profile_user_id: string | null;
  evidence_paths: string[] | null;
}

const statusVariant: Record<ReportStatus, "muted" | "destructive"> = {
  pending: "destructive",
  reviewed: "muted",
  resolved: "muted",
  dismissed: "muted",
};

const TABS: ReportStatus[] = ["pending", "reviewed", "resolved", "dismissed"];

const AdminReports = () => {
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReportStatus>("pending");

  const grouped = useMemo(() => {
    const map: Record<ReportStatus, ReportRow[]> = {
      pending: [],
      reviewed: [],
      resolved: [],
      dismissed: [],
    };
    for (const r of reports) map[r.status].push(r);
    return map;
  }, [reports]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_reports" as never);
    if (error) {
      toast({
        variant: "destructive",
        title: "Could not load reports",
        description: error.message,
      });
    }
    setReports((data || []) as unknown as ReportRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStatus = async (id: string, status: ReportStatus) => {
    const { error } = await supabase.rpc("admin_set_report_status" as never, {
      p_report_id: id,
      p_status: status,
    } as never);
    if (error) {
      toast({ variant: "destructive", title: "Could not update", description: error.message });
      return;
    }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast({ title: "Report updated" });
  };

  // Build the public profile link for a reported target. For listings, the
  // target_id is a listing id (link to /listing/:id); for users/messages the
  // target_profile_user_id (resolved from profiles) links to the profile.
  const targetLink = (r: ReportRow): { to: string; label: string } | null => {
    if (r.target_type === "listing") {
      return { to: `/listing/${r.target_id}`, label: r.target_name || "View listing" };
    }
    if (r.target_profile_user_id) {
      // Sitter and owner profiles live under different slugs; the listing page
      // is the safest shared entry point, but the user profile pages are what
      // founders need to message from. Try sitter first, owner second.
      return { to: `/sitter/${r.target_profile_user_id}`, label: r.target_name || "View profile" };
    }
    return null;
  };

  const openEvidence = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("report-evidence")
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast({ variant: "destructive", title: "Could not open proof", description: error?.message });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Reports</h1>
        <AdminNav />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flag className="w-5 h-5 text-amber-500" />
              Member safety reports
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : reports.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reports have been submitted. Nothing to review.
              </p>
            ) : (
              reports.map((r) => {
                const link = targetLink(r);
                const evidence = r.evidence_paths ?? [];
                return (
                  <div key={r.id} className="rounded-xl border border-border p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {r.reason} · <span className="capitalize">{r.target_type}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          From {r.reporter_name || r.reporter_email || "a member"} ·{" "}
                          {format(new Date(r.created_at), "d MMM yyyy")}
                        </p>
                      </div>
                      <Badge variant={statusVariant[r.status]} className="capitalize">
                        {r.status}
                      </Badge>
                    </div>

                    {/* Reported member / target */}
                    <div className="text-sm">
                      <span className="text-muted-foreground">Reported: </span>
                      {link ? (
                        <Link
                          to={link.to}
                          className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {link.label}
                          {r.target_email && (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              ({r.target_email})
                            </span>
                          )}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {r.target_name || r.target_email || r.target_id}
                        </span>
                      )}
                    </div>

                    {r.details && (
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {r.details}
                      </p>
                    )}

                    {evidence.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {evidence.map((path) => {
                          const name = path.split("/").pop() || "Proof";
                          return (
                            <Button
                              key={path}
                              variant="outline"
                              size="sm"
                              onClick={() => openEvidence(path)}
                              className="gap-1.5"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {name.length > 24 ? name.slice(0, 21) + "…" : name}
                            </Button>
                          );
                        })}
                      </div>
                    )}

                    <Select value={r.status} onValueChange={(v) => setStatus(r.id, v as ReportStatus)}>
                      <SelectTrigger className="w-full sm:w-56" aria-label="Change report status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="reviewed">Reviewed</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="dismissed">Dismissed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminReports;
