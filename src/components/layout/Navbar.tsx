import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search, User, Menu, X, LayoutDashboard, MessageCircle, FileText, Heart, MapPin, Moon, Sun, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useNewApplicationsCount } from "@/hooks/useNewApplicationsCount";
import { Badge } from "@/components/ui/badge";
import { NotificationsDropdown } from "@/components/notifications/NotificationsDropdown";
import { MobileNotificationsSection } from "@/components/notifications/MobileNotificationsSection";
import { useTheme } from "@/contexts/ThemeContext";
import blackLogo from "@/assets/Black_Logo.png";
import whiteLogo from "@/assets/White_Logo.png";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { unreadCount } = useUnreadMessages();
  const { newApplicationsCount } = useNewApplicationsCount();
  const { user, loading, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const logo = theme === "dark" ? whiteLogo : blackLogo;

  const navLinks = [
    { href: "/browse-sits", label: "Browse Sits", icon: Search },
    { href: "/browse-sitters", label: "Browse Sitters", icon: User },
    { href: "/membership", label: "Membership", icon: Crown },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-lg border-b border-border">
      <div className="container mx-auto">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link 
            to="/" 
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src={logo} alt="NomadNest" className="h-10 w-auto" />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link key={link.href} to={link.href}>
                <Button
                  variant="ghost"
                  className={cn(
                    "text-muted-foreground hover:text-foreground",
                    isActive(link.href) && "text-primary bg-terracotta-light"
                  )}
                >
                  <link.icon className="w-4 h-4 mr-2" />
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
                    "text-muted-foreground hover:text-foreground",
                    isActive("/find-nomads") && "text-primary bg-terracotta-light"
                  )}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Nomads Near Me
                </Button>
              </Link>
            )}
          </div>

          {/* Desktop Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {loading ? (
              <div className="w-24 h-9 bg-muted animate-pulse rounded-md" />
            ) : user ? (
              <>
                {(role === "sitter" || role === "both") && (
                  <Link to="/saved">
                    <Button variant="ghost" className={cn(isActive("/saved") && "text-primary bg-terracotta-light")}>
                      <Heart className="w-4 h-4 mr-2" />
                      Saved
                    </Button>
                  </Link>
                )}
                {(role === "owner" || role === "both") && (
                  <Link to="/applications">
                    <Button variant="ghost" className={cn("relative", isActive("/applications") && "text-primary bg-terracotta-light")}>
                      <FileText className="w-4 h-4 mr-2" />
                      Applications
                      {newApplicationsCount > 0 && (
                        <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                          {newApplicationsCount > 99 ? "99+" : newApplicationsCount}
                        </Badge>
                      )}
                    </Button>
                  </Link>
                )}
                <Link to="/inbox">
                  <Button variant="ghost" className={cn("relative", isActive("/inbox") && "text-primary bg-terracotta-light")}>
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Messages
                    {unreadCount > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </Badge>
                    )}
                  </Button>
                </Link>
                <NotificationsDropdown />
                <Link to="/dashboard">
                  <Button>
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/auth">
                  <Button variant="ghost">Log in</Button>
                </Link>
                <Link to="/auth?signup=true">
                  <Button>Create profile</Button>
                </Link>
              </>
            )}
          </div>

          {/* Theme Toggle + Mobile Menu Toggle */}
          <div className="flex items-center gap-1">
            <button
              className="p-2.5 text-muted-foreground hover:text-foreground transition-colors rounded-md"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              className="md:hidden p-2.5 text-foreground"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle menu"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-surface border-b border-border animate-fade-in">
          <div className="container py-4 space-y-2">
            {navLinks.map((link) => (
              <Link key={link.href} to={link.href} onClick={() => setIsOpen(false)}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start text-muted-foreground",
                    isActive(link.href) && "text-primary bg-terracotta-light"
                  )}
                >
                  <link.icon className="w-4 h-4 mr-2" />
                  {link.label}
                </Button>
              </Link>
            ))}
            {/* Only visible to sitters and combined members — hidden for owner-only role */}
            {user && (role === "sitter" || role === "both") && (
              <Link to="/find-nomads" onClick={() => setIsOpen(false)}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start text-muted-foreground",
                    isActive("/find-nomads") && "text-primary bg-terracotta-light"
                  )}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Nomads Near Me
                </Button>
              </Link>
            )}
            <div className="pt-4 space-y-2 border-t border-border">
              {user ? (
                <>
                  {(role === "sitter" || role === "both") && (
                    <Link to="/saved" onClick={() => setIsOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start", isActive("/saved") && "text-primary bg-terracotta-light")}>
                        <Heart className="w-4 h-4 mr-2" />
                        Saved Listings
                      </Button>
                    </Link>
                  )}
                  {(role === "owner" || role === "both") && (
                    <Link to="/applications" onClick={() => setIsOpen(false)}>
                      <Button variant="ghost" className={cn("w-full justify-start relative", isActive("/applications") && "text-primary bg-terracotta-light")}>
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
                  <Link to="/inbox" onClick={() => setIsOpen(false)}>
                    <Button variant="ghost" className={cn("w-full justify-start relative", isActive("/inbox") && "text-primary bg-terracotta-light")}>
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Messages
                      {unreadCount > 0 && (
                        <Badge className="ml-auto h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                      )}
                    </Button>
                  </Link>
                  <MobileNotificationsSection onNavigate={() => setIsOpen(false)} />
                  <Link to="/dashboard" onClick={() => setIsOpen(false)}>
                    <Button className="w-full">
                      <LayoutDashboard className="w-4 h-4 mr-2" />
                      Dashboard
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/auth" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full">
                      Log in
                    </Button>
                  </Link>
                  <Link to="/auth?signup=true" onClick={() => setIsOpen(false)}>
                    <Button className="w-full">Create profile</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;