import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck,
  Gift,
  Mail,
  Users,
  Home,
  CalendarDays,
  Crown,
  Ticket,
  ChevronRight,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Stats {
  pending_verifications: number;
  total_members: number;
  active_members: number;
  founding_members: number;
  published_listings: number;
  open_sit_dates: number;
  active_perks: number;
  founding_code_used: number;
  founding_code_max: number;
}

interface Member {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  role: string | null;
  membership_status: string | null;
  membership_type: string | null;
  founding_member: boolean | null;
  id_verified: boolean | null;
  email_verified: boolean | null;
  phone_verified: boolean | null;
  is_admin: boolean | null;
  created_at: string;
}

const roleLabel = (role: string | null) => {
  if (role === "sitter") return "Nomad";
  if (role === "owner") return "Pet Parent";
  if (role === "both") return "Combined";
  return "No role yet";
};

const AdminHub = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [statsRes, membersRes] = await Promise.all([
        supabase.rpc("admin_dashboard_stats"),
        supabase.rpc("admin_list_members"),
      ]);

      if (statsRes.error) {
        toast({
          variant: "destructive",
          title: "Could not load stats",
          description: statsRes.error.message,
        });
      } else {
        const row = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;
        setStats((row ?? null) as Stats | null);
      }

      if (membersRes.error) {
        toast({
          variant: "destructive",
          title: "Could not load members",
          description: membersRes.error.message,
        });
      } else {
        setMembers((membersRes.data ?? []) as unknown as Member[]);
      }
      setLoading(false);
    };
    load();
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.first_name, m.last_name, m.email, m.city, m.country]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [members, query]);

  const tiles = [
    {
      href: "/admin/verifications",
      label: "ID Verifications",
      description: stats
        ? `${stats.pending_verifications} awaiting review`
        : "Review member ID submissions",
      icon: ShieldCheck,
    },
    {
      href: "/admin/perks",
      label: "Member Perks",
      description: stats ? `${stats.active_perks} live partners` : "Manage affiliate partners",
      icon: Gift,
    },
    {
      href: "/admin/emails",
      label: "Email Templates",
      description: "Preview and test every app email",
      icon: Mail,
    },
  ];

  const statCards = [
    { label: "Members", value: stats?.total_members, icon: Users },
    { label: "Active memberships", value: stats?.active_members, icon: Crown },
    { label: "Founding members", value: stats?.founding_members, icon: Crown },
    { label: "Published listings", value: stats?.published_listings, icon: Home },
    { label: "Open sit dates", value: stats?.open_sit_dates, icon: CalendarDays },
    { label: "Pending ID reviews", value: stats?.pending_verifications, icon: ShieldCheck },
  ];

  const spotsLeft = stats ? stats.founding_code_max - stats.founding_code_used : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container max-w-5xl mx-auto px-4">
          <header className="mb-6">
            <h1 className="text-2xl md:text-3xl font-bold">Founder admin</h1>
            <p className="text-sm text-muted-foreground">
              Everything you need to run NomadNest in one place.
            </p>
          </header>

          <AdminNav />

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {statCards.map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{label}</span>
                  </div>
                  {loading ? (
                    <Skeleton className="h-7 w-12" />
                  ) : (
                    <p className="text-2xl font-bold">{value ?? 0}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Founding code */}
          <Card className="mb-8">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Ticket className="w-4 h-4 text-primary" />
                Founding member code
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-6 w-48" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {stats?.founding_code_used ?? 0}
                  </span>{" "}
                  redeemed ·{" "}
                  <span className="font-semibold text-foreground">{spotsLeft ?? 0}</span> spots
                  remaining of {stats?.founding_code_max ?? 0}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Tools */}
          <h2 className="text-lg font-semibold mb-3">Tools</h2>
          <div className="grid gap-3 sm:grid-cols-3 mb-10">
            {tiles.map(({ href, label, description, icon: Icon }) => (
              <Link key={href} to={href} className="group">
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Icon className="w-5 h-5 text-primary" />
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="font-semibold mt-3">{label}</p>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Members */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold">Members ({members.length})</h2>
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search name, email or city"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search members"
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No members match that search.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((m) => {
                const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || "Unnamed";
                return (
                  <Card key={m.id}>
                    <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">{name}</p>
                          {m.is_admin && <Badge variant="outline">Admin</Badge>}
                          {m.founding_member && (
                            <Badge className="bg-accent text-accent-foreground">Founding</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{m.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {roleLabel(m.role)}
                          {m.city ? ` · ${m.city}` : ""}
                          {m.country ? `, ${m.country}` : ""} · joined{" "}
                          {new Date(m.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        <Badge variant={m.membership_status === "active" ? "default" : "outline"}>
                          {m.membership_status === "active" ? "Active" : "No membership"}
                        </Badge>
                        {m.id_verified && <Badge variant="outline">ID</Badge>}
                        {m.email_verified && <Badge variant="outline">Email</Badge>}
                        {m.phone_verified && <Badge variant="outline">Phone</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminHub;
