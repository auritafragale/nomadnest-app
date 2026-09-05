import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { flagLabel } from "@/lib/trustFlags";
import { useToast } from "@/hooks/use-toast";

interface Strike {
  id: string;
  subject_type: string;
  subject_id: string;
  subject_user_id: string;
  subject_name: string | null;
  listing_title: string | null;
  category: string;
  flag_count: number;
  strike_two_email_sent_at: string | null;
  show_strike_three_warning: boolean;
  updated_at: string;
}

interface ReliabilityRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  reliability_score: number | null;
  strike_count: number;
  last_strike_at: string | null;
}

const AdminTrust = () => {
  const { toast } = useToast();
  const [strikes, setStrikes] = useState<Strike[]>([]);
  const [reliability, setReliability] = useState<ReliabilityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [strikesRes, reliabilityRes] = await Promise.all([
        supabase.rpc("admin_list_community_strikes" as never),
        supabase.rpc("admin_list_reliability_reviews" as never),
      ]);

      if (strikesRes.error || reliabilityRes.error) {
        toast({
          variant: "destructive",
          title: "Could not load trust data",
          description: (strikesRes.error || reliabilityRes.error)?.message,
        });
      }

      setStrikes((strikesRes.data || []) as unknown as Strike[]);
      setReliability((reliabilityRes.data || []) as unknown as ReliabilityRow[]);
      setLoading(false);
    };
    load();
  }, [toast]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Flags &amp; Strikes</h1>
        <AdminNav />

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Private community flags
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : strikes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No private flags recorded. Nothing to review.
              </p>
            ) : (
              strikes.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {s.subject_type === "listing"
                        ? s.listing_title || "Listing"
                        : s.subject_name || "Member"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {flagLabel(s.category)} · {s.subject_type === "listing" ? "Home" : "Nomad"}
                      {" · "}
                      last updated {format(new Date(s.updated_at), "d MMM yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="muted">{s.flag_count} report{s.flag_count === 1 ? "" : "s"}</Badge>
                    {s.strike_two_email_sent_at && <Badge variant="muted">Heads-up sent</Badge>}
                    {s.show_strike_three_warning && (
                      <Badge variant="destructive">Notice showing</Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Reliability reviews
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : reliability.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No members need a reliability review right now.
              </p>
            ) : (
              reliability.map((r) => (
                <div
                  key={r.user_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.full_name || r.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.strike_count} late cancellation{r.strike_count === 1 ? "" : "s"}
                      {r.last_strike_at &&
                        ` · last on ${format(new Date(r.last_strike_at), "d MMM yyyy")}`}
                    </p>
                  </div>
                  <Badge variant="muted">Reliability {r.reliability_score ?? 100}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminTrust;
