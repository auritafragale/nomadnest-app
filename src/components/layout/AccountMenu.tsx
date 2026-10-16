import { Link } from "react-router-dom";
import { ChevronDown, Crown, FileText, Heart, LogOut, Moon, Settings, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccountSummary } from "@/hooks/useAccountSummary";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

const ROW = "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold";

/** The member's initial (or photo) in a gold-ringed circle. */
const Avatar = ({ initial, src }: { initial: string; src: string | null }) => (
  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--nn-gold)] bg-[var(--nn-chip)] text-sm font-bold text-foreground">
    {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initial}
  </span>
);

/**
 * Desktop account menu (design: HeaderMenuDesktop, HeaderMenuWideDark): the
 * secondary places that used to be separate top-bar buttons.
 */
const AccountMenu = ({
  showSaved,
  showApplications,
  newApplications,
  isAdmin,
  onSignOut,
}: {
  showSaved: boolean;
  showApplications: boolean;
  newApplications: number;
  isAdmin: boolean;
  onSignOut: () => void;
}) => {
  const { data: me } = useAccountSummary();
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  const name = me?.firstName || "You";
  const initial = (me?.firstName?.[0] ?? "?").toUpperCase();
  const icon = "h-[18px] w-[18px] shrink-0 text-muted-foreground";

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="ml-1 flex h-11 items-center gap-1.5 rounded-full bg-muted px-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar initial={initial} src={me?.avatar ?? null} />
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-[280px] rounded-[18px] p-2.5">
        <DropdownMenuLabel className="mb-1.5 flex items-center gap-3 px-3 pb-3 pt-2 font-normal">
          <Avatar initial={initial} src={me?.avatar ?? null} />
          <span className="flex min-w-0 flex-col gap-[3px]">
            <span className="truncate text-[15px] font-bold">{name}</span>
            {me?.founding && (
              <span className="inline-flex h-[22px] w-fit items-center rounded-full bg-[#E8B53E] px-[11px] text-xs font-bold text-[#3A2A06]">
                ★ Founding member
              </span>
            )}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showSaved && (
          <DropdownMenuItem asChild className={ROW}>
            <Link to="/saved">
              <Heart className={icon} aria-hidden="true" />
              Saved sits
            </Link>
          </DropdownMenuItem>
        )}
        {showApplications && (
          <DropdownMenuItem asChild className={ROW}>
            <Link to="/applications" aria-label={newApplications > 0 ? `My applications, ${newApplications} new` : undefined}>
              <FileText className={icon} aria-hidden="true" />
              <span className="flex-1">My applications</span>
              {newApplications > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground">
                  {newApplications > 99 ? "99+" : newApplications}
                </span>
              )}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className={ROW}>
          <Link to="/membership">
            <Crown className={icon} aria-hidden="true" />
            Membership
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ROW}>
          <Link to="/settings">
            <Settings className={icon} aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild className={ROW}>
            <Link to="/admin">
              <ShieldCheck className={icon} aria-hidden="true" />
              Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          role="menuitemcheckbox"
          aria-checked={dark}
          onSelect={(e) => {
            e.preventDefault();
            toggleTheme();
          }}
          className={cn(ROW, "justify-between")}
        >
          <span className="flex items-center gap-3">
            <Moon className={icon} aria-hidden="true" />
            Dark mode
          </span>
          <span
            aria-hidden="true"
            className={cn("flex h-6 w-10 items-center rounded-full p-[3px] transition-colors", dark ? "justify-end bg-brand-teal" : "justify-start bg-input")}
          >
            <span className="h-[18px] w-[18px] rounded-full bg-background shadow" />
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSignOut} className={cn(ROW, "text-[var(--nn-accent-dark)] focus:text-[var(--nn-accent-dark)]")}>
          <LogOut className={icon} aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AccountMenu;
