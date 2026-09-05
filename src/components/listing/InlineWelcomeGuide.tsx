import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, WifiOff, Printer, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useWelcomeGuide } from "@/hooks/useWelcomeGuide";
import { printWelcomeGuide } from "@/lib/printGuide";

const FIELDS = [
  { key: "wifi_info", label: "WiFi" },
  { key: "feeding_schedule", label: "Feeding schedule" },
  { key: "vet_info", label: "Vet details" },
  { key: "emergency_contacts", label: "Emergency contacts" },
  { key: "house_notes", label: "House notes" },
] as const;

/**
 * Inline, read-only Welcome Guide shown on a listing to an accepted Nomad or
 * the owner. Collapsible; cached for offline; printable.
 */
const InlineWelcomeGuide = ({
  ownerUserId,
  listingId,
}: {
  ownerUserId: string;
  listingId: string;
}) => {
  const { guide, isLoading, isOffline, cachedAt } = useWelcomeGuide(ownerUserId);
  const [open, setOpen] = useState(true);

  const filled = guide
    ? FIELDS.filter((f) => (guide[f.key] || "").trim().length > 0)
    : [];
  const hasContent = filled.length > 0;

  return (
    <Card id="welcome-guide" className="print-guide-root">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
        role="button"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="w-5 h-5 text-[#E8735A]" />
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
        <CardContent className="space-y-4">
          {isLoading && !guide ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : hasContent ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="gap-1 print-hidden">
                  {filled.length}/5 fields
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filled.map((f) => (
                  <div key={f.key} className="rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{f.label}</p>
                    <p className="text-sm whitespace-pre-line">{guide?.[f.key]}</p>
                  </div>
                ))}
              </div>
              <Link to={`/listing/${listingId}/welcome-guide`}>
                <Button variant="ghost" size="sm">
                  Open full guide
                </Button>
              </Link>
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
