import { lazy, Suspense } from "react";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useListings } from "@/hooks/useListings";
import { Skeleton } from "@/components/ui/skeleton";

const ListingGoogleMap = lazy(() => import("@/components/maps/ListingGoogleMap"));

const MobileHomeScreen = () => {
  const { activeRole, setActiveRole } = useActiveRole();
  const { role } = useAuth();
  const { data: listings } = useListings({});

  const canToggle = role === "both";

  return (
    <div className="md:hidden flex flex-col">
      {/* Role toggle */}
      {canToggle && (
        <div className="flex items-center gap-2 px-4 py-3 bg-surface border-b border-border">
          <div className="flex bg-muted rounded-full p-1 gap-1 w-full">
            <button
              onClick={() => setActiveRole("sitter")}
              className="flex-1 py-1.5 rounded-full text-sm font-medium transition-colors"
              style={
                activeRole === "sitter"
                  ? { backgroundColor: "#E8735A", color: "white" }
                  : { color: "var(--muted-foreground)" }
              }
            >
              Nomad Mode
            </button>
            <button
              onClick={() => setActiveRole("owner")}
              className="flex-1 py-1.5 rounded-full text-sm font-medium transition-colors"
              style={
                activeRole === "owner"
                  ? { backgroundColor: "#E8735A", color: "white" }
                  : { color: "var(--muted-foreground)" }
              }
            >
              Pet Parent Mode
            </button>
          </div>
        </div>
      )}

      {/* Compact map preview */}
      <div className="relative overflow-hidden" style={{ height: "250px" }}>
        <Suspense
          fallback={
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Skeleton className="w-full h-full" />
            </div>
          }
        >
          {listings && <ListingGoogleMap listings={listings} />}
        </Suspense>
      </div>
    </div>
  );
};

export default MobileHomeScreen;
