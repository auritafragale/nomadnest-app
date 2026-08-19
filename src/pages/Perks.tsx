import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, Lock } from "lucide-react";
import { usePerks, PERK_CATEGORIES } from "@/hooks/usePerks";
import { useMembership } from "@/hooks/useMembership";
import { useAuth } from "@/contexts/AuthContext";
import PerkCard from "@/components/perks/PerkCard";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

const Perks = () => {
  const { perks, loading, getDiscountCode, openPerk } = usePerks();
  const { subscribed, foundingMember, loading: membershipLoading } = useMembership();
  const { user } = useAuth();
  const [category, setCategory] = useState<string>("All");

  const isMember = Boolean(user) && (subscribed || foundingMember);

  const filtered = useMemo(
    () => (category === "All" ? perks : perks.filter((p) => p.category === category)),
    [perks, category],
  );

  const activeCategories = useMemo(() => {
    const used = new Set(perks.map((p) => p.category));
    return ["All", ...PERK_CATEGORIES.filter((c) => used.has(c))];
  }, [perks]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <div className="container mx-auto px-4 pt-20 pb-16">
          <Breadcrumbs />

          <header className="text-center max-w-2xl mx-auto mb-8">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Gift className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-2xl md:text-4xl font-display font-bold mb-3 flex items-center justify-center gap-2">
              Member Perks
              <HelpTooltip content="Exclusive partner deals negotiated for NomadNest members. Some links earn us a small commission, which helps keep membership fees low." />
            </h1>
            <p className="text-muted-foreground text-sm md:text-base">
              Exclusive partner deals on travel, insurance, pet care and gear — free with your
              NomadNest membership.
            </p>
          </header>

          {!isMember && !membershipLoading && (
            <div className="max-w-2xl mx-auto mb-8 rounded-2xl border border-border bg-surface p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Perks unlock with membership</p>
                <p className="text-xs text-muted-foreground">
                  Members get every partner link and discount code below, plus unlimited sits.
                </p>
              </div>
              <Button asChild className="w-full sm:w-auto">
                <Link to="/membership">See membership</Link>
              </Button>
            </div>
          )}

          {activeCategories.length > 2 && (
            <nav aria-label="Perk categories" className="flex gap-2 overflow-x-auto pb-3 mb-6 -mx-1 px-1 snap-x">
              {activeCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  aria-pressed={category === cat}
                  className={`shrink-0 snap-start rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    category === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </nav>
          )}

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-56 rounded-2xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 max-w-md mx-auto">
              <Badge variant="outline" className="mb-3">
                Coming soon
              </Badge>
              <h2 className="font-semibold mb-2">Partner perks are on the way</h2>
              <p className="text-sm text-muted-foreground">
                We're finalising deals with travel, insurance and pet care partners. Members will be
                the first to know.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((perk) => (
                <PerkCard
                  key={perk.id}
                  perk={perk}
                  isMember={isMember}
                  onOpen={openPerk}
                  onGetCode={getDiscountCode}
                />
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center max-w-xl mx-auto mt-10">
            Some partner links earn NomadNest a commission at no extra cost to you — it helps keep
            membership fees low and the platform free of booking fees.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Perks;
