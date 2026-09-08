import { createContext, useCallback, useContext, useMemo, useState } from "react";
import ReportDialog from "@/components/reports/ReportDialog";
import { Database } from "@/integrations/supabase/types";

type ReportTargetType = Database["public"]["Enums"]["report_target_type"];

export interface ReportTarget {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
}

interface ReportContextValue {
  openReport: (target: ReportTarget) => void;
}

const ReportContext = createContext<ReportContextValue>({ openReport: () => {} });

export const useReport = () => useContext(ReportContext);

/**
 * Mounts a single report dialog at the top of the app so its state (including a
 * selected proof file) can never be discarded by a re-render or refetch in the
 * screen that opened it. Chat screens refresh themselves in the background,
 * which previously unmounted an inline dialog while the native file picker was
 * open and silently dropped the picked file.
 */
export const ReportProvider = ({ children }: { children: React.ReactNode }) => {
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const [open, setOpen] = useState(false);

  const openReport = useCallback((next: ReportTarget) => {
    setTarget(next);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ openReport }), [openReport]);

  return (
    <ReportContext.Provider value={value}>
      {children}
      {target && (
        <ReportDialog
          key={`${target.targetType}:${target.targetId}`}
          targetType={target.targetType}
          targetId={target.targetId}
          targetLabel={target.targetLabel}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </ReportContext.Provider>
  );
};
