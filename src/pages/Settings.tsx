import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  ChevronRight,
  Download,
  Eye,
  HelpCircle,
  Languages,
  Lock,
  LogOut,
  Moon,
  Shield,
  ShieldCheck,
  Star,
  type LucideIcon,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { NN_PAGE, RoleTheme } from "@/components/nn/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useVerification } from "@/hooks/useVerification";
import { useProfileVisibility } from "@/hooks/useProfileVisibility";
import { useMyPreferredLanguage } from "@/hooks/useDailyUpdates";
import { supabase } from "@/integrations/supabase/client";
import { UPDATE_LANGUAGES } from "@/lib/dailyUpdate";
import NotificationsSection from "@/components/settings/NotificationsSection";
import {
  AppearanceSection,
  DataSection,
  DeleteAccountSheet,
  HelpSection,
  LanguageSection,
  LoginSection,
  PrivacySection,
  VerificationSection,
  useMyContact,
} from "@/components/settings/SettingsSections";
import { cn } from "@/lib/utils";

type SectionId = "notifications" | "privacy" | "verification" | "login" | "language" | "appearance" | "data" | "help";

const SECTIONS: Record<SectionId, { title: string; intro?: string; icon: LucideIcon }> = {
  login: { title: "Login and security", icon: Lock },
  verification: { title: "Verification", intro: "Verified members get more invitations and help keep NomadNest safe.", icon: ShieldCheck },
  notifications: { title: "Notifications", intro: "Choose how we tell you about each thing. Safety and account messages always reach you.", icon: Bell },
  privacy: {
    title: "Privacy and visibility",
    intro: "You decide who can find you. Members only ever see your first name, and never your contact details or exact address.",
    icon: Eye,
  },
  language: {
    title: "Language",
    intro: "Messages and daily updates from people who write in another language can be translated for you automatically.",
    icon: Languages,
  },
  appearance: { title: "Appearance", icon: Moon },
  data: {
    title: "Your data",
    intro: "Download a copy of everything you have shared with NomadNest: profile, listing, messages, reviews and sit history.",
    icon: Download,
  },
  help: { title: "Help and tour", icon: HelpCircle },
};
const ORDER: SectionId[] = ["login", "verification", "notifications", "privacy", "language", "appearance", "data", "help"];
const isSection = (v: string | undefined): v is SectionId => !!v && v in SECTIONS;

const PLAN_NAME: Record<string, string> = { sitter: "Nomad", owner: "Pet Parent", combined: "Combined" };

const SectionBody = ({ id, openPhone }: { id: SectionId; openPhone: boolean }) => {
  switch (id) {
    case "notifications":
      return <NotificationsSection />;
    case "privacy":
      return <PrivacySection />;
    case "verification":
      return <VerificationSection openPhone={openPhone} />;
    case "login":
      return <LoginSection />;
    case "language":
      return <LanguageSection />;
    case "appearance":
      return <AppearanceSection />;
    case "data":
      return <DataSection />;
    case "help":
      return <HelpSection />;
  }
};

