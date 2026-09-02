import { Navigate } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading } = useIsAdmin();

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 pb-12 container max-w-xl mx-auto px-4 text-center">
          <ShieldAlert className="w-14 h-14 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Not authorised</h1>
          <p className="text-muted-foreground mb-6">
            This area is for NomadNest founders only.
          </p>
          <Button asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </main>
      </div>
    );
  }

  return <>{children}</>;
};

export default AdminRoute;
