import { Checkbox } from "@/components/ui/checkbox";

export const LISTING_DECLARATION_TEXT =
  "I confirm I own or live in this home, and I'll personally manage every sit here, including handover, messages and check-ins.";

/** Required before publishing. The database stores when it was accepted. */
export const ListingDeclaration = ({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <label
    htmlFor="listing-declaration"
    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border-[1.5px] border-[var(--nn-border)] bg-card p-4"
  >
    <Checkbox
      id="listing-declaration"
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className="mt-0.5 h-6 w-6 rounded-lg"
      aria-required="true"
    />
    <span className="text-[15px] leading-snug">{LISTING_DECLARATION_TEXT}</span>
  </label>
);

export const DECLARATION_REQUIRED_TOAST = {
  title: "Please confirm this is your home",
  description: "Tick the confirmation above Publish listing.",
  variant: "destructive" as const,
};