const Settings = () => {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const { user, role, signOut } = useAuth();
  const { activeRole } = useActiveRole();
  const { isAdmin } = useIsAdmin();
  const { preference } = useTheme();
  const { data: contact } = useMyContact();
  const { data: verification } = useVerification();
  const { data: vis } = useProfileVisibility();
  const { data: language } = useMyPreferredLanguage();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const { data: me } = useQuery({
    queryKey: ["settings-me", user?.id],
    queryFn: async () => {
      const [{ data: profile }, { data: membership }] = await Promise.all([
        supabase.rpc("get_my_profile"),
        supabase.rpc("get_my_membership"),
      ]);
      const p = (profile ?? {}) as { first_name?: string | null; avatar_url?: string | null };
      const m = (Array.isArray(membership) ? membership[0] : membership) as
        | { founding_member?: boolean; membership_status?: string | null; membership_type?: string | null }
        | null;
      return {
        firstName: (p.first_name ?? "").trim(),
        avatar: p.avatar_url ?? null,
        founding: !!m?.founding_member,
        plan: m?.membership_status === "active" || m?.membership_status === "past_due" ? m?.membership_type ?? null : null,
      };
    },
    enabled: !!user,
  });

  if (!user) return <Navigate to="/auth?return=/settings" replace />;

  // Old link from the profile editors: ?verify=phone.
  const openPhone = searchParams.get("verify") === "phone";
  if (!section && openPhone) return <Navigate to="/settings/verification?verify=phone" replace />;
  if (section && !isSection(section)) return <Navigate to="/settings" replace />;

  const current: SectionId | null = isSection(section) ? section : desktop ? "notifications" : null;

  const roles = role === "both" ? "Nomad and Pet Parent" : role === "owner" ? "Pet Parent" : "Nomad";
  const langLabel = UPDATE_LANGUAGES.find((l) => l.code === language)?.label ?? "Off";
  const stats: Record<SectionId, { text: string; ok?: boolean }> = {
    login: { text: "Email and password" },
    verification: { text: verification?.id_verified ? `✓ ID${contact?.phoneVerified ? " and phone" : ""}` : "Not verified yet", ok: !!verification?.id_verified },
    notifications: { text: "Email and push" },
    privacy: { text: vis?.hasSitterProfile ? (vis.sitterProfileActive ? "Profile visible" : "Profile hidden") : vis?.ownerProfileActive === false ? "Listing paused" : "Who can find you" },
    language: { text: langLabel },
    appearance: { text: preference === "system" ? "Match my phone" : preference === "dark" ? "Dark" : "Light" },
    data: { text: "Download a copy" },
    help: { text: "Questions, tour" },
  };
  const membershipStat = me?.founding ? "Combined · Founding" : me?.plan ? PLAN_NAME[me.plan] ?? "Member" : "Not a member yet";

  const logOut = async () => {
    await signOut();
    navigate("/");
  };

  const header = (
    <section aria-label="Your account" className="flex items-center gap-3 rounded-[22px] border border-[var(--nn-border)] bg-[var(--nn-soft)] p-4">
      <Avatar className="h-14 w-14">
        <AvatarImage src={me?.avatar ?? undefined} alt="" />
        <AvatarFallback className="bg-[var(--nn-chip)] text-lg font-bold text-foreground">{(me?.firstName?.[0] ?? "?").toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[17px] font-bold">
          {me?.firstName || "You"}
          {me?.founding && <span className="rounded-full bg-[#E8B53E] px-2 py-0.5 text-xs font-bold text-[#3A2A06]">Founding</span>}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {contact?.email || user.email} · {roles}
        </p>
      </div>
    </section>
  );

  const cardBase = "flex h-full min-h-[112px] flex-col items-start gap-2 rounded-[18px] bg-[var(--nn-soft)] p-3 text-left md:p-4";
  const hubCards = (
    <ul className="grid grid-cols-3 gap-2 md:gap-3">
      <li>
        <Link to="/membership" aria-label={`Membership, ${membershipStat}`} className={cardBase}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]">
            <Star className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-[15px] font-bold leading-snug">Membership</span>
          <span className={cn("mt-auto text-xs font-bold leading-snug md:text-sm", me?.plan || me?.founding ? "text-brand-teal-text" : "text-muted-foreground")}>{membershipStat}</span>
        </Link>
      </li>
      {ORDER.map((id) => {
        const s = SECTIONS[id];
        const Icon = s.icon;
        return (
          <li key={id}>
            <Link to={`/settings/${id}`} aria-label={`${s.title}, ${stats[id].text}`} className={cardBase}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-[15px] font-bold leading-snug">{s.title}</span>
              <span className={cn("mt-auto text-xs font-bold leading-snug md:text-sm", stats[id].ok ? "text-brand-teal-text" : "text-muted-foreground")}>{stats[id].text}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const bottom = (
    <div className="flex flex-col gap-2">
      {isAdmin && (
        <Link to="/admin" className="flex min-h-[52px] items-center justify-between gap-3 rounded-[18px] border border-[var(--nn-border)] bg-card px-4 font-semibold">
          <span className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[var(--nn-accent-dark)]" aria-hidden="true" />
            Founder admin panel
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}
      <button type="button" onClick={logOut} className="flex min-h-[52px] items-center gap-2 rounded-[18px] border border-[var(--nn-border)] bg-card px-4 text-left font-semibold">
        <LogOut className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        Log out
      </button>
      <button type="button" onClick={() => setDeleteOpen(true)} aria-haspopup="dialog" className="flex min-h-[52px] items-center rounded-[18px] px-4 text-left font-semibold text-[var(--nn-danger-text)]">
        Delete my account
      </button>
    </div>
  );

  const theme = activeRole === "owner" ? "owner" : "sitter";

  // Desktop: side list and the open section.
  if (desktop) {
    const s = SECTIONS[current!];
    return (
      <RoleTheme role={theme} className="min-h-screen">
        <Navbar wide />
        <main className={cn(NN_PAGE, "flex gap-8 pb-16 pt-24")}>
          <aside aria-label="Settings sections" className="flex w-[300px] shrink-0 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Link to="/dashboard" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-muted-foreground">← Dashboard</Link>
              <h1 className="font-display text-[36px] font-normal leading-tight">Settings</h1>
            </div>
            {header}
            <nav className="flex flex-col gap-1">
              <Link to="/membership" className="flex min-h-[48px] items-center justify-between rounded-2xl px-3 hover:bg-[var(--nn-soft)]">
                <span className="flex items-center gap-3 font-semibold">
                  <Star className="h-5 w-5 text-[var(--nn-accent-dark)]" aria-hidden="true" />
                  Membership
                </span>
                <span className="text-xs text-muted-foreground">{membershipStat}</span>
              </Link>
              {ORDER.map((id) => {
                const Icon = SECTIONS[id].icon;
                const on = id === current;
                return (
                  <Link
                    key={id}
                    to={`/settings/${id}`}
                    aria-current={on ? "page" : undefined}
                    className={cn("flex min-h-[48px] items-center gap-3 rounded-2xl px-3 font-semibold", on ? "bg-[var(--nn-tint)] text-foreground" : "hover:bg-[var(--nn-soft)]")}
                  >
                    <Icon className="h-5 w-5 text-[var(--nn-accent-dark)]" aria-hidden="true" />
                    {SECTIONS[id].title}
                  </Link>
                );
              })}
            </nav>
            {bottom}
          </aside>
          <section aria-labelledby="section-title" className="flex min-w-0 max-w-3xl flex-1 flex-col gap-4">
            <h2 id="section-title" className="font-display text-[30px] font-normal leading-tight">{s.title}</h2>
            {s.intro && <p className="text-[15px] text-muted-foreground">{s.intro}</p>}
            <SectionBody id={current!} openPhone={openPhone} />
          </section>
        </main>
        <DeleteAccountSheet open={deleteOpen} onOpenChange={setDeleteOpen} />
      </RoleTheme>
    );
  }

  // Phone and tablet: one section on its own page.
  if (current) {
    const s = SECTIONS[current];
    return (
      <RoleTheme role={theme} className="min-h-screen">
        <Navbar wide />
        <main className={cn(NN_PAGE, "flex flex-col gap-4 pb-24 pt-20 md:pt-24")}>
          <div className="flex flex-col gap-1">
            <Link to="/settings" className="inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-muted-foreground">← Settings</Link>
            <h1 className="font-display text-[30px] font-normal leading-tight">{s.title}</h1>
            {s.intro && <p className="text-[15px] text-muted-foreground">{s.intro}</p>}
          </div>
          <div className="flex max-w-2xl flex-col gap-3">
            <SectionBody id={current} openPhone={openPhone} />
          </div>
        </main>
      </RoleTheme>
    );
  }

  return (
    <RoleTheme role={theme} className="min-h-screen">
      <Navbar wide />
      <main className={cn(NN_PAGE, "flex flex-col gap-5 pb-24 pt-20 md:pt-24")}>
        <div className="flex flex-col gap-1">
          <Link to="/dashboard" className="inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-muted-foreground">← Dashboard</Link>
          <h1 className="font-display text-[32px] font-normal leading-tight">Settings</h1>
        </div>
        {header}
        <nav aria-label="Settings sections">{hubCards}</nav>
        {bottom}
      </main>
      <DeleteAccountSheet open={deleteOpen} onOpenChange={setDeleteOpen} />
    </RoleTheme>
  );
};

export default Settings;
