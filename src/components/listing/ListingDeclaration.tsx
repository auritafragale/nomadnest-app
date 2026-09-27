import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
  <div className="mb-4 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
    <Checkbox
      id="listing-declaration"
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className="mt-0.5"
      aria-required="true"
    />
    <Label htmlFor="listing-declaration" className="text-sm font-normal leading-snug">
      {LISTING_DECLARATION_TEXT}
    </Label>
  </div>
);

export const DECLARATION_REQUIRED_TOAST = {
  title: "Please confirm this is your home",
  description: "Tick the confirmation above the Publish button to publish your listing.",
  variant: "destructive" as const,
};
