import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { ImageOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

type Mode = "dry_run" | "run";
interface Counts {
  scanned: number;
  had_gps: number;
  had_other_metadata: number;
  cleaned: number;
  skipped: number;
  failed: number;
}
interface Result {
  mode: Mode;
  done: boolean;
  cursor: unknown;
  buckets: Record<string, Counts>;
  arrival_orphans: number;
}

const COLUMNS: { key: keyof Counts; label: string }[] = [
  { key: "scanned", label: "Scanned" },
  { key: "had_gps", label: "Had location" },
  { key: "had_other_metadata", label: "Other metadata" },
  { key: "cleaned", label: "Cleaned" },
  { key: "skipped", label: "Skipped" },
  { key: "failed", label: "Failed" },
];

const invoke = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("strip-photo-metadata", { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(detail?.error || error.message);
  }
  return data as Result;
};

/**
 * Photo privacy clean-up: counts (Check) or removes (Clean now) location and
 * other metadata in photos uploaded before photos were cleaned on the device.
 * Works in batches of 50 until every bucket is done. Counts only, never file
 * names.
 */
export const PhotoPrivacyCleanupCard = () => {
  const [running, setRunning] = useState<Mode | null>(null);
  const [batches, setBatches] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [confirm, setConfirm] = useState(false);

  const start = async (mode: Mode) => {
    setRunning(mode);
    setBatches(0);
    setResult(null);
    try {
      let cursor: unknown = null;
      for (let i = 0; i < 10_000; i++) {
        const r = await invoke({ mode, cursor });
        setResult(r);
        setBatches(i + 1);
        if (r.done) break;
        cursor = r.cursor;
      }
      toast.success(mode === "run" ? "Clean-up finished" : "Check finished");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setRunning(null);
    }
  };

  const total = (k: keyof Counts) => Object.values(result?.buckets ?? {}).reduce((n, c) => n + (c?.[k] ?? 0), 0);

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageOff className="w-4 h-4 text-primary" />
          Photo privacy clean-up
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Removes location and other hidden details from photos uploaded before photos were cleaned on the phone. Pictures
          aren't changed. ID documents are never touched. "Check" only counts.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!running} onClick={() => start("dry_run")}>
            {running === "dry_run" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Check
          </Button>
          <Button disabled={!!running} onClick={() => setConfirm(true)}>
            {running === "run" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Clean now
          </Button>
        </div>
        {running && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Working… {batches} {batches === 1 ? "batch" : "batches"} of up to 50 photos done.
          </p>
        )}
        {result && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {result.mode === "run" ? "Clean-up" : "Check"} {result.done ? "complete" : "in progress"}
            </p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2 font-medium">Bucket</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="p-2 text-right font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.buckets).map(([bucket, counts]) => (
                    <tr key={bucket} className="border-t">
                      <td className="p-2 font-mono text-xs">{bucket}</td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="p-2 text-right tabular-nums">
                          {counts[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t font-semibold">
                    <td className="p-2">Total</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="p-2 text-right tabular-nums">
                        {total(c.key)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground">
              Arrival Check-In files with no photo record and not used as flag evidence: {result.arrival_orphans} (counted
              only, nothing deleted).
            </p>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clean all photos now?</AlertDialogTitle>
            <AlertDialogDescription>
              Every photo that still has location or other hidden details is rewritten without them, in the same place. The
              pictures look the same. This can't be undone. ID documents are never touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={() => start("run")}>Clean now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
