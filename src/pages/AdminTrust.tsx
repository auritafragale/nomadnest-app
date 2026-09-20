import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Eye, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type ReviewStatus = "pending" | "reviewed" | "follow_up_needed";

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
  review_status: ReviewStatus;
}

interface StrikeGroup {
  key: string;
  subject_type: string;
  subject_id: string;
  subject_user_id: string;
  subject_name: string | null;
  listing_title: string | null;
  rows: Strike[];
}

const STATUS_TABS: { value: ReviewStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "reviewed", label: "Reviewed" },
  { value: "follow_up_needed", label: "Follow-up needed" },
];

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
  const [activeStatusTab, setActiveStatusTab] = useState<ReviewStatus>("pending");

  const loadTrustData = useCallback(async () => {
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
  }, [toast]);

  useEffect(() => {
    loadTrustData();
  }, [loadTrustData]);

  // Strikes sharing a subject render as one card, with each category as a
  // row inside it.
  const groups = useMemo(() => {
    const byKey = new Map<string, StrikeGroup>();
    for (const s of strikes) {
      const key = `${s.subject_type}:${s.subject_id}`;
      let group = byKey.get(key);
      if (!group) {
        group = {
          key,
          subject_type: s.subject_type,
          subject_id: s.subject_id,
          subject_user_id: s.subject_user_id,
          subject_name: s.subject_name,
          listing_title: s.listing_title,
          rows: [],
        };
        byKey.set(key, group);
      }
      group.rows.push(s);
    }
    return [...byKey.values()];
  }, [strikes]);

  // A group appears under a tab if any of its category rows currently has
  // that status — a group can appear under more than one tab.
  const groupsForStatus = (status: ReviewStatus) =>
    groups.filter((g) => g.rows.some((r) => r.review_status === status));

  const visibleGroups = groupsForStatus(activeStatusTab);

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
          <CardContent className="space-y-4">
            {!loading && strikes.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-border pb-3">
                {STATUS_TABS.map((tab) => {
                  const count = groupsForStatus(tab.value).length;
                  return (
                    <Button
                      key={tab.value}
                      type="button"
                      size="sm"
                      variant={activeStatusTab === tab.value ? "default" : "outline"}
                      onClick={() => setActiveStatusTab(tab.value)}
                      className="gap-1.5"
                    >
                      {tab.label}
                      <Badge
                        variant={activeStatusTab === tab.value ? "secondary" : "muted"}
                        className="h-5 px-1.5"
                      >
                        {count}
                      </Badge>
                    </Button>
                  );
                })}
              </div>
            )}

            {loading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : strikes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No private flags recorded. Nothing to review.
              </p>
            ) : visibleGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing in this tab right now.
              </p>
            ) : (
              <div className="space-y-3">
                {visibleGroups.map((group) => (
                  <div
                    key={group.key}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {group.subject_type === "listing" ? (
                          <Link to={`/listing/${group.subject_id}`} className="hover:underline">
                            {group.listing_title || "Listing"}
                          </Link>
                        ) : (
                          group.subject_name || "Member"
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {group.subject_type === "listing" ? "Home" : "Nomad"} · {group.rows.length} flagged categor
                        {group.rows.length === 1 ? "y" : "ies"}
                      </p>
                      <Link
                        to={
                          group.subject_type === "listing"
                            ? `/owner/${group.subject_user_id}`
                            : `/sitter/${group.subject_user_id}`
                        }
                        className="text-xs text-primary hover:underline"
                      >
                        View {group.subject_name || (group.subject_type === "listing" ? "owner" : "member")}'s profile
                      </Link>
                    </div>
                    <Button asChild type="button" size="sm" variant="outline" className="shrink-0 gap-1.5">
                      <Link to={`/admin/trust/${group.subject_type}/${group.subject_id}`}>
                        <Eye className="w-4 h-4" />
                        View
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
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
