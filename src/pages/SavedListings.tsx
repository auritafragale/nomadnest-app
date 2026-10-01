import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useFavoritedListings, useToggleFavorite } from "@/hooks/useFavorites";
import { useAuth } from "@/contexts/AuthContext";
import { NN_MAIN, PageHeader, RoleTheme, nnButton, shortRange } from "@/components/nn/ui";
import { cn } from "@/lib/utils";

interface SavedListing {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  photos: string[] | null;
  pets: { id: string; name: string | null; type: string }[];
  sit_dates: { id: string; start_date: string; end_date: string; status: string }[];
}

const petLine = (pets: SavedListing["pets"]) => {
  const counts = new Map<string, number>();
  for (const p of pets) counts.set(p.type.toLowerCase(), (counts.get(p.type.toLowerCase()) ?? 0) + 1);
  return [...counts.entries()].map(([t, n]) => `${n} ${n === 1 ? t : t.endsWith("s") ? t : `${t}s`}`).join(", ");
};

/** A saved sit: a compact row on phone, a card on tablet and desktop. */
const SavedItem = ({ listing, onRemove }: { listing: SavedListing; onRemove: () => void }) => {
  const today = new Date().toISOString().slice(0, 10);
  const open = [...listing.sit_dates]
    .filter((d) => d.status === "open" && d.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const place = [listing.city, listing.country].filter(Boolean).join(", ");
  const pets = petLine(listing.pets);
  return (
    <article
      className={cn(
        "relative flex items-center gap-3 rounded-[22px] border border-border bg-card p-3 md:flex-col md:items-stretch md:gap-0 md:overflow-hidden md:p-0",
      )}
    >
      <Link to={`/listing/${listing.id}`} className="flex min-w-0 flex-1 items-center gap-3 md:flex-col md:items-stretch md:gap-0">
        <span className={cn("h-[76px] w-[76px] shrink-0 overflow-hidden rounded-2xl bg-[#CDB79E] md:aspect-[4/3] md:h-auto md:w-full md:rounded-none", !open && "opacity-60 grayscale")}>
          {listing.photos?.[0] && <img src={listing.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:p-4">
          <span className="line-clamp-2 text-[16px] font-bold leading-snug">{listing.title}</span>
          {place && <span className="truncate text-sm text-muted-foreground">{place}</span>}
          <span className={cn("text-sm", open ? "font-semibold" : "text-muted-foreground")}>
            {open ? shortRange(open.start_date, open.end_date) : "No open dates right now"}
          </span>
          {pets && <span className="text-sm text-muted-foreground">{pets}</span>}
        </span>
      </Link>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${listing.title} from saved`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card md:absolute md:right-3 md:top-3 md:shadow-md"
      >
        <Heart className="h-5 w-5 fill-brand-coral text-brand-coral-text" aria-hidden="true" />
      </button>
    </article>
  );
};

/** Saved sits (design: SavedPhone, SavedTabletDark, SavedDesktop). */
const SavedListings = () => {
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading, isError, refetch } = useFavoritedListings();
  const toggle = useToggleFavorite();
  // Removed sits leave the list straight away, before the server answers.
  const [hidden, setHidden] = useState<string[]>([]);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  const listings = ((data ?? []) as SavedListing[]).filter((l) => !hidden.includes(l.id));

  const remove = (l: SavedListing) => {
    setHidden((h) => [...h, l.id]);
    toggle.mutate(
      { listingId: l.id, isFavorited: true, silent: true },
      {
        onSuccess: () =>
          toast("Removed from saved", {
            action: {
              label: "Undo",
              onClick: () =>
                toggle.mutate(
                  { listingId: l.id, isFavorited: false, silent: true },
                  { onSuccess: () => setHidden((h) => h.filter((id) => id !== l.id)) },
                ),
            },
          }),
        onError: () => {
          setHidden((h) => h.filter((id) => id !== l.id));
          toast.error("That didn't work. Please try again.");
        },
      },
    );
  };

  return (
    <RoleTheme role="sitter" className="flex min-h-screen flex-col">
      <Navbar wide />
      <main className={NN_MAIN}>
        <PageHeader title="Saved sits" intro="Sits you've saved, ready when you are." fallback="/browse-sits" />
        {authLoading || isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-[22px] md:h-72" />
            ))}
          </div>
        ) : isError ? (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-[22px] border border-border p-8 text-center">
            <p className="text-[17px] font-bold">We couldn't load your saved sits</p>
            <p className="text-[15px] text-muted-foreground">Check your connection and try again.</p>
            <button type="button" onClick={() => refetch()} className={nnButton("primary")}>
              Try again
            </button>
          </div>
        ) : listings.length > 0 ? (
          <>
            <p className="text-[15px] text-muted-foreground">
              {listings.length} saved {listings.length === 1 ? "sit" : "sits"}
            </p>
            <div className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
              {listings.map((l) => (
                <SavedItem key={l.id} listing={l} onRemove={() => remove(l)} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-[22px] border border-dashed border-border p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-coral-light text-brand-coral-text">
              <Heart className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-[17px] font-bold">No saved sits yet</p>
            <p className="text-[15px] text-muted-foreground">Tap the heart on any sit and it will wait for you here.</p>
            <Link to="/browse-sits" className={nnButton("primary")}>
              Browse Sits
            </Link>
          </div>
        )}
      </main>
      <Footer />
    </RoleTheme>
  );
};

export default SavedListings;
