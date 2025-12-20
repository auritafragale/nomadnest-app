import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ActiveRoleProvider } from "@/contexts/ActiveRoleContext";
import Index from "./pages/Index";
import BrowseSits from "./pages/BrowseSits";
import BrowseSitters from "./pages/BrowseSitters";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import CreateListing from "./pages/CreateListing";
import EditListing from "./pages/EditListing";
import ListingDetail from "./pages/ListingDetail";
import EditSitterProfile from "./pages/EditSitterProfile";
import EditOwnerProfile from "./pages/EditOwnerProfile";
import SitterDetail from "./pages/SitterDetail";
import Inbox from "./pages/Inbox";
import Applications from "./pages/Applications";
import SavedListings from "./pages/SavedListings";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ActiveRoleProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/browse-sits" element={<BrowseSits />} />
              <Route path="/browse-sitters" element={<BrowseSitters />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/create-listing" element={<CreateListing />} />
              <Route path="/edit-listing/:id" element={<EditListing />} />
              <Route path="/listing/:id" element={<ListingDetail />} />
              <Route path="/edit-sitter-profile" element={<EditSitterProfile />} />
              <Route path="/edit-owner-profile" element={<EditOwnerProfile />} />
              <Route path="/sitter/:userId" element={<SitterDetail />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/applications" element={<Applications />} />
              <Route path="/saved" element={<SavedListings />} />
              <Route path="/settings" element={<Settings />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ActiveRoleProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
