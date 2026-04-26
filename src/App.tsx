import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ActiveRoleProvider } from "@/contexts/ActiveRoleContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import SplashScreen from "@/components/mobile/SplashScreen";
import OnboardingCarousel, { ONBOARDING_STORAGE_KEY } from "@/components/mobile/OnboardingCarousel";
import BottomNav from "@/components/mobile/BottomNav";
import Index from "./pages/Index";
import BrowseSits from "./pages/BrowseSits";
import FindNomads from "./pages/FindNomads";
import CompleteProfile from "./pages/CompleteProfile";
import BrowseSitters from "./pages/BrowseSitters";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import CreateListing from "./pages/CreateListing";
import EditListing from "./pages/EditListing";
import ListingDetail from "./pages/ListingDetail";
import EditSitterProfile from "./pages/EditSitterProfile";
import EditOwnerProfile from "./pages/EditOwnerProfile";
import SitterDetail from "./pages/SitterDetail";
import OwnerDetail from "./pages/OwnerDetail";
import Inbox from "./pages/Inbox";
import Applications from "./pages/Applications";
import SavedListings from "./pages/SavedListings";
import Settings from "./pages/Settings";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Contact from "./pages/Contact";
import Membership from "./pages/Membership";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const SPLASH_KEY = "nn_splash";
const NO_BOTTOM_NAV_PATHS = ["/auth", "/onboarding", "/reset-password", "/forgot-password"];

const hasSeenOnboarding = () =>
  localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";

const AppShell = () => {
  const { user } = useAuth();
  const location = useLocation();

  const [splashDone, setSplashDone] = useState(
    () => sessionStorage.getItem(SPLASH_KEY) === "1"
  );
  const [onboardingDone, setOnboardingDone] = useState(
    () => user !== null || hasSeenOnboarding()
  );

  const handleSplashDone = () => {
    sessionStorage.setItem(SPLASH_KEY, "1");
    setSplashDone(true);
  };

  const handleOnboardingDone = () => setOnboardingDone(true);

  const showBottomNav =
    user !== null && !NO_BOTTOM_NAV_PATHS.includes(location.pathname);

  return (
    <>
      {!splashDone && <SplashScreen onDone={handleSplashDone} />}
      {splashDone && !onboardingDone && (
        <OnboardingCarousel onDone={handleOnboardingDone} />
      )}

      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/browse-sits" element={<BrowseSits />} />
        <Route path="/browse-sitters" element={<BrowseSitters />} />
        <Route path="/find-nomads" element={<ProtectedRoute><FindNomads /></ProtectedRoute>} />
        <Route path="/complete-profile" element={<CompleteProfile />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/create-listing" element={<ProtectedRoute><CreateListing /></ProtectedRoute>} />
        <Route path="/edit-listing/:id" element={<ProtectedRoute><EditListing /></ProtectedRoute>} />
        <Route path="/listing/:id" element={<ListingDetail />} />
        <Route path="/edit-sitter-profile" element={<ProtectedRoute><EditSitterProfile /></ProtectedRoute>} />
        <Route path="/edit-owner-profile" element={<ProtectedRoute><EditOwnerProfile /></ProtectedRoute>} />
        <Route path="/sitter/:userId" element={<SitterDetail />} />
        <Route path="/owner/:userId" element={<OwnerDetail />} />
        <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
        <Route path="/applications" element={<ProtectedRoute><Applications /></ProtectedRoute>} />
        <Route path="/saved" element={<ProtectedRoute><SavedListings /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/membership" element={<Membership />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/contact" element={<Contact />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      {showBottomNav && (
        <>
          {/* Spacer so page content isn't hidden behind the fixed bottom nav */}
          <div className="h-16 md:hidden" aria-hidden="true" />
          <BottomNav />
        </>
      )}
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ActiveRoleProvider>
            <AppShell />
          </ActiveRoleProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;