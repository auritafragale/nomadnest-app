import { useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect } from "react";
import { MapPinOff, Home, Search, Users, ArrowLeft } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="mx-auto max-w-md text-center">
          {/* Illustration */}
          <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full bg-muted">
            <MapPinOff className="h-16 w-16 text-muted-foreground" />
          </div>

          {/* Error Code */}
          <h1 className="mb-2 text-7xl font-bold text-primary">404</h1>
          
          {/* Message */}
          <h2 className="mb-4 text-2xl font-semibold text-foreground">
            Page Not Found
          </h2>
          <p className="mb-8 text-muted-foreground">
            Oops! The page you're looking for seems to have wandered off. 
            Don't worry, let's help you find your way back.
          </p>

          {/* Primary Action */}
          <Button asChild size="lg" className="mb-6 w-full sm:w-auto">
            <Link to="/">
              <Home className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>

          {/* Secondary Actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button variant="outline" asChild>
              <Link to="/browse-sits">
                <Search className="mr-2 h-4 w-4" />
                Browse Sits
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/browse-sitters">
                <Users className="mr-2 h-4 w-4" />
                Browse Nomads
              </Link>
            </Button>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default NotFound;
