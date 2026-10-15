/**
 * What happens after "Block" (and "Also report"), in order. Pure, so it can be
 * tested without a screen.
 *
 * Blocking refreshes lists, and each place has its own after-block action
 * (the profile goes back to the dashboard; City Chat and private chat
 * refresh, which can remove the very message or chat the sheet belongs to).
 * If "Also report" was ticked, the report sheet opens first, and the refresh
 * and the after-block action run only once it is closed or sent.
 */
export interface BlockFlowHooks {
  /** Refresh the lists a block changes. */
  refresh: () => void;
  /** The place's own after-block action (navigate, refresh). */
  onBlocked?: () => void;
  /** Open the report sheet. */
  openReport: () => void;
  /** The whole flow is over: the parent may unmount the sheets. */
  onFinished?: () => void;
}

export const createBlockFlow = (hooks: BlockFlowHooks) => {
  let reportPending = false;
  let done = false;
  const finish = (blocked: boolean) => {
    if (done) return;
    done = true;
    if (blocked) {
      hooks.refresh();
      hooks.onBlocked?.();
    }
    hooks.onFinished?.();
  };
  return {
    /** The block went through. */
    blocked(alsoReport: boolean) {
      if (alsoReport) {
        reportPending = true;
        hooks.openReport();
      } else {
        finish(true);
      }
    },
    /** The report sheet was closed, or the report was sent. */
    reportClosed() {
      if (!reportPending) return;
      reportPending = false;
      finish(true);
    },
    /** The block sheet was closed without blocking. */
    cancelled() {
      if (reportPending) return;
      finish(false);
    },
    get waitingForReport() {
      return reportPending;
    },
  };
};
