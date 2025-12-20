import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

type ActiveRole = "sitter" | "owner";

interface ActiveRoleContextType {
  activeRole: ActiveRole;
  setActiveRole: (role: ActiveRole) => void;
}

const ActiveRoleContext = createContext<ActiveRoleContextType | undefined>(undefined);

export const useActiveRole = () => {
  const context = useContext(ActiveRoleContext);
  if (!context) {
    throw new Error("useActiveRole must be used within an ActiveRoleProvider");
  }
  return context;
};

export const ActiveRoleProvider = ({ children }: { children: ReactNode }) => {
  const { role, user } = useAuth();
  const [activeRole, setActiveRoleState] = useState<ActiveRole>("sitter");

  // Initialize from localStorage or derive from role
  useEffect(() => {
    if (!user) return;
    
    const stored = localStorage.getItem(`activeRole_${user.id}`);
    if (stored && (stored === "sitter" || stored === "owner")) {
      // Only use stored if user has "both" role
      if (role === "both") {
        setActiveRoleState(stored as ActiveRole);
      } else if (role === "sitter" || role === "owner") {
        setActiveRoleState(role);
      }
    } else if (role === "owner") {
      setActiveRoleState("owner");
    } else {
      setActiveRoleState("sitter");
    }
  }, [role, user]);

  const setActiveRole = (newRole: ActiveRole) => {
    if (user) {
      localStorage.setItem(`activeRole_${user.id}`, newRole);
    }
    setActiveRoleState(newRole);
  };

  return (
    <ActiveRoleContext.Provider value={{ activeRole, setActiveRole }}>
      {children}
    </ActiveRoleContext.Provider>
  );
};
