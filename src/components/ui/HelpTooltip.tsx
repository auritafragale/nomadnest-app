import * as React from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface HelpTooltipProps {
  /** Short help text shown in the popover. */
  content: React.ReactNode;
  /** Accessible label for the trigger (defaults to "More information"). */
  label?: string;
  /** Override the icon size. */
  size?: number;
  /** Extra classes on the trigger button. */
  className?: string;
  /** Align the popover content relative to the trigger. */
  align?: "start" | "center" | "end";
}

/**
 * A small info (?) icon that opens a help popover on tap or click.
 * Uses Popover (not hover-only Tooltip) so it works on touch devices.
 */
const HelpTooltip = React.forwardRef<HTMLButtonElement, HelpTooltipProps>(
  ({ content, label = "More information", size = 14, className, align = "start" }, ref) => {
    const [open, setOpen] = React.useState(false);
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={ref}
            type="button"
            aria-label={label}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1",
              className,
            )}
          >
            <Info style={{ width: size, height: size }} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align={align}
          sideOffset={6}
          className="max-w-[260px] text-sm leading-relaxed text-popover-foreground p-3"
        >
          {content}
        </PopoverContent>
      </Popover>
    );
  },
);
HelpTooltip.displayName = "HelpTooltip";

export { HelpTooltip };
