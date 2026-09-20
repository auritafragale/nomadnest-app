import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, ShieldCheck, Gift, Mail, AlertTriangle, Flag } from "lucide-react";

type PendingCountKey = "verifications_pending" | "flags_pending" | "reports_pending";

const items: { href: string; label: string; icon: typeof LayoutDashboard; pendingKey?: PendingCountKey }[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/verifications", label: "Verifications", icon: ShieldCheck, pendingKey: "verifications_pending" },
  { href: "/admin/perks", label: "Perks", icon: Gift },
  { href: "/admin/trust", label: "Flags & Strikes", icon: AlertTriangle, pendingKey: "flags_pending" },
  { href: "/admin/reports", label: "Reports", icon: Flag, pendingKey: "reports_pending" },
  { href: "/admin/emails", label: "Emails", icon: Mail },
];

const AdminNav = () => {
  const location = useLocation();
  const [pendingCounts, setPendingCounts] = useState<Partial<Record<PendingCountKey, number>>>({});

  useEffect(() => {
    supabase
      .rpc("admin_get_pending_counts")
      .then(({ data }) => {
        // The function returns a single composite row; be tolerant of it
        // coming back either as that row directly or wrapped in an array.
        const row = (Array.isArray(data) ? data[0] : data) as Partial<Record<PendingCountKey, number>> | null;
        if (row) setPendingCounts(row);
      });
  }, []);

  return (
    <nav
      aria-label="Admin sections"
      className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-6 scrollbar-none"
    >
      {items.map(({ href, label, icon: Icon, pendingKey }) => {
        const active = location.pathname === href;
        const count = pendingKey ? pendingCounts[pendingKey] ?? 0 : 0;
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
            {count > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                {count}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
};

export default AdminNav;
