import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Search, User, Menu, X, LayoutDashboard, MessageCircle, FileText, Heart, MapPin, Moon, Sun, Crown, Info, BookOpen, HelpCircle, Shield, Mail, Lock, Cookie, Users, ChevronRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useNewApplicationsCount } from "@/hooks/useNewApplicationsCount";
import { Badge } from "@/components/ui/badge";
import { NotificationsDropdown } from "@/components/notifications/NotificationsDropdown";
import { MobileNotificationsBell } from "@/components/notifications/MobileNotificationsBell";
import { useTheme } from "@/contexts/ThemeContext";
import { usePerkAccess } from "@/hooks/usePerks";
import { perksMonthStore } from "@/lib/perkPlacements";
import { Gift, Sparkles } from "lucide-react";
import blackLogo from "@/assets/Black_Logo.png";
import whiteLogo from "@/assets/White_Logo.png";

/**
 * Site header. Phone (below md): logo, bell, theme and the menu. Tablet (md to
 * lg): logo, Messages, bell, Dashboard and the menu for everything else.
 * Desktop (lg and up): the full link row. `wide` lines the header up with
 * the redesigned pages (NN_PAGE) instead of the default container.
 */
const Navbar = ({ wide = false }: { wide?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const closeMenu = () => {
    setIsOpen(false);
    setShowHelp(false);
  };

  const helpItems = [
    { href: "/about", label: "About NomadNest", icon: Info },
    { href: "/how-it-works", label: "How It Works", icon: BookOpen },
    { href: "/faq", label: "FAQ", icon: HelpCircle },
    { href: "/safety", label: "Safety & Trust", icon: Shield },
    { href: "/contact", label: "Contact", icon: Mail },
    { href: "/terms", label: "Terms of Service", icon: FileText },
    { href: "/privacy", label: "Privacy Policy", icon: Lock },
    { href: "/cookies", label: "Cookie Policy", icon: Cookie },
    { href: "/code-of-conduct", label: "Community Standards", icon: Users },
  ];
  const location = useLocation();
  const { unreadCount } = useUnreadMessages();
  const { newApplicationsCount } = useNewApplicationsCount();
  const { user, loading, role, signOut } = useAuth();

  const handleSignOut = async () => {
    closeMenu();
    await signOut();
  };
  const { isAdmin } = useIsAdmin();
  const { theme, toggleTheme } = useTheme();
  const logo = theme === "dark" ? whiteLogo : blackLogo;

  // Member perks (P2): members only, next to Membership. "Perks" in the top
  // bar, "Member perks" in the phone menu; the gold "New this month" badge
  // until the member opens /perks this month (kept on this device).
  const { isMember } = usePerkAccess();
  const perksNew = isMember && !perksMonthStore.seenThisMonth();
  const navLinks: { href: string; label: string; menuLabel?: string; icon: typeof Search; isNew?: boolean }[] = [
    { href: "/browse-sits", label: "Browse Sits", icon: Search },
    { href: "/browse-sitters", label: "Browse Nomads", icon: User },
    ...(isMember ? [{ href: "/perks", label: "Perks", menuLabel: "Member perks", icon: Gift, isNew: perksNew }] : []),
    { href: "/membership", label: "Membership", icon: Crown },
  ];
  const NewBadge = () => (
    <span className="ml-2 inline-flex h-[22px] items-center gap-1 rounded-full bg-[var(--nn-gold)] px-2 text-[11px] font-bold text-[var(--nn-gold-text)]">
      <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
      New this month
    </span>
  );

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-lg border-b border-border">
      <div className={cn("container mx-auto", wide && "md:max-w-none md:px-8 lg:max-w-[1024px] lg:px-6 xl:max-w-[1200px]")}>
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="flex h-11 shrink-0 items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src={logo} alt="NomadNest" className="h-10 w-auto" />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden min-w-0 lg:flex items-center gap-0.5">
            {navLinks.map((link) => (
              <Link key={link.href} to={link.href}>
                <Button
                  variant="ghost"
                  className={cn(
                    "h-11 px-2.5 xl:px-3 text-muted-foreground hover:text-foreground",
                    isActive(link.href) && "text-[var(--nn-accent-dark)] bg-terracotta-light"
                  )}
                >
                  {link.label}
                </Button>
              </Link>
            ))}
            {/* Only visible to sitters and combined members — hidden for owner-only role */}
            {user && (role === "sitter" || role === "both") && (
              <Link to="/find-nomads">
                <Button
                  variant="ghost"
                  className={cn(
                    "h-11 px-2.5 xl:px-3 text-muted-foreground hover:text-foreground",
                    isActive("/find-nomads") && "text-[var(--nn-accent-dark)] bg-terracotta-light"
                  )}
                >
                  Nomads Near Me
                </Button>
              </Link>
            )}
          </div>

          {/* Desktop Auth Buttons */}
          <div className="hidden shrink-0 md:flex items-center gap-1 lg:gap-0.5 xl:gap-1">
            {loading ? (
              <div className="w-24 h-9 bg-muted animate-pulse rounded-md" />
            ) : user ? (
              <>
                {(role === "sitter" || role === "both") && (
                  <Link to="/saved" className="hidden lg:block">
                    <Button variant="ghost" aria-label="Saved" className={cn("h-11 px-3", isActive("/saved") && "text-[var(--nn-accent-dark)] bg-terracotta-light")}>
                      <Heart className="w-4 h-4 2xl:mr-2" aria-hidden="true" />
                      <span className="hidden 2xl:inline">Saved</span>
                    </Button>
                  </Link>
                )}
                {(role === "owner" || role === "both") && (
                  <Link to="/applications" className="hidden lg:block">
                    <Button
                      variant="ghost"
                      aria-label={newApplicationsCount > 0 ? `Applications, ${newApplicationsCount} new` : "Applications"}
                      className={cn("relative h-11 px-3", isActive("/applications") && "text-[var(--nn-accent-dark)] bg-terracotta-light")}
                    >
                      <FileText className="w-4 h-4 2xl:mr-2" aria-hidden="true" />
                      <span className="hidden 2xl:inline">Applications</span>
                      {newApplicationsCount > 0 && (
                        <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                          {newApplicationsCount > 99 ? "99+" : newApplicationsCount}
                        </Badge>
                      )}
                    </Button>
                  </Link>
                )}
                {/* Tablet: Messages as an icon with its badge */}
                <Link
                  to="/inbox"
                  aria-label={unreadCount > 0 ? `Messages, ${unreadCount} unread` : "Messages"}
                  className={cn(
                    "relative flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground lg:hidden",
                    isActive("/inbox") && "text-[var(--nn-accent-dark)] bg-terracotta-light",
                  )}
                >
                  <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  {unreadCount > 0 && (
                    <Badge className="absolute right-0 top-1 flex h-5 min-w-5 items-center justify-center p-0 text-xs">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Badge>
                  )}
                </Link>
                <Link to="/inbox" className="hidden lg:block">
                  <Button
                    variant="ghost"
                    aria-label={unreadCount > 0 ? `Messages, ${unreadCount} unread` : "Messages"}
                    className={cn("relative h-11 px-3", isActive("/inbox") && "text-[var(--nn-accent-dark)] bg-terracotta-light")}
                  >
                    <MessageCircle className="w-4 h-4 2xl:mr-2" aria-hidden="true" />
                    <span className="hidden 2xl:inline">Messages</span>
                    {unreadCount > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </Badge>
                    )}
                  </Button>
                </Link>
                <NotificationsDropdown />
                {isAdmin && (
                  <Link to="/admin" className="hidden lg:block">
                    <Button variant="ghost" aria-label="Admin" className={cn("h-11 px-3", isActive("/admin") && "text-[var(--nn-accent-dark)] bg-terracotta-light")}>
                      <ShieldCheck className="w-4 h-4 2xl:mr-2" aria-hidden="true" />
                      <span className="hidden 2xl:inline">Admin</span>
                    </Button>
                  </Link>
                )}
                <Link to="/dashboard" className="ml-1">
                  {/* Icon only between 1024 and 1279, where the text links need the room. */}
                  <Button aria-label="Dashboard" className="h-11 px-4 lg:w-11 lg:px-0 xl:w-auto xl:px-4">
                    <LayoutDashboard className="w-4 h-4 mr-2 lg:mr-0 xl:mr-2" aria-hidden="true" />
                    <span className="lg:hidden xl:inline">Dashboard</span>
                  </Button>
                </Link>
                <Button variant="ghost" onClick={handleSignOut} aria-label="Sign out" className="hidden h-11 w-11 p-0 lg:inline-flex">
                  <LogOut className="w-4 h-4" />
                </Button>

              </>
            ) : (
              // Signed out: Create profile is the main action; Log in is the quieter one.
              <div className="flex items-center gap-3">
                <Button asChild className="h-12 px-5">
                  <Link to="/auth?signup=true">Create profile</Link>
                </Button>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <span className="hidden md:inline lg:hidden xl:inline">Already a member?</span>
                  <Button asChild variant="ghost" className="h-11 px-3 font-semibold text-[var(--nn-accent-dark)]">
                    <Link to="/auth">Log in</Link>
                  </Button>
                </span>
              </div>
            )}
          </div>

          {/* Theme Toggle + Mobile Notifications + Mobile Menu Toggle */}
          <div className="flex shrink-0 items-center gap-1">
            {user && (
              <div className="md:hidden">
                <MobileNotificationsBell />
              </div>
            )}
            <button
              className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-md"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              className="flex h-11 w-11 items-center justify-center text-foreground lg:hidden"
              onClick={() => (isOpen ? closeMenu() : setIsOpen(true))}
              aria-label={isOpen ? "Close menu" : "Menu"}
              aria-expanded={isOpen}
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto lg:hidden bg-surface border-b border-border animate-fade-in">
          {showHelp ? (
            <div className="container py-4 space-y-2 animate-fade-in">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <button
                  onClick={() => setShowHelp(false)}
                  className="p-2 -ml-2 text-foreground hover:text-primary transition-colors"
                  aria-label="Back to menu"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-bold text-foreground">Help & Support</h2>
              </div>
              <div className="space-y-1 pt-2">
                {helpItems.map((item) => (
                  <Link key={item.href} to={item.href} onClick={closeMenu}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start text-[var(--nn-accent-dark)] hover:bg-terracotta-light",
                        isActive(item.href) && "bg-terracotta-light"
                      )}
                    >
                      <item.icon className="w-4 h-4 mr-2 text-[var(--nn-accent-dark)]" />
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronRight className="w-4 h-4 ml-auto text-[var(--nn-accent-dark)]" />
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="container py-4 space-y-2">
              {navLinks.map((link) => (
                <Link key={link.href} to={link.href} onClick={closeMenu}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start text-muted-foreground",
                      isActive(link.href) && "text-[var(--nn-accent-dark)] bg-terracotta-light"
                    )}
                  >
                    <link.icon className="w-4 h-4 mr-2" />
                    {link.menuLabel ?? link.label}
                    {link.isNew && <NewBadge />}
                  </Button>
                </Link>
              ))}
              {user && (role === "sitter" || role === "both") && (
                <Link to="/find-nomads" onClick={closeMenu}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start text-muted-foreground",
                      isActive("/find-nomads") && "text-[var(--nn-accent-dark)] bg-terracotta-light"
                    )}
                  >
                    <MapPin className="w-4 h-4 mr-2" />
                    Nomads Near Me
                  </Button>
                </Link>
              )}

              {user && (
                <div className="pt-2 mt-2 border-t border-border space-y-1">
                  {isAdmin && (
                    <Link to="/admin" onClick={closeMenu}>
                      <Button variant="ghost" className={cn("w-full justify-start", isActive("/admin") && "text-[var(--nn-accent-dark)] bg-terracotta-light")}>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Admin Panel
                      </Button>
                    </Link>
                  )}

                  {(role === "sitter" || role === "both") && (
                    <Link to="/saved" onClick={closeMenu}>
                      <Button variant="ghost" className={cn("w-full justify-start", isActive("/saved") && "text-[var(--nn-accent-dark)] bg-terracotta-light")}>
                        <Heart className="w-4 h-4 mr-2" />
                        Saved Listings
                      </Button>
                    </Link>
                  )}
                  {(role === "owner" || role === "both") && (
                    <Link to="/applications" onClick={closeMenu}>
                      <Button variant="ghost" className={cn("w-full justify-start relative", isActive("/applications") && "text-[var(--nn-accent-dark)] bg-terracotta-light")}>
                        <FileText className="w-4 h-4 mr-2" />
                        Applications
                        {newApplicationsCount > 0 && (
                          <Badge variant="destructive" className="ml-auto h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                            {newApplicationsCount > 99 ? "99+" : newApplicationsCount}
                          </Badge>
                        )}
                      </Button>
                    </Link>
                  )}
                  <Link to="/inbox" onClick={closeMenu}>
                    <Button variant="ghost" className={cn("w-full justify-start relative", isActive("/inbox") && "text-[var(--nn-accent-dark)] bg-terracotta-light")}>
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Messages
                      {unreadCount > 0 && (
                        <Badge className="ml-auto h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                      )}
                    </Button>
                  </Link>
                  
                </div>
              )}

              {/* Help & Support entry */}
              <div className="pt-2 mt-2 border-t border-border">
                <Button
                  variant="ghost"
                  onClick={() => setShowHelp(true)}
                  className="w-full justify-start text-[var(--nn-accent-dark)] hover:bg-terracotta-light"
                >
                  <HelpCircle className="w-4 h-4 mr-2 text-[var(--nn-accent-dark)]" />
                  <span className="flex-1 text-left">Help & Support</span>
                  <ChevronRight className="w-4 h-4 ml-auto text-[var(--nn-accent-dark)]" />
                </Button>
              </div>

              <div className="pt-4 space-y-2 border-t border-border">
                {user ? (
                  <>
                    <Link to="/dashboard" onClick={closeMenu}>
                      <Button className="w-full">
                        <LayoutDashboard className="w-4 h-4 mr-2" />
                        Dashboard
                      </Button>
                    </Link>
                    <Button variant="outline" className="w-full" onClick={handleSignOut}>
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign out
                    </Button>
                  </>
                ) : (
                  // Signed out: Create profile first, then "Already a member? Log in".
                  <div className="flex flex-col gap-4">
                    <Button asChild className="h-12 w-full text-[15px]">
                      <Link to="/auth?signup=true" onClick={closeMenu}>
                        Create profile
                      </Link>
                    </Button>
                    <p className="flex flex-wrap items-center justify-center gap-x-1 text-[15px] text-muted-foreground">
                      Already a member?
                      <Button asChild variant="ghost" className="h-11 px-3 text-[15px] font-semibold text-[var(--nn-accent-dark)]">
                        <Link to="/auth" onClick={closeMenu}>
                          Log in
                        </Link>
                      </Button>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;