import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AdminNav from "@/components/admin/AdminNav";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, XCircle, Clock, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const REJECTION_REASONS = [
  "Photo ID is blurry or unreadable",
  "ID document appears to be expired",
  "Name on ID does not match your profile name",
  "Selfie does not match the ID photo",
  "Wrong document type submitted — please upload a government-issued photo ID",
  "ID is partially covered or cropped — please resubmit showing the full document",
  "Other (see notes below)",
];

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);
  const [rejectingSub, setRejectingSub] = useState<Submission | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectNotes, setRejectNotes] = useState<string>("");

  // Access is already enforced by AdminRoute
  useEffect(() => {
    loadSubmissions();
  }, []);


  const loadSubmissions = async () => {
    setLoadingData(true);
    // Admin-only secure lookup: includes the submitter's name and email
    const { data, error } = await supabase.rpc("admin_list_id_verifications");

    if (error) {
      toast({ variant: "destructive", title: "Failed to load submissions", description: error.message });
    } else {
      setSubmissions((data ?? []) as unknown as Submission[]);
    }
    setLoadingData(false);
  };

  const getSignedUrl = async (path: string) => {
    const { data } = await supabase.storage
      .from("id-verification-documents")
      .createSignedUrl(path, 300); // 5-minute URL
    return data?.signedUrl ?? null;
  };

  const handleDecision = async (
    submissionId: string,
    userId: string,
    decision: "approved" | "rejected",
    rejectionReason?: string,
    rejectionNotes?: string,
  ) => {
    setActing(submissionId);
    try {
      const combinedNotes =
        decision === "rejected"
          ? `${rejectionReason}${rejectionNotes ? `: ${rejectionNotes}` : ""}`
          : (notes[submissionId] ?? null);

      const updatePayload: Record<string, unknown> = {
        status: decision,
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
        notes: combinedNotes,
      };

      const { error: updateError } = await supabase
        .from("manual_id_verifications")
        .update(updatePayload)
        .eq("id", submissionId);

      if (updateError) throw updateError;

      if (decision === "approved") {
        // Flip profiles.id_verified
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ id_verified: true })
          .eq("id", userId);
        if (profileError) throw profileError;

        // Email + in-app notification are both created by send-notification-email


        // Email via existing send-notification-email
        await supabase.functions.invoke("send-notification-email", {
          body: {
            type: "id_verification_approved",
            recipientUserId: userId,
            data: { appUrl: window.location.origin },
          },
        });
      } else {
        // Rejected — call notify-id-rejected (handles email + in-app notification)
        await supabase.functions.invoke("notify-id-rejected", {
          body: {
            userId,
            reason: rejectionReason,
            notes: rejectionNotes || undefined,
          },
        });
      }

      toast({ title: decision === "approved" ? "Approved ✓" : "Rejected", description: `Submission ${submissionId.slice(0, 8)} has been ${decision}.` });
      await loadSubmissions();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action failed", description: err.message });
    } finally {
      setActing(null);
    }
  };

  const openRejectDialog = (sub: Submission) => {
    setRejectingSub(sub);
    setRejectReason("");
    setRejectNotes("");
  };

  const confirmReject = async () => {
    if (!rejectingSub || !rejectReason) return;
    const sub = rejectingSub;
    setRejectingSub(null);
    await handleDecision(sub.id, sub.user_id, "rejected", rejectReason, rejectNotes);
  };

  const pending   = submissions.filter(s => s.status === "pending");
  const reviewed  = submissions.filter(s => s.status !== "pending");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 pb-12">
        <div className="container max-w-4xl mx-auto px-4">
          <AdminNav />
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
                        onDecision={(d) => d === "approved" ? handleDecision(sub.id, sub.user_id, "approved") : openRejectDialog(sub)}
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

      <Dialog open={!!rejectingSub} onOpenChange={(open) => !open && setRejectingSub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject ID submission</DialogTitle>
            <DialogDescription>
              Select a reason. The member will be notified by email and in-app with this explanation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Reason <span className="text-destructive">*</span></Label>
              <Select value={rejectReason} onValueChange={setRejectReason}>
                <SelectTrigger id="reject-reason">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reject-notes">Additional notes (optional)</Label>
              <Textarea
                id="reject-notes"
                placeholder="Extra context for the member (optional)"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">{rejectNotes.length}/500</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingSub(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={!rejectReason || acting === rejectingSub?.id}
            >
              {acting === rejectingSub?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
