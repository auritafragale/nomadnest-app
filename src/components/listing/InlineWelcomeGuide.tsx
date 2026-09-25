import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  WifiOff,
  Printer,
  ChevronDown,
  ChevronUp,
  Wifi,
  Utensils,
  Stethoscope,
  Phone,
  StickyNote,
  MapPin,
} from "lucide-react";
import { useState } from "react";
import { useWelcomeGuide } from "@/hooks/useWelcomeGuide";
import { printWelcomeGuide } from "@/lib/printGuide";

const FIELDS = [
  { key: "wifi_info", label: "WiFi", icon: Wifi },
  { key: "feeding_schedule", label: "Feeding schedule", icon: Utensils },
  { key: "vet_info", label: "Vet details", icon: Stethoscope },
  { key: "emergency_contacts", label: "Emergency contacts", icon: Phone },
  { key: "house_notes", label: "House notes", icon: StickyNote },
] as const;

/**
 * Inline, read-only Welcome Guide shown on a listing to an accepted Nomad or
 * the owner. Collapsible; cached for offline; printable.
 */
const InlineWelcomeGuide = ({
  ownerUserId,
  addressPrivate,
  listingTitle,
  location,
  sitStartDate,
  sitEndDate,
}: {
  ownerUserId: string;
  /** listings.address_private — only ever passed in for the owner or an accepted Nomad. */
  addressPrivate?: string | null;
  /** The following are print-only context: this card has no other way to show
   *  which listing/sit it belongs to, since everything else identifying that
   *  lives outside .print-guide-root in the DOM. */
  listingTitle?: string;
  location?: string | null;
  sitStartDate?: string | null;
  sitEndDate?: string | null;
}) => {
  const { guide, isLoading, isOffline, cachedAt } = useWelcomeGuide(ownerUserId);
  const [open, setOpen] = useState(false);

  const filled: { key: string; label: string; icon: typeof FIELDS[number]["icon"]; value: string }[] = guide
    ? FIELDS.filter((f) => (guide[f.key] || "").trim().length > 0).map((f) => ({
        key: f.key as string,
        label: f.label,
        icon: f.icon,
        value: guide[f.key] as string,
      }))
    : [];
  if ((addressPrivate || "").trim().length > 0) {
    filled.push({ key: "address_private", label: "Exact Address", icon: MapPin, value: addressPrivate! });
  }
  const totalFields = FIELDS.length + (addressPrivate != null ? 1 : 0);
  const hasContent = filled.length > 0;

  return (
    <Card id="welcome-guide" className="print-guide-root overflow-hidden">
      {/* Print-only: everything else identifying the sit lives outside this
          element in the DOM, so the printed page needs its own header. */}
      <div className="hidden print-only px-4 pt-4">
        <p className="print-guide-title">{listingTitle || "NomadNest Welcome Guide"}</p>
        {location && <p className="print-guide-meta">{location}</p>}
        {sitStartDate && sitEndDate && (
          <p className="print-guide-meta">
            {sitStartDate} – {sitEndDate}
          </p>
        )}
      </div>

      <CardHeader
        className="cursor-pointer select-none bg-primary/10"
        onClick={() => setOpen((o) => !o)}
        role="button"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="w-5 h-5 text-primary" />
            Welcome Guide
          </CardTitle>
          <div className="flex items-center gap-2 print-hidden">
            {isOffline && (
              <Badge variant="outline" className="gap-1 text-xs">
                <WifiOff className="w-3 h-3" /> Offline
              </Badge>
            )}
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
        <CardDescription>
          {cachedAt
            ? `Saved for offline · updated ${new Date(cachedAt).toLocaleDateString()}`
            : "Everything a Nomad needs on arrival"}
        </CardDescription>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4 pt-4">
          {isLoading && !guide ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : hasContent ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="gap-1 print-hidden">
                  {filled.length}/{totalFields} fields
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="print-hidden"
                  onClick={printWelcomeGuide}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Download / Print
                </Button>
              </div>
              <div className="print-guide-fields grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filled.map((f) => (
                  <div
                    key={f.key}
                    className="print-guide-field flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3"
                  >
                    <div className="print-guide-field-icon shrink-0 w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                      <f.icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground mb-1">{f.label}</p>
                      <p className="text-sm whitespace-pre-line">{f.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              The Pet Parent hasn't added a Welcome Guide yet.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default InlineWelcomeGuide;
