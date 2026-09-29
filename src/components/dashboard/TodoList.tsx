import { CircleCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavRow, SectionCard, SerifTitle } from "@/components/nn/ui";
import { cn } from "@/lib/utils";

export interface TodoItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Short second line, e.g. "Due today". */
  detail?: string;
  /** Show the detail in the accent colour (urgent). */
  urgent?: boolean;
  /** A link, or an action on this page (e.g. open a review). */
  to?: string;
  onClick?: () => void;
}

/** "To do": at most four rows, most urgent first. */
export const TodoList = ({ items, className }: { items: TodoItem[]; className?: string }) => {
  const visible = items.slice(0, 4);
  return (
    <SectionCard label="To do" className={cn("px-[18px] py-1.5", className)}>
      <SerifTitle className="mb-1.5 mt-3">To do</SerifTitle>
      {visible.length === 0 ? (
        <p className="flex items-center gap-2 border-t border-[var(--nn-line)] py-3 text-sm text-muted-foreground">
          <CircleCheck className="h-4 w-4 text-brand-teal-text" aria-hidden="true" />
          You're all caught up.
        </p>
      ) : (
        visible.map((item) => (
          <NavRow
            key={item.key}
            to={item.to}
            onClick={item.onClick}
            icon={item.icon}
            title={item.label}
            subtitle={item.detail}
            subtitleTone={item.urgent ? "accent" : "grey"}
            iconTone={item.urgent ? "accent" : "neutral"}
          />
        ))
      )}
    </SectionCard>
  );
};
