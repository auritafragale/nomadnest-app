import { ReactNode, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleFormSectionProps {
  title: string;
  tooltip?: { label: string; content: string };
  /** Short collapsed-state summary, e.g. "2 selected" — omitted when nothing is set yet. */
  summary?: string | null;
  defaultOpen?: boolean;
  children: ReactNode;
}

const CollapsibleFormSection = ({
  title,
  tooltip,
  summary,
  defaultOpen = false,
  children,
}: CollapsibleFormSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-4">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-1.5 min-w-0">
                <CardTitle className="text-lg">{title}</CardTitle>
                {tooltip && <HelpTooltip label={tooltip.label} content={tooltip.content} />}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {summary && (
                  <span className="text-xs text-muted-foreground">{summary}</span>
                )}
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform",
                    open && "rotate-180"
                  )}
                />
              </div>
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default CollapsibleFormSection;
