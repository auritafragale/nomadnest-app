import { Link, useLocation } from "react-router-dom";
import { Camera } from "lucide-react";
import { StatusChip } from "@/components/nn/ui";
import { useArrivalPhotoCount } from "@/hooks/useArrivalVault";
import { arrivalWindowOpen } from "@/lib/sitTiming";
import { cn } from "@/lib/utils";

/**
 * "Arrival Check-In" for the Nomad, from the day before the sit starts until
 * two days after: "To do" until a photo is saved, then the photo count. Only
 * the Nomad can read the count; the Pet Parent is never told.
 */
export const ArrivalCheckInRow = ({
  sitId,
  startDate,
  className,
}: {
  sitId: string;
  startDate: string | null | undefined;
  className?: string;
}) => {
  const location = useLocation();
  const open = arrivalWindowOpen(startDate);
  const { data: photos = 0 } = useArrivalPhotoCount(sitId, open);
  if (!open) return null;
  return (
    <Link
      to={`/sits/${sitId}/arrival-vault`}
      state={{ from: `${location.pathname}${location.search}` }}
      className={cn("flex min-h-[56px] items-center gap-3 rounded-2xl border border-[var(--nn-border)] bg-card px-3.5 py-3", className)}
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]">
        <Camera className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold">Arrival Check-In</span>
        <span className="text-xs text-muted-foreground">Photograph the home as you found it. Only you can see these.</span>
      </span>
      <StatusChip tone={photos > 0 ? "green" : "accent"}>
        {photos > 0 ? `${photos} ${photos === 1 ? "photo" : "photos"} saved` : "To do"}
      </StatusChip>
    </Link>
  );
};
