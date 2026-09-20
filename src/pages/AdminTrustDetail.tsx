import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ArrowLeft, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { flagLabel } from "@/lib/trustFlags";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

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

interface FlagIncident {
  review_id: string;
  review_text: string | null;
  reporter_name: string;
  flagged_at: string;
  evidence_reason: string | null;
  evidence_photo_url: string | null;
  evidence_photo_signed_url?: string | null;
}

interface StrikeNote {
  id: string;
  strike_id: string;
  admin_user_id: string;
  note: string;
  created_at: string;
  admin_name?: string | null;
}

const EVIDENCE_BUCKET = "arrival-vault-photos";

const STATUS_TABS: { value: ReviewStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "reviewed", label: "Reviewed" },
  { value: "follow_up_needed", label: "To Follow Up" },
];

const STATUS_BADGE_VARIANT: Record<ReviewStatus, "muted" | "secondary" | "destructive"> = {
  pending: "muted",
  reviewed: "secondary",
  follow_up_needed: "destructive",
};

const AdminTrustDetail = () => {
  const { subjectType, subjectId } = useParams<{ subjectType: string; subjectId: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<Strike[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStrikeId, setExpandedStrikeId] = useState<string | null>(null);
  const [incidentsByStrike, setIncidentsByStrike] = useState<Record<string, FlagIncident[]>>({});
  const [loadingIncidents, setLoadingIncidents] = useState<Record<string, boolean>>({});
  const [updatingStatusFor, setUpdatingStatusFor] = useState<string | null>(null);
  const [notesByStrike, setNotesByStrike] = useState<Record<string, StrikeNote[]>>({});
  const [loadingNotes, setLoadingNotes] = useState<Record<string, boolean>>({});
  const [noteDraftByStrike, setNoteDraftByStrike] = useState<Record<string, string>>({});
  const [addingNoteFor, setAddingNoteFor] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_community_strikes" as never);

    if (error) {
      toast({
        variant: "destructive",
        title: "Could not load flag data",
        description: error.message,
      });
    }

    const all = (data || []) as unknown as Strike[];
    setRows(all.filter((s) => s.subject_type === subjectType && s.subject_id === subjectId));
    setLoading(false);
  }, [toast, subjectType, subjectId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const subject = rows[0] as Strike | undefined;

  const toggleStrike = (s: Strike) => {
    if (expandedStrikeId === s.id) {
      setExpandedStrikeId(null);
      return;
    }
    setExpandedStrikeId(s.id);
    if (!incidentsByStrike[s.id]) void loadIncidents(s);
    if (!notesByStrike[s.id]) void loadNotes(s.id);
  };

  const loadIncidents = async (s: Strike) => {
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

  const loadNotes = async (strikeId: string) => {
    setLoadingNotes((prev) => ({ ...prev, [strikeId]: true }));
    const { data, error } = await supabase
      .from("community_strike_notes")
      .select("*")
      .eq("strike_id", strikeId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Could not load notes",
        description: error.message,
      });
      setLoadingNotes((prev) => ({ ...prev, [strikeId]: false }));
      return;
    }

    const notes = (data || []) as unknown as StrikeNote[];
    const adminIds = [...new Set(notes.map((n) => n.admin_user_id))];
    if (adminIds.length > 0) {
      const { data: admins } = await supabase.from("profiles").select("id, full_name").in("id", adminIds);
      const nameById = new Map((admins || []).map((a) => [a.id, a.full_name]));
      for (const note of notes) {
        note.admin_name = nameById.get(note.admin_user_id) ?? null;
      }
    }

    setNotesByStrike((prev) => ({ ...prev, [strikeId]: notes }));
    setLoadingNotes((prev) => ({ ...prev, [strikeId]: false }));
  };

  const addNote = async (strike: Strike) => {
    const text = (noteDraftByStrike[strike.id] || "").trim();
    if (!text || !user || addingNoteFor === strike.id) return;

    setAddingNoteFor(strike.id);
    const { error } = await supabase.from("community_strike_notes").insert({
      strike_id: strike.id,
      admin_user_id: user.id,
      note: text,
    });
    setAddingNoteFor(null);

    if (error) {
      toast({
        variant: "destructive",
        title: "Could not add note",
        description: error.message,
      });
      return;
    }

    setNoteDraftByStrike((prev) => ({ ...prev, [strike.id]: "" }));
    // Refetch so the new note appears immediately at the top.
    await loadNotes(strike.id);
  };

  const updateReviewStatus = async (strike: Strike, next: ReviewStatus) => {
    if (strike.review_status === next || updatingStatusFor === strike.id) return;
    setUpdatingStatusFor(strike.id);
    const { error } = await supabase
      .from("community_strikes")
      .update({ review_status: next })
      .eq("id", strike.id);
    setUpdatingStatusFor(null);

    if (error) {
      toast({
        variant: "destructive",
        title: "Could not update status",
        description: error.message,
      });
      return;
    }

    // Refetch so the row reflects the change live.
    await loadRows();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <Link
          to="/admin/trust"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-4 hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Flags &amp; Strikes
        </Link>

        <AdminNav />

        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : !subject ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No flags found for this subject.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold truncate">
                {subject.subject_type === "listing" ? (
                  <Link to={`/listing/${subject.subject_id}`} className="hover:underline">
                    {subject.listing_title || "Listing"}
                  </Link>
                ) : (
                  subject.subject_name || "Member"
                )}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {subject.subject_type === "listing" ? "Home" : "Nomad"} · {rows.length} flagged categor
                {rows.length === 1 ? "y" : "ies"}
              </p>
              <Link
                to={
                  subject.subject_type === "listing"
                    ? `/owner/${subject.subject_user_id}`
                    : `/sitter/${subject.subject_user_id}`
                }
                className="text-sm text-primary hover:underline"
              >
                View {subject.subject_name || (subject.subject_type === "listing" ? "owner" : "member")}'s profile
              </Link>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Flagged categories
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {rows.map((s) => {
                    const expanded = expandedStrikeId === s.id;
                    const incidents = incidentsByStrike[s.id];
                    return (
                      <div key={s.id}>
                        <button
                          type="button"
                          onClick={() => toggleStrike(s)}
                          className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left hover:bg-muted/40 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{flagLabel(s.category)}</p>
                            <p className="text-xs text-muted-foreground">
                              last updated {format(new Date(s.updated_at), "d MMM yyyy")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="muted">{s.flag_count} report{s.flag_count === 1 ? "" : "s"}</Badge>
                            {s.strike_two_email_sent_at && <Badge variant="muted">Heads-up sent</Badge>}
                            {s.show_strike_three_warning && (
                              <Badge variant="destructive">Notice showing</Badge>
                            )}
                            <Badge variant={STATUS_BADGE_VARIANT[s.review_status]}>
                              {STATUS_TABS.find((t) => t.value === s.review_status)?.label ?? s.review_status}
                            </Badge>
                            <ChevronDown
                              className={cn(
                                "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                                expanded && "rotate-180"
                              )}
                            />
                          </div>
                        </button>

                        {expanded && (
                          <div className="border-t border-border bg-muted/20 p-3 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">Status:</span>
                              {STATUS_TABS.map((tab) => (
                                <Button
                                  key={tab.value}
                                  type="button"
                                  size="sm"
                                  variant={s.review_status === tab.value ? "default" : "outline"}
                                  disabled={updatingStatusFor === s.id}
                                  onClick={() => updateReviewStatus(s, tab.value)}
                                >
                                  {tab.label}
                                </Button>
                              ))}
                            </div>

                            {loadingIncidents[s.id] ? (
                              <Skeleton className="h-12 w-full" />
                            ) : !incidents || incidents.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No individual incidents found for this flag.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {incidents.map((incident) => (
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
                                ))}
                              </div>
                            )}

                            <div className="space-y-2 pt-2 border-t border-border/60">
                              <span className="text-xs font-medium text-muted-foreground">Admin notes:</span>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                <Textarea
                                  value={noteDraftByStrike[s.id] || ""}
                                  onChange={(e) =>
                                    setNoteDraftByStrike((prev) => ({ ...prev, [s.id]: e.target.value }))
                                  }
                                  placeholder="Add a note for other admins..."
                                  className="min-h-[60px] text-sm bg-background"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="shrink-0"
                                  disabled={!noteDraftByStrike[s.id]?.trim() || addingNoteFor === s.id}
                                  onClick={() => addNote(s)}
                                >
                                  Add note
                                </Button>
                              </div>

                              {loadingNotes[s.id] ? (
                                <Skeleton className="h-10 w-full" />
                              ) : notesByStrike[s.id] && notesByStrike[s.id].length > 0 ? (
                                <div className="space-y-2">
                                  {notesByStrike[s.id].map((note) => (
                                    <div
                                      key={note.id}
                                      className="rounded-lg border border-border bg-background p-2.5 space-y-1"
                                    >
                                      <p className="text-sm">{note.note}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {note.admin_name || "Admin"} ·{" "}
                                        {format(new Date(note.created_at), "d MMM yyyy, HH:mm")}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No notes yet.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default AdminTrustDetail;
