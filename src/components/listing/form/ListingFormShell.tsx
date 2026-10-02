import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Home, MoreHorizontal } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NN_PAGE, StatusChip, nightsBetween, nnButton, shortRange } from "@/components/nn/ui";
import { STEP_NAMES, type ListingFormData } from "@/hooks/useListingForm";
import { petLine } from "@/components/listing/ListingParts";
import { cn } from "@/lib/utils";

const STATUS_CHIP: Record<string, { label: string; tone: "green" | "grey" | "accent" }> = {
  published: { label: "Live", tone: "green" },
  paused: { label: "Paused", tone: "accent" },
  draft: { label: "Draft", tone: "grey" },
};

export interface MenuActions {
  status: string;
  listingId: string;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  busy: boolean;
}

/** Step summaries for the desktop stepper. */
const summaries = (f: ListingFormData) => [
  "Title and dates",
  f.pets.map((p) => p.name.trim()).filter(Boolean).join(" and ") || "Your pets",
  "Rules and tasks",
  "Place, photos, details",
];

/** "How Nomads see it": a live preview card. No address, ever. */
const PreviewCard = ({ formData }: { formData: ListingFormData }) => {
  const d = formData.sit_dates.find((x) => x.start_date && x.end_date);
  const place = [formData.city, formData.country].filter(Boolean).join(", ");
  return (
    <aside aria-label="How Nomads see it" className="flex flex-col gap-3">
      <p className="text-[15px] font-bold">How Nomads see it</p>
      <div className="overflow-hidden rounded-[22px] border border-[var(--nn-border)] bg-card">
        <div className="flex aspect-[4/3] items-center justify-center bg-[#CDB79E]">
          {formData.photos[0] ? <img src={formData.photos[0]} alt="" className="h-full w-full object-cover" /> : <Home className="h-10 w-10 text-[#8A7660]" aria-hidden="true" />}
        </div>
        <div className="flex flex-col gap-1 p-4">
          <p className="text-[16px] font-bold leading-snug">{formData.title.trim() || "Your listing title"}</p>
          {place && <p className="text-sm text-muted-foreground">{place}</p>}
          {d && (
            <p className="text-sm">
              {shortRange(d.start_date, d.end_date)} · {nightsBetween(d.start_date, d.end_date)} nights
            </p>
          )}
          {formData.pets.length > 0 && <p className="text-sm text-muted-foreground">{petLine(formData.pets)}</p>}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Updates as you type. Your address is never shown.</p>
    </aside>
  );
};

/** Create or edit listing layout (design: ListingFormPhone, ListingFormTablet, ListingFormDesktop). */
const ListingFormShell = ({
  mode,
  step,
  onStep,
  formData,
  menu,
  footer,
  children,
}: {
  mode: "create" | "edit";
  step: number;
  onStep: (n: number) => void;
  formData: ListingFormData;
  menu?: MenuActions;
  footer: ReactNode;
  children: ReactNode;
}) => {
  const canJump = (n: number) => mode === "edit" || n <= step;
  const chip = menu ? STATUS_CHIP[menu.status] : null;
  const sums = summaries(formData);

  const menuItems = menu && (
    <>
      {menu.status === "published" && (
        <DropdownMenuItem onSelect={menu.onPause} className="flex-col items-start gap-0.5 py-2">
          <span className="font-semibold">Pause listing</span>
          <span className="max-w-[260px] text-xs text-muted-foreground">Hides your listing from Browse Sits. Your dates, applicants and confirmed sits stay as they are. Make it live again any time.</span>
        </DropdownMenuItem>
      )}
      {menu.status === "paused" && <DropdownMenuItem onSelect={menu.onResume}>Make listing live again</DropdownMenuItem>}
      <DropdownMenuItem asChild>
        <Link to={`/listing/${menu.listingId}`}>View listing</Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={menu.onDelete} className="font-semibold text-[var(--nn-danger-text)] focus:text-[var(--nn-danger-text)]">
        Delete listing
      </DropdownMenuItem>
    </>
  );

  return (
    <main className={cn(NN_PAGE, "flex flex-1 flex-col gap-5 pb-32 pt-20 md:pb-16 md:pt-24")}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <BackButton fallback="/dashboard" label="Dashboard" className="h-11" />
          {/* Phone and tablet: one ⋯ menu. */}
          {menu && (
            <div className="lg:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Listing actions" disabled={menu.busy} className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-border bg-card">
                    <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">{menuItems}</DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[32px] font-normal leading-tight lg:text-[38px]">
            {mode === "edit" ? "Edit your listing" : "Create your listing"}
          </h1>
          {chip && <StatusChip tone={chip.tone}>{chip.label}</StatusChip>}
          {menu && (
            <>
              {/* Desktop: the actions as buttons. */}
              <div className="ml-auto hidden items-center gap-2 lg:flex">
                {menu.status === "published" && (
                  <button type="button" onClick={menu.onPause} disabled={menu.busy} className={nnButton("secondary")}>
                    Pause listing
                  </button>
                )}
                {menu.status === "paused" && (
                  <button type="button" onClick={menu.onResume} disabled={menu.busy} className={nnButton("secondary")}>
                    Make listing live again
                  </button>
                )}
                <Link to={`/listing/${menu.listingId}`} className={nnButton("secondary")}>
                  View listing
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label="More listing actions" className={nnButton("secondary", "w-11 px-0")}>
                      <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">{menuItems}</DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Phone and tablet: segmented progress. */}
      <nav aria-label="Steps" className="grid grid-cols-4 gap-2 lg:hidden">
        {STEP_NAMES.map((name, i) => {
          const n = i + 1;
          const done = n < step || (mode === "edit" && n !== step);
          return (
            <button
              key={name}
              type="button"
              aria-current={n === step ? "step" : undefined}
              disabled={!canJump(n)}
              onClick={() => onStep(n)}
              className={cn("flex min-h-11 flex-col justify-end gap-1.5 text-left text-xs sm:text-sm", n === step ? "font-bold" : "font-semibold text-muted-foreground")}
            >
              {name}
              <span className={cn("block h-1.5 rounded-full", n === step ? "bg-[var(--nn-accent)]" : done ? "bg-[var(--nn-track)]" : "bg-muted")} />
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
        {/* Desktop: vertical stepper. */}
        <nav aria-label="Steps" className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-1">
          {STEP_NAMES.map((name, i) => {
            const n = i + 1;
            const done = n < step || (mode === "edit" && n !== step);
            return (
              <button
                key={name}
                type="button"
                aria-current={n === step ? "step" : undefined}
                disabled={!canJump(n)}
                onClick={() => onStep(n)}
                className={cn("flex min-h-[56px] items-center gap-3 rounded-2xl px-3 text-left", n === step ? "bg-[var(--nn-tint)]" : "hover:bg-muted")}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    n === step ? "bg-[var(--nn-accent)] text-primary-foreground" : done ? "bg-[var(--nn-ok-bg)] text-brand-teal-text" : "bg-muted text-muted-foreground",
                  )}
                >
                  {done && n !== step ? <Check className="h-4 w-4" aria-hidden="true" /> : n}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-bold">{name}</span>
                  <span className="truncate text-sm text-muted-foreground">{sums[i]}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          {children}
          {/* Tablet and desktop footer sits under the form. */}
          <div className="hidden md:block">{footer}</div>
        </div>

        <div className="hidden xl:sticky xl:top-24 xl:block">
          <PreviewCard formData={formData} />
        </div>
      </div>

      {/* Phone: the footer stays at the bottom. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:hidden">{footer}</div>
    </main>
  );
};

export default ListingFormShell;
