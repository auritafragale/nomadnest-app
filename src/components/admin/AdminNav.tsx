import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LayoutDashboard, ShieldCheck, Gift, Mail } from "lucide-react";

const items = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/verifications", label: "Verifications", icon: ShieldCheck },
  { href: "/admin/perks", label: "Perks", icon: Gift },
  { href: "/admin/emails", label: "Emails", icon: Mail },
];

const AdminNav = () => {
  const location = useLocation();

  return (
    <nav
      aria-label="Admin sections"
      className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-6 scrollbar-none"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = location.pathname === href;
        return (
          <Link
            key={href}
            to={href}
            className={cn(
              "flex items-center gap-2 shrink-0 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface text-muted-foreground border-border hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
};

export default AdminNav;
