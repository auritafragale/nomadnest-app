import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

/** "Download my data": everything we hold about the member, as a JSON file. */
export const DownloadMyDataCard = () => {
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-my-data", { body: {} });
      if (error) {
        const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
        throw new Error(detail?.error || "We couldn't prepare your data just now.");
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nomadnest-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Your data is downloading");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't prepare your data just now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Your data
        </CardTitle>
        <CardDescription>
          Download a copy of everything we hold about you: your profile, listings, sits, messages, reviews and more, as a
          file you can keep. Links to your photos and documents in the file work for 7 days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={download} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {loading ? "Preparing…" : "Download my data"}
        </Button>
      </CardContent>
    </Card>
  );
};
