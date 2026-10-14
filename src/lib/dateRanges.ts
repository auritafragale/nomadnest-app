export interface DateRange {
  start_date: string;
  end_date: string;
}

/** Two ranges share at least one day (both ends inclusive). ISO dates compare as strings. */
export const rangesOverlap = (a: DateRange, b: DateRange) => a.start_date <= b.end_date && b.start_date <= a.end_date;

/** The open ranges a Nomad can still apply for: none that overlaps one of their confirmed sits. */
export const otherOpenDates = <T extends DateRange>(open: T[], confirmed: DateRange[]) =>
  open.filter((d) => !confirmed.some((c) => rangesOverlap(d, c)));
