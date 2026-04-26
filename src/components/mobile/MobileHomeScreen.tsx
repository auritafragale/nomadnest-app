import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useListings } from "@/hooks/useListings";
import { Skeleton } from "@/components/ui/skeleton";

const ListingGoogleMap = lazy(() => import("@/components/maps/ListingGoogleMap"));

const MobileHomeScreen = () => {
  const { activeRole, setActiveRole } = useActiveRole();
  const { role } = useAuth();
  const navigate = useNavigate();
  const { data: listings } = useListings({});
  const [mapRole, setMapRole] = useState<"sitter" | "owner">(activeRole);

  const canToggle = role === "both";

  const handleRoleSwitch = (r: "sitter" | "owner") => {
    setMapRole(r);
    setActiveRole(r);
  };

  const fabLabel = mapRole === "sitter" ? "View Sits" : "Find Nomads";
  const fabPath = mapRole === "sitter" ? "/browse-sits" : "/browse-sitters";

  return (
    <div className="md:hidden flex flex-col" style={{ height: "calc(100svh - 4rem - 4rem)" }}>
      {/* Role toggle */}
      {canToggle && (
        <div className="flex items-center gap-2 px-4 py-3 bg-surface border-b border-border">
          <div className="flex bg-muted rounded-full p-1 gap-1 w-full">
            <button
              onClick={() => handleRoleSwitch("sitter")}
              className="flex-1 py-1.5 rounded-full text-sm font-medium transition-colors"
              style={
                mapRole === "sitter"
                  ? { backgroundColor: "#E8735A", color: "white" }
                  : { color: "var(--muted-foreground)" }
              }
            >
              Nomad Mode
            </button>
            <button
              onClick={() => handleRoleSwitch("owner")}
              className="flex-1 py-1.5 rounded-full text-sm font-medium transition-colors"
              style={
                mapRole === "owner"
                  ? { backgroundColor: "#E8735A", color: "white" }
                  : { color: "var(--muted-foreground)" }
              }
            >
              Pet Parent Mode
            </button>
          </div>
        </div>
      )}

      {/* Map — fills remaining height */}
      <div className="flex-1 relative overflow-hidden">
        <Suspense
          fallback={
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Skeleton className="w-full h-full" />
            </div>
          }
        >
          {listings && <ListingGoogleMap listings={listings} />}
        </Suspense>

        {/* Floating action button */}
        <button
          onClick={() => navigate(fabPath)}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 px-8 py-3 rounded-full text-white font-semibold text-sm shadow-lg active:scale-95 transition-transform"
          style={{ backgroundColor: "#E8735A" }}
        >
          {fabLabel}
        </button>
      </div>
    </div>
  );
};

export default MobileHomeScreen;
