import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { useAuth } from "@/contexts/AuthContext";

const MobileHomeScreen = () => {
  const { activeRole, setActiveRole } = useActiveRole();
  const { role } = useAuth();

  const canToggle = role === "both";

  if (!canToggle) return null;

  return (
    <div className="md:hidden flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 bg-surface border-b border-border">
        <div className="flex bg-muted rounded-full p-1 gap-1 w-full">
          <button
            onClick={() => setActiveRole("sitter")}
            className={`flex-1 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeRole === "sitter" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Nomad Mode
          </button>
          <button
            onClick={() => setActiveRole("owner")}
            className={`flex-1 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeRole === "owner" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Pet Parent Mode
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileHomeScreen;
