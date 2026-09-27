import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Preview {
  files: { name: string; size: number | null; created_at: string }[];
  checkins: { id: string; sit_id: string; photo_url: string; in_checkins_folder: boolean }[];
  chat_messages: number;
}

const invoke = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("cleanup-checkin-photos", { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(detail?.error || error.message);
  }
  return data as Record<string, unknown>;
};

/**
 * One-off: review, then delete, the old check-in photos that were stored in
 * the public listing-images bucket. Only paths with a "checkins" folder are
 * deleted; listing photos are never touched.
 */
const AdminCheckinPhotoCleanup = () => {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const loadPreview = async () => {
    setLoading(true);
    setResult(null);
    try {
      setPreview((await invoke({ confirm: false })) as unknown as Preview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  };

  const runCleanup = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const done = await invoke({ confirm: true, expected_files: preview.files.length });
      setResult(done);
      setPreview(null);
      setConfirmText("");
      toast.success("Cleanup finished");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setLoading(false);
    }
  };

  const outside = preview?.checkins.filter((c) => !c.in_checkins_folder) ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 pb-8 pt-20">
        <AdminNav />
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Old check-in photos in the public bucket</CardTitle>
            <CardDescription>
              Step 1: preview. Nothing changes until you confirm in step 2. Only files in a "checkins" folder of
              listing-images are deleted. Listing photos are never touched.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Button onClick={loadPreview} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {preview ? "Refresh preview" : "Preview"}
            </Button>

            {result && (
              <div className="rounded-xl border bg-muted/40 p-4 text-sm">
                <p className="font-medium">Done</p>
                <pre className="mt-2 whitespace-pre-wrap text-xs">{JSON.stringify(result, null, 2)}</pre>
              </div>
            )}

            {preview && (
              <>
                <div className="space-y-2">
                  <h3 className="font-semibold">Files to delete ({preview.files.length})</h3>
                  {preview.files.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None.</p>
                  ) : (
                    <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border p-3 font-mono text-xs">
                      {preview.files.map((f) => (
                        <li key={f.name} className="break-all">
                          {f.name}
                          <span className="text-muted-foreground">
                            {" "}
                            ({f.size ? `${Math.round(f.size / 1024)} KB` : "?"}, {new Date(f.created_at).toLocaleDateString()})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-1 text-sm">
                  <h3 className="font-semibold">References to clear</h3>
                  <p>Check-ins with a public photo_url: {preview.checkins.length}</p>
                  <p>Chat check-in cards with a public photo: {preview.chat_messages}</p>
                  {outside.length > 0 && (
                    <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                      <p className="font-medium">
                        {outside.length} check-in(s) point to a file outside a checkins folder. Their photo_url is cleared,
                        but the file is NOT deleted:
                      </p>
                      <ul className="mt-1 space-y-1 font-mono text-xs">
                        {outside.map((c) => (
                          <li key={c.id} className="break-all">{c.photo_url}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-xl border border-destructive/40 p-4">
                  <h3 className="font-semibold">Step 2: delete</h3>
                  <p className="text-sm text-muted-foreground">
                    Type DELETE to delete the {preview.files.length} files above and clear the references. This can't be undone.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" className="sm:max-w-40" />
                    <Button
                      variant="destructive"
                      disabled={loading || confirmText !== "DELETE" || (preview.files.length === 0 && preview.checkins.length === 0 && preview.chat_messages === 0)}
                      onClick={runCleanup}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete {preview.files.length} files and clear references
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminCheckinPhotoCleanup;
