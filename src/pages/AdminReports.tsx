import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Flag } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type ReportStatus = "pending" | "reviewed" | "resolved" | "dismissed";

interface ReportRow {
  id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
}

const statusVariant: Record<ReportStatus, "muted" | "destructive"> = {
  pending: "destructive",
  reviewed: "muted",
  resolved: "muted",
  dismissed: "muted",
};

const AdminReports = () => {
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);

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
              reports.map((r) => (
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

                  {r.details && (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{r.details}</p>
                  )}

                  <p className="text-xs text-muted-foreground break-all">
                    Reported {r.target_type} ID: {r.target_id}
                  </p>

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
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminReports;
