import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption<T extends string> {
  id: T;
  label: string;
  /** A short line under the option in the menu. */
  hint?: string;
}

/**
 * "Show" and "Sort" on the reviews page: a 56px button with a small label
 * and the current choice, opening a list with a tick on the chosen one.
 * Radix handles the keyboard (arrows, Enter, Escape), screen readers
 * (menuitemradio with checked state) and closing on choice or outside tap.
 */
const ReviewsDropdown = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
}) => {
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label={`${label}: ${current.label}`}
        className="flex h-14 min-w-0 flex-1 items-center gap-2 rounded-[16px] border-[1.5px] border-[var(--nn-border)] bg-card px-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-[var(--nn-accent)]"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-semibold text-muted-foreground">{label}</span>
          <span className="truncate text-[15px] font-bold">{current.label}</span>
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-32px)] rounded-[16px] border border-[var(--nn-border)] bg-card p-1.5 text-foreground shadow-lg"
        >
          <Menu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
            {options.map((o) => (
              <Menu.RadioItem
                key={o.id}
                value={o.id}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[15px] outline-none data-[highlighted]:bg-muted",
                  o.id === value ? "font-bold" : "font-semibold",
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <Menu.ItemIndicator>
                    <Check className="h-5 w-5 text-[var(--nn-accent-dark)]" aria-hidden="true" />
                  </Menu.ItemIndicator>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span>{o.label}</span>
                  {o.hint && <span className="text-[13px] font-normal text-muted-foreground">{o.hint}</span>}
                </span>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
};

export default ReviewsDropdown;
