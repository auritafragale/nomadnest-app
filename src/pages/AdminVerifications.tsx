import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, CheckCircle2, XCircle, Clock, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Submission {
  id: string;
  user_id: string;
  id_photo_path: string;
  selfie_path: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  // joined from profiles
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

const statusBadge = (status: string) => {
  if (status === "approved") return <Badge className="bg-green-100 text-green-700 border-green-300">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-red-300">Rejected</Badge>;
  return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
};

const AdminVerifications = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  // Check admin status then load submissions
  useEffect(() => {
    if (authLoading || (!user && !authLoading)) {
      if (authLoading) return;
      // wait one tick for session restoration before redirecting
      const t = setTimeout(() => {
        if (!user) navigate("/auth");
      }, 100);
      return () => clearTimeout(t);
    }
    if (!user) { navigate("/auth"); return; }

    const init = async () => {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      const admin = !!(profileData as any)?.is_admin;
      setIsAdmin(admin);
      if (!admin) { setLoadingData(false); return; }

      await loadSubmissions();
    };

    init();
  }, [user, authLoading]);

  const loadSubmissions = async () => {
    setLoadingData(true);
    // Fetch submissions and join with profile data for reviewer names
    const { data, error } = await supabase
      .from("manual_id_verifications")
      .select(`
        id, user_id, id_photo_path, selfie_path, status,
        reviewed_by, reviewed_at, notes, created_at,
        profiles!manual_id_verifications_user_id_fkey (
          first_name, last_name, email
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ variant: "destructive", title: "Failed to load submissions", description: error.message });
    } else {
      setSubmissions(
        (data ?? []).map((row: any) => ({
          ...row,
          first_name: row.profiles?.first_name ?? null,
          last_name: row.profiles?.last_name ?? null,
          email: row.profiles?.email ?? null,
        }))
      );
    }
    setLoadingData(false);
  };

  const getSignedUrl = async (path: string) => {
    const { data } = await supabase.storage
      .from("id-verification-documents")
      .createSignedUrl(path, 300); // 5-minute URL
    return data?.signedUrl ?? null;
  };

  const handleDecision = async (submissionId: string, userId: string, decision: "approved" | "rejected") => {
    setActing(submissionId);
    try {
      const updatePayload: Record<string, unknown> = {
        status: decision,
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
        notes: notes[submissionId] ?? null,
      };

      const { error: updateError } = await supabase
        .from("manual_id_verifications")
        .update(updatePayload)
        .eq("id", submissionId);

      if (updateError) throw updateError;

      if (decision === "approved") {
        // Also flip profiles.id_verified so the badge logic works regardless
        // of whether Onfido or manual review was used.
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ id_verified: true })
          .eq("id", userId);
        if (profileError) throw profileError;
      }

      toast({ title: decision === "approved" ? "Approved ✓" : "Rejected", description: `Submission ${submissionId.slice(0, 8)} has been ${decision}.` });
      await loadSubmissions();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action failed", description: err.message });
    } finally {
      setActing(null);
    }
  };

  if (authLoading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-12 container max-w-2xl mx-auto px-4 text-center">
          <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Not Authorised</h1>
          <p className="text-muted-foreground mb-6">You do not have admin access to this page.</p>
          <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </main>
      </div>
    );
  }

  const pending   = submissions.filter(s => s.status === "pending");
  const reviewed  = submissions.filter(s => s.status !== "pending");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 pb-12">
        <div className="container max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-8">
            <ShieldCheck className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">ID Verification Review</h1>
              <p className="text-sm text-muted-foreground">{pending.length} pending · {reviewed.length} reviewed</p>
            </div>
          </div>

          {loadingData ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
            </div>
          ) : pending.length === 0 && reviewed.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                No submissions yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {pending.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Pending ({pending.length})
                  </h2>
                  <div className="space-y-4">
                    {pending.map(sub => (
                      <SubmissionCard
                        key={sub.id}
                        sub={sub}
                        notes={notes[sub.id] ?? ""}
                        onNotesChange={(v) => setNotes(n => ({ ...n, [sub.id]: v }))}
                        onDecision={(d) => handleDecision(sub.id, sub.user_id, d)}
                        acting={acting === sub.id}
                        getSignedUrl={getSignedUrl}
                      />
                    ))}
                  </div>
                </section>
              )}

              {reviewed.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-3">Reviewed ({reviewed.length})</h2>
                  <div className="space-y-4">
                    {reviewed.map(sub => (
                      <SubmissionCard
                        key={sub.id}
                        sub={sub}
                        notes={notes[sub.id] ?? ""}
                        onNotesChange={() => {}}
                        onDecision={() => {}}
                        acting={false}
                        getSignedUrl={getSignedUrl}
                        readOnly
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

interface CardProps {
  sub: Submission;
  notes: string;
  onNotesChange: (v: string) => void;
  onDecision: (d: "approved" | "rejected") => void;
  acting: boolean;
  getSignedUrl: (path: string) => Promise<string | null>;
  readOnly?: boolean;
}

const SubmissionCard = ({ sub, notes, onNotesChange, onDecision, acting, getSignedUrl, readOnly }: CardProps) => {
  const [idUrl, setIdUrl] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const expand = async () => {
    if (expanded) { setExpanded(false); return; }
    setLoadingUrls(true);
    const [id, selfie] = await Promise.all([
      getSignedUrl(sub.id_photo_path),
      getSignedUrl(sub.selfie_path),
    ]);
    setIdUrl(id);
    setSelfieUrl(selfie);
    setLoadingUrls(false);
    setExpanded(true);
  };

  const name = [sub.first_name, sub.last_name].filter(Boolean).join(" ") || "Unknown";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{name}</CardTitle>
            <p className="text-sm text-muted-foreground">{sub.email ?? sub.user_id}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Submitted {new Date(sub.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(sub.status)}
            <Button variant="ghost" size="sm" onClick={expand}>
              {loadingUrls ? <Loader2 className="w-4 h-4 animate-spin" /> : expanded ? "Hide" : "View docs"}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">PHOTO ID</p>
              {idUrl
                ? <img src={idUrl} alt="ID" className="w-full rounded-lg border object-contain max-h-64" />
                : <p className="text-sm text-muted-foreground">Could not load image</p>}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">SELFIE</p>
              {selfieUrl
                ? <img src={selfieUrl} alt="Selfie" className="w-full rounded-lg border object-contain max-h-64" />
                : <p className="text-sm text-muted-foreground">Could not load image</p>}
            </div>
          </div>

          {!readOnly && (
            <div className="space-y-3 pt-2 border-t">
              <Textarea
                placeholder="Notes (optional, only visible to admins)"
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => onDecision("approved")}
                  disabled={acting}
                >
                  {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-2" />Approve</>}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => onDecision("rejected")}
                  disabled={acting}
                >
                  {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-2" />Reject</>}
                </Button>
              </div>
            </div>
          )}

          {readOnly && sub.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-1">NOTES</p>
              <p className="text-sm">{sub.notes}</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default AdminVerifications;
