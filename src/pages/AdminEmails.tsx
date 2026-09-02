import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Send, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EmailTemplatePreview {
  id: string;
  label: string;
  group: string;
  subject: string;
  html: string;
}

const AdminEmails = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplatePreview[]>([]);
  const [selected, setSelected] = useState<EmailTemplatePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("preview-email-templates", {
        method: "GET",
      });
      if (error) {
        const details = error instanceof FunctionsHttpError
          ? await error.context.text()
          : error.message;
        setError(details);
      } else {
        setTemplates(data.templates ?? []);
        setSelected(data.templates?.[0] ?? null);
      }
      setLoading(false);
    };
    load();
  }, [user, authLoading, navigate]);

  const handleSendTest = async () => {
    if (!selected) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("preview-email-templates", {
      method: "POST",
      body: { id: selected.id },
    });
    setSending(false);
    if (error) {
      const details = error instanceof FunctionsHttpError
        ? await error.context.text()
        : error.message;
      toast({ title: "Could not send test", description: details, variant: "destructive" });
    } else {
      toast({ title: "Test sent", description: `A copy was sent to ${data.to}` });
    }
  };

  const groups = [...new Set(templates.map((t) => t.group))];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-20 pb-8">
        <AdminNav />


        <div className="flex items-center gap-3 mb-6">
          <Mail className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Email Templates</h1>
            <p className="text-sm text-muted-foreground">
              Preview every email NomadNest sends, with sample data. Nothing here sends real mail unless you use "Send test to me".
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {error}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
            <div className="space-y-6">
              {groups.map((group) => (
                <Card key={group}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">{group}</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2 space-y-1">
                    {templates
                      .filter((t) => t.group === group)
                      .map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setSelected(t)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                            selected?.id === t.id
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-muted"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div>
              {selected && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <Badge variant="secondary">{selected.group}</Badge>
                        <CardTitle className="text-base">{selected.label}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Subject: {selected.subject}
                        </p>
                      </div>
                      <Button size="sm" onClick={handleSendTest} disabled={sending}>
                        {sending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Send className="w-4 h-4 mr-2" />
                        )}
                        Send test to me
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-xl overflow-hidden bg-muted/30">
                      <iframe
                        title={selected.label}
                        srcDoc={selected.html}
                        className="w-full h-[640px] bg-white"
                        sandbox=""
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminEmails;
