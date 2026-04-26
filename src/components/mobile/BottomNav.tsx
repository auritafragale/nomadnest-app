import { Link, useLocation } from "react-router-dom";
import { Home, Search, MessageCircle, User } from "lucide-react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/browse-sits", label: "Sits", icon: Search },
  { href: "/inbox", label: "Chats", icon: MessageCircle },
  { href: "/settings", label: "Profile", icon: User },
];

const BottomNav = () => {
  const location = useLocation();
  const { unreadCount } = useUnreadMessages();

  const isActive = (href: string) => location.pathname === href;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          const showBadge = href === "/inbox" && unreadCount > 0;
          return (
            <Link
              key={href}
              to={href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative",
                active ? "text-[#E8735A]" : "text-muted-foreground"
              )}
            >
              <div className="relative">
                <Icon className="w-6 h-6" />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#E8735A] text-white text-[10px] flex items-center justify-center font-medium">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
