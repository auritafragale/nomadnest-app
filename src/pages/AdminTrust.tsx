import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ShieldAlert, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { flagLabel } from "@/lib/trustFlags";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

interface FlagIncident {
  review_id: string;
  review_text: string | null;
  reporter_name: string;
  flagged_at: string;
  evidence_reason: string | null;
  evidence_photo_url: string | null;
  evidence_photo_signed_url?: string | null;
}

const EVIDENCE_BUCKET = "arrival-vault-photos";

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
  const [expandedStrikeId, setExpandedStrikeId] = useState<string | null>(null);
  const [incidentsByStrike, setIncidentsByStrike] = useState<Record<string, FlagIncident[]>>({});
  const [loadingIncidents, setLoadingIncidents] = useState<Record<string, boolean>>({});

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

  const toggleStrike = async (s: Strike) => {
    if (expandedStrikeId === s.id) {
      setExpandedStrikeId(null);
      return;
    }
    setExpandedStrikeId(s.id);
    if (incidentsByStrike[s.id]) return;

    setLoadingIncidents((prev) => ({ ...prev, [s.id]: true }));
    const { data, error } = await supabase.rpc("admin_list_flag_incidents" as never, {
      p_subject_type: s.subject_type,
      p_subject_id: s.subject_id,
      p_category: s.category,
    } as never);

    if (error) {
      toast({
        variant: "destructive",
        title: "Could not load flag incidents",
        description: error.message,
      });
      setLoadingIncidents((prev) => ({ ...prev, [s.id]: false }));
      return;
    }

    const incidents = (data || []) as unknown as FlagIncident[];
    const photoPaths = incidents.map((i) => i.evidence_photo_url).filter((p): p is string => !!p);

    if (photoPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrls(photoPaths, 300);
      const signedByPath = Object.fromEntries(
        (signed ?? [])
          .filter((sUrl) => sUrl.path && sUrl.signedUrl)
          .map((sUrl) => [sUrl.path as string, sUrl.signedUrl as string])
      );
      for (const incident of incidents) {
        if (incident.evidence_photo_url) {
          incident.evidence_photo_signed_url = signedByPath[incident.evidence_photo_url] ?? null;
        }
      }
    }

    setIncidentsByStrike((prev) => ({ ...prev, [s.id]: incidents }));
    setLoadingIncidents((prev) => ({ ...prev, [s.id]: false }));
  };

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
              strikes.map((s) => {
                const expanded = expandedStrikeId === s.id;
                const incidents = incidentsByStrike[s.id];
                return (
                  <div key={s.id} className="rounded-xl border border-border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleStrike(s)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left hover:bg-muted/40 transition-colors"
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
                        <ChevronDown
                          className={cn(
                            "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                            expanded && "rotate-180"
                          )}
                        />
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-border bg-muted/20 p-3 space-y-2">
                        {loadingIncidents[s.id] ? (
                          <Skeleton className="h-12 w-full" />
                        ) : !incidents || incidents.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No individual incidents found for this flag.
                          </p>
                        ) : (
                          incidents.map((incident) => (
                            <div
                              key={incident.review_id}
                              className="rounded-lg border border-border bg-background p-3 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{incident.reporter_name}</p>
                                <p className="text-xs text-muted-foreground shrink-0">
                                  {format(new Date(incident.flagged_at), "d MMM yyyy")}
                                </p>
                              </div>
                              {incident.review_text && (
                                <p className="text-sm text-muted-foreground">{incident.review_text}</p>
                              )}
                              {incident.evidence_reason && (
                                <p className="text-sm">
                                  <span className="font-medium">Evidence note: </span>
                                  {incident.evidence_reason}
                                </p>
                              )}
                              {incident.evidence_photo_signed_url && (
                                <img
                                  src={incident.evidence_photo_signed_url}
                                  alt="Flag evidence"
                                  className="mt-1 rounded-lg max-h-48 object-cover"
                                />
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })
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
