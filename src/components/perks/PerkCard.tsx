import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, ExternalLink, Gift, Lock, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { PublicPerk } from "@/hooks/usePerks";

interface PerkCardProps {
  perk: PublicPerk;
  isMember: boolean;
  onOpen: (slug: string) => Promise<void>;
  onGetCode: (slug: string) => Promise<string | null>;
}

const PerkCard = ({ perk, isMember, onOpen, onGetCode }: PerkCardProps) => {
  const { toast } = useToast();
  const [opening, setOpening] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleOpen = async () => {
    setOpening(true);
    try {
      await onOpen(perk.slug);
    } catch {
      toast({
        title: "Couldn't open this perk",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setOpening(false);
    }
  };

  const handleCode = async () => {
    try {
      const value = code ?? (await onGetCode(perk.slug));
      if (!value) {
        toast({ title: "No code needed", description: "The discount applies via the link." });
        return;
      }
      setCode(value);
      await navigator.clipboard.writeText(value).catch(() => undefined);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Code copied", description: value });
    } catch {
      toast({
        title: "Members only",
        description: "Join NomadNest to unlock discount codes.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4 sm:p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {perk.logo_url ? (
              <img
                src={perk.logo_url}
                alt={`${perk.name} logo`}
                loading="lazy"
                className="w-full h-full object-contain"
              />
            ) : (
              <Gift className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm sm:text-base truncate">{perk.name}</h3>
              {perk.is_featured && (
                <Badge className="gap-1 text-[10px] px-1.5 py-0">
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  Featured
                </Badge>
              )}
            </div>
            <Badge variant="outline" className="mt-1 text-[10px]">
              {perk.category}
            </Badge>
          </div>
        </div>

        <p className="text-primary font-semibold text-sm">{perk.benefit_short}</p>

        {perk.description && (
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {perk.description}
          </p>
        )}

        {perk.terms && <p className="text-[11px] text-muted-foreground/80">{perk.terms}</p>}

        <div className="mt-auto pt-2 space-y-2">
          {isMember ? (
            <>
              <Button className="w-full gap-2" onClick={handleOpen} disabled={opening}>
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                {opening ? "Opening…" : "Get this perk"}
              </Button>
              <Button variant="outline" className="w-full gap-2" onClick={handleCode}>
                {copied ? (
                  <Check className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Copy className="w-4 h-4" aria-hidden="true" />
                )}
                {code ? code : "Show discount code"}
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-dashed border-border px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                Link and code unlock for members
              </div>
              <Button asChild className="w-full">
                <Link to="/membership">Join to unlock</Link>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PerkCard;
