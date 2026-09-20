import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PublishedListing {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  photo_url: string | null;
  owner_name: string | null;
  open_dates_count: number;
  created_at: string;
}

const AdminListings = () => {
  const { toast } = useToast();
  const [listings, setListings] = useState<PublishedListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("admin_list_published_listings");

      if (error) {
        toast({
          variant: "destructive",
          title: "Could not load listings",
          description: error.message,
        });
      }

      setListings((data ?? []) as unknown as PublishedListing[]);
      setLoading(false);
    };
    load();
  }, [toast]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Published Listings</h1>
        <AdminNav />

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No published listings.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <Link key={listing.id} to={`/listing/${listing.id}`}>
                <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
                  <CardContent className="flex gap-3 p-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                      {listing.photo_url ? (
                        <img
                          src={listing.photo_url}
                          alt={listing.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Home className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{listing.title}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {listing.owner_name || "Unknown owner"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[listing.city, listing.country].filter(Boolean).join(", ") || "Location not set"}
                      </p>
                      <Badge
                        variant={listing.open_dates_count > 0 ? "muted" : "outline"}
                        className="mt-1.5"
                      >
                        {listing.open_dates_count > 0
                          ? `${listing.open_dates_count} open date${listing.open_dates_count === 1 ? "" : "s"}`
                          : "No open dates"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminListings;
