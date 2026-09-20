import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Send, ArrowLeft, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface EmailTemplatePreview {
  id: string;
  label: string;
  group: string;
  subgroup?: string;
  subject: string;
  html: string;
}

const TemplateButton = ({
  template,
  selected,
  onSelect,
}: {
  template: EmailTemplatePreview;
  selected: boolean;
  onSelect: (t: EmailTemplatePreview) => void;
}) => (
  <button
    onClick={() => onSelect(template)}
    className={cn(
      "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
      selected ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
    )}
  >
    {template.label}
  </button>
);

// Collapsed by default — the Notifications group has grown too big for a
// flat list, so its templates are split into named sub-categories.
const NotificationSubgroup = ({
  title,
  templates,
  selectedId,
  onSelect,
}: {
  title: string;
  templates: EmailTemplatePreview[];
  selectedId?: string;
  onSelect: (t: EmailTemplatePreview) => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          <span className="flex items-center gap-2">
            {title}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {templates.length}
            </Badge>
          </span>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pl-1">
        {templates.map((t) => (
          <TemplateButton key={t.id} template={t} selected={selectedId === t.id} onSelect={onSelect} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

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

  // Within "Notifications" only, split into named sub-categories (collapsed
  // by default) plus anything with no subgroup, shown as a flat list.
  const notificationTemplates = templates.filter((t) => t.group === "Notifications");
  const notificationUngrouped = notificationTemplates.filter((t) => !t.subgroup);
  const notificationSubgroupOrder: string[] = [];
  for (const t of notificationTemplates) {
    if (t.subgroup && !notificationSubgroupOrder.includes(t.subgroup)) {
      notificationSubgroupOrder.push(t.subgroup);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-20 pb-8">
        <AdminNav />


        <div className="flex items-center gap-3 mb-6">
          <Mail className="w-6 h-6 text-primary" />
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-bold">Email Templates</h1>
            <HelpTooltip
              label="About this page"
              content='Preview every email NomadNest sends, with sample data. Nothing here sends real mail unless you use "Send test to me".'
            />
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
                    {group === "Notifications" ? (
                      <>
                        {notificationUngrouped.map((t) => (
                          <TemplateButton
                            key={t.id}
                            template={t}
                            selected={selected?.id === t.id}
                            onSelect={setSelected}
                          />
                        ))}
                        {notificationSubgroupOrder.map((subgroup) => (
                          <NotificationSubgroup
                            key={subgroup}
                            title={subgroup}
                            templates={notificationTemplates.filter((t) => t.subgroup === subgroup)}
                            selectedId={selected?.id}
                            onSelect={setSelected}
                          />
                        ))}
                      </>
                    ) : (
                      templates
                        .filter((t) => t.group === group)
                        .map((t) => (
                          <TemplateButton
                            key={t.id}
                            template={t}
                            selected={selected?.id === t.id}
                            onSelect={setSelected}
                          />
                        ))
                    )}
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
