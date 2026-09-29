/**
 * Layout of both dashboards.
 *
 * - Phone (below md): one column, profile block first (unchanged).
 * - Tablet (md): one wide column. The profile block is a two-column grid
 *   (profile card across the top, Finish your profile beside the mode
 *   switch); the main cards are a two-column grid where wide cards span both
 *   columns (md:col-span-2) and pairs such as To do / My applications sit
 *   side by side.
 * - Desktop (lg): the profile column on the left (336px, 360px from xl) and
 *   the main cards on the right.
 */
export const DashboardColumns = ({ aside, children }: { aside: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-[336px_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[360px_minmax(0,1fr)] xl:gap-7">
    <div className="flex min-w-0 flex-col gap-[18px] md:grid md:grid-cols-[minmax(0,1fr)_300px] md:items-center md:gap-4 lg:flex lg:items-stretch">
      {aside}
    </div>
    <div className="flex min-w-0 flex-col gap-[18px] md:grid md:grid-cols-2 md:items-start md:gap-4 lg:gap-5">{children}</div>
  </div>
);
