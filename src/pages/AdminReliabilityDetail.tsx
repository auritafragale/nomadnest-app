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
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface ProfileInfo {
  full_name: string | null;
  email: string | null;
  reliability_score: number | null;
}

interface CancellationStrikeRow {
  id: string;
  created_at: string;
  days_before_start: number | null;
  reason: string | null;
  sit_id: string | null;
  sits: {
    listing_id: string;
    listings: { title: string | null } | null;
  } | null;
}

interface ReliabilityNote {
  id: string;
  user_id: string;
  admin_user_id: string;
  note: string;
  created_at: string;
  admin_name?: string | null;
}

const AdminReliabilityDetail = () => {
  const { userId } = useParams<{ userId: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [strikes, setStrikes] = useState<CancellationStrikeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<ReliabilityNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [profileRes, strikesRes] = await Promise.all([
      supabase.from("profiles").select("full_name, email, reliability_score").eq("id", userId).maybeSingle(),
      supabase
        .from("cancellation_strikes")
        .select("id, created_at, days_before_start, reason, sit_id, sits(listing_id, listings(title))")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    if (profileRes.error || strikesRes.error) {
      toast({
        variant: "destructive",
        title: "Could not load reliability data",
        description: (profileRes.error || strikesRes.error)?.message,
      });
    }

    setProfile((profileRes.data as ProfileInfo) ?? null);
    setStrikes((strikesRes.data || []) as unknown as CancellationStrikeRow[]);
    setLoading(false);
  }, [toast, userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadNotes = useCallback(async () => {
    if (!userId) return;
    setLoadingNotes(true);
    const { data, error } = await supabase
      .from("reliability_review_notes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Could not load notes",
        description: error.message,
      });
      setLoadingNotes(false);
      return;
    }

    const rows = (data || []) as unknown as ReliabilityNote[];
    const adminIds = [...new Set(rows.map((n) => n.admin_user_id))];
    if (adminIds.length > 0) {
      const { data: admins } = await supabase.from("profiles").select("id, full_name").in("id", adminIds);
      const nameById = new Map((admins || []).map((a) => [a.id, a.full_name]));
      for (const note of rows) {
        note.admin_name = nameById.get(note.admin_user_id) ?? null;
      }
    }

    setNotes(rows);
    setLoadingNotes(false);
  }, [toast, userId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const addNote = async () => {
    const text = noteDraft.trim();
    if (!text || !user || !userId || addingNote) return;

    setAddingNote(true);
    const { error } = await supabase.from("reliability_review_notes").insert({
      user_id: userId,
      admin_user_id: user.id,
      note: text,
    });
    setAddingNote(false);

    if (error) {
      toast({
        variant: "destructive",
        title: "Could not add note",
        description: error.message,
      });
      return;
    }

    setNoteDraft("");
    // Refetch so the new note appears immediately at the top.
    await loadNotes();
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
        ) : !profile ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Member not found.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold truncate">{profile.full_name || profile.email}</h1>
                <p className="text-sm text-muted-foreground">
                  {strikes.length} late cancellation{strikes.length === 1 ? "" : "s"}
                </p>
              </div>
              <Badge variant="muted" className="text-sm shrink-0">
                Reliability {profile.reliability_score ?? 100}
              </Badge>
            </div>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                  Cancellation history
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {strikes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No late cancellations recorded.</p>
                ) : (
                  strikes.map((s) => (
                    <div key={s.id} className="rounded-lg border border-border p-3 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{s.sits?.listings?.title || "Listing"}</p>
                        <p className="text-xs text-muted-foreground shrink-0">
                          {format(new Date(s.created_at), "d MMM yyyy")}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {s.days_before_start != null
                          ? `Cancelled ${s.days_before_start} day${s.days_before_start === 1 ? "" : "s"} before start`
                          : "Cancelled"}
                        {s.reason && ` · ${s.reason}`}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Admin notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Add a note for other admins..."
                    className="min-h-[60px] text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0"
                    disabled={!noteDraft.trim() || addingNote}
                    onClick={addNote}
                  >
                    Add note
                  </Button>
                </div>

                {loadingNotes ? (
                  <Skeleton className="h-10 w-full" />
                ) : notes.length > 0 ? (
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <div key={note.id} className="rounded-lg border border-border bg-background p-2.5 space-y-1">
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
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default AdminReliabilityDetail;
