import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import {
  FoundersCard,
  FoundingBanner,
  HomeHero,
  HowItWorks,
  OpenSits,
  ReadyToStart,
  WhyNomadNest,
} from "@/components/landing/HomeSections";

/** The home page, signed out only (design: HomePhone, HomeTablet, HomeDesktop). */
const Index = () => {
  const { user, loading, onboardingCompleted } = useAuth();
  const location = useLocation();

  // Links like the footer's "/#how-it-works" land on the section.
  useEffect(() => {
    if (loading || user || !location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => window.clearTimeout(t);
  }, [location.hash, loading, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && onboardingCompleted) {
    return <Navigate to="/dashboard" replace />;
  }

  if (user && !onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar wide />
      <main className="flex flex-1 flex-col gap-12 pb-12 md:gap-16 md:pb-16">
        <HomeHero />
        <FoundingBanner />
        <HowItWorks />
        <OpenSits />
        <WhyNomadNest />
        <FoundersCard />
        <ReadyToStart />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
