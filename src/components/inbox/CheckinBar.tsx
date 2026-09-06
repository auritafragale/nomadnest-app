import { useState } from "react";
import { Bone, Pill, Footprints, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckinKind } from "@/hooks/useSitCheckins";
import { CheckinSheet } from "./CheckinSheet";

interface CheckinBarProps {
  sitId: string;
  ownerUserId: string;
  listingId: string;
  requiresMeds: boolean;
  todayKinds: CheckinKind[];
  onPosted: () => void;
}

const ALL_KINDS: { kind: CheckinKind; label: string; Icon: typeof Bone }[] = [
  { kind: "pets_fed", label: "Fed", Icon: Bone },
  { kind: "walk_completed", label: "Walk", Icon: Footprints },
];

export const CheckinBar = ({
  sitId,
  ownerUserId,
  listingId,
  requiresMeds,
  todayKinds,
  onPosted,
}: CheckinBarProps) => {
  const [activeKind, setActiveKind] = useState<CheckinKind | null>(null);

  const kinds = requiresMeds
    ? [...ALL_KINDS, { kind: "meds_given" as CheckinKind, label: "Meds", Icon: Pill }]
    : ALL_KINDS;

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 overflow-x-auto">
        <span className="text-xs text-muted-foreground whitespace-nowrap mr-1">
          Today:
        </span>
        {kinds.map(({ kind, label, Icon }) => {
          const done = todayKinds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setActiveKind(kind)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                done
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-background text-foreground border-border hover:border-primary hover:bg-primary/5",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {done && <Check className="w-3 h-3" />}
            </button>
          );
        })}
      </div>

      {activeKind && (
        <CheckinSheet
          kind={activeKind}
          sitId={sitId}
          ownerUserId={ownerUserId}
          listingId={listingId}
          onClose={() => setActiveKind(null)}
          onPosted={() => {
            setActiveKind(null);
            onPosted();
          }}
        />
      )}
    </>
  );
};
