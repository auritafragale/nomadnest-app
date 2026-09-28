import { Link } from "react-router-dom";
import { ChevronRight, CircleCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface TodoItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** A link, or an action on this page (e.g. open a review). */
  to?: string;
  onClick?: () => void;
}

/** A short "to do" list: at most four rows, most urgent first. */
export const TodoList = ({ items }: { items: TodoItem[] }) => {
  const visible = items.slice(0, 4);
  return (
    <section className="rounded-3xl border bg-card p-4 shadow-sm">
      <h2 className="px-1 font-display text-lg font-bold">To do</h2>
      {visible.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          You're all caught up.
        </p>
      ) : (
        <ul className="mt-2 divide-y">
          {visible.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">{item.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </>
            );
            const className =
              "flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
            return (
              <li key={item.key}>
                {item.to ? (
                  <Link to={item.to} className={className}>
                    {content}
                  </Link>
                ) : (
                  <button type="button" onClick={item.onClick} className={className}>
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
