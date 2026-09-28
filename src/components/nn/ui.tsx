import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/layout/BackButton";

/**
 * Shared look of the redesigned dashboard screens (design reference
 * 28 Sep 2026): coral for Nomad screens, teal for Pet Parent screens, plain
 * white pages, DM Serif Display headings (font-display) and Plus Jakarta
 * Sans body (the app's default fonts).
 *
 * <RoleTheme role> sets CSS variables; components use them through Tailwind
 * arbitrary values, e.g. bg-[var(--nn-accent)].
 */
export type NnRole = "sitter" | "owner";

const THEMES: Record<NnRole, Record<string, string>> = {
  sitter: {
    "--nn-accent": "#C4553E",
    "--nn-accent-dark": "#A2412C",
    "--nn-tint": "#FDEEEA",
    "--nn-soft": "#FCF3F0",
    "--nn-chip": "#F6E4DD",
    "--nn-border": "#F0DCD4",
    "--nn-line": "#F6E8E3",
    "--nn-track": "#F6E1DB",
  },
  owner: {
    "--nn-accent": "#237A6D",
    "--nn-accent-dark": "#1B5F55",
    "--nn-tint": "#E3F1EE",
    "--nn-soft": "#F3F8F6",
    "--nn-chip": "#E1EEEA",
    "--nn-border": "#D3E7E1",
    "--nn-line": "#E4F0EC",
    "--nn-track": "#DCEDE9",
  },
};

export const NN_INK = "#1F1B16";
export const NN_GREY = "#656B74";
export const NN_GOLD = "#E8B53E";
export const NN_GOLD_INK = "#3A2A06";

export const RoleTheme = ({ role, className, children }: { role: NnRole; className?: string; children: React.ReactNode }) => (
  <div style={THEMES[role] as React.CSSProperties} className={cn("bg-white text-[#1F1B16]", className)}>
    {children}
  </div>
);

export const SectionCard = ({
  className,
  children,
  label,
}: {
  className?: string;
  children: React.ReactNode;
  label?: string;
}) => (
  <section aria-label={label} className={cn("rounded-[24px] border border-[var(--nn-border)] bg-white", className)}>
    {children}
  </section>
);

export const SerifTitle = ({ as: Tag = "h2", className, children }: { as?: "h1" | "h2" | "h3"; className?: string; children: React.ReactNode }) => (
  <Tag className={cn("font-display font-normal leading-tight", Tag === "h1" ? "text-[32px]" : "text-[21px]", className)}>{children}</Tag>
);

/** Full-page screens: Back, serif title and a short intro. */
export const PageHeader = ({ title, intro, fallback }: { title: string; intro?: string; fallback: string }) => (
  <div className="space-y-2">
    <BackButton fallback={fallback} className="h-11" />
    <SerifTitle as="h1">{title}</SerifTitle>
    {intro && <p className="text-[15px] leading-snug text-[#656B74]">{intro}</p>}
  </div>
);

export interface PillTab<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/** Filter tabs as pills with counts (aria-pressed), scrolling sideways on small screens. */
export const PillTabs = <T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: PillTab<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) => (
  <div role="group" aria-label={label} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
    {tabs.map((t) => {
      const on = t.id === value;
      return (
        <button
          key={t.id}
          type="button"
          aria-pressed={on}
          onClick={() => onChange(t.id)}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-4 text-sm",
            on
              ? "border-[var(--nn-accent)] bg-[var(--nn-accent)] font-bold text-white"
              : "border-[var(--nn-border)] bg-white font-semibold text-[#1F1B16]",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={on ? "opacity-85" : "text-[#656B74]"}>{t.count}</span>}
        </button>
      );
    })}
  </div>
);

/** A tappable row: icon circle, title, subtitle, chevron. */
export const NavRow = ({
  to,
  onClick,
  icon: Icon,
  title,
  subtitle,
  subtitleTone = "grey",
  iconTone = "accent",
  first,
}: {
  to?: string;
  onClick?: () => void;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  subtitleTone?: "grey" | "accent";
  iconTone?: "accent" | "neutral" | "teal";
  first?: boolean;
}) => {
  const content = (
    <>
      <span
        className={cn(
          "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full",
          iconTone === "accent" && "bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]",
          iconTone === "neutral" && "bg-[var(--nn-chip)] text-[#3F444B]",
          iconTone === "teal" && "bg-[#E3F1EE] text-[#1E6B5F]",
        )}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        {subtitle && (
          <span className={cn("text-xs", subtitleTone === "accent" ? "font-semibold text-[var(--nn-accent-dark)]" : "text-[#656B74]")}>
            {subtitle}
          </span>
        )}
      </span>
      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#9097A1]" aria-hidden="true" />
    </>
  );
  const cls = cn(
    "flex min-h-[56px] w-full items-center gap-3 py-3 text-left",
    !first && "border-t border-[var(--nn-line)]",
  );
  return to ? (
    <Link to={to} className={cls}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  );
};

export type ChipTone = "green" | "accent" | "grey" | "gold";

export const StatusChip = ({ tone, children }: { tone: ChipTone; children: React.ReactNode }) => (
  <span
    className={cn(
      "inline-flex h-[26px] shrink-0 items-center rounded-full px-2.5 text-xs font-bold",
      tone === "green" && "bg-[#E1F2EC] text-[#1E6B5F]",
      tone === "accent" && "bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]",
      tone === "grey" && "bg-[#F3EEEA] text-[#4B5058]",
      tone === "gold" && "bg-[#E8B53E] text-[#3A2A06]",
    )}
  >
    {children}
  </span>
);

/** Primary (filled accent) and secondary (outlined) actions, 44px+ tall. */
export const nnButton = (variant: "primary" | "secondary" | "ghost" = "primary", className?: string) =>
  cn(
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition-colors disabled:opacity-50",
    variant === "primary" && "bg-[var(--nn-accent)] text-white hover:bg-[var(--nn-accent-dark)]",
    variant === "secondary" && "border-[1.5px] border-[var(--nn-border)] bg-white text-[#1F1B16] hover:bg-[var(--nn-soft)]",
    variant === "ghost" && "text-[var(--nn-accent-dark)] hover:bg-[var(--nn-soft)]",
    className,
  );

export const EmptyState = ({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) => (
  <div className="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-[var(--nn-border)] px-6 py-8 text-center">
    <p className="font-display text-xl">{title}</p>
    <p className="max-w-xs text-sm text-[#656B74]">{text}</p>
    {action && <div className="mt-2">{action}</div>}
  </div>
);

/** Short date range, e.g. "12–19 Oct" or "28 Sep – 3 Oct". */
export const shortRange = (start: string, end: string) => {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  const month = (d: Date) => d.toLocaleString("en-GB", { month: "short" });
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} ${month(e)}`;
  }
  return `${s.getDate()} ${month(s)} – ${e.getDate()} ${month(e)}`;
};

export const nightsBetween = (start: string, end: string) =>
  Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86_400_000);
