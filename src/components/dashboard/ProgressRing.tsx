import { cn } from "@/lib/utils";

/** A small circular progress indicator (0–100), e.g. Welcome Guide completion. */
export const ProgressRing = ({
  percent,
  size = 44,
  stroke = 4,
  label,
  className,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  /** Accessible label, e.g. "Welcome Guide 60% complete". */
  label: string;
  className?: string;
  children?: React.ReactNode;
}) => {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          className={cn("transition-[stroke-dashoffset] duration-500", value >= 100 ? "stroke-emerald-500" : "stroke-primary")}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        {children ?? <span className="text-[11px] font-semibold tabular-nums">{value}%</span>}
      </span>
    </div>
  );
};
