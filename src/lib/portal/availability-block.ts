/**
 * Pure date helpers for the availability-block editor (portal-calendar-panels).
 *
 * The availability grid renders a full Monday–Sunday week. A column's weekday
 * must always be derived from its real date — never from its position in the window.
 */

/** JS `getDay()` is 0=Sun..6=Sat; convert to a Monday-based index 0=Mon..6=Sun. */
export function mondayBasedDayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Resolve each selected Monday-based weekday (0=Mon..6=Sun) to the concrete date
 * it refers to.
 *
 * Prefers the actual date visible in the active block window, so a compact window
 * that starts mid-week (e.g. Wed–Sun) resolves the "Wed" column to its real date
 * rather than to `weekMonday + 2 days`. Weekdays not present in the window fall
 * back to the anchor week's Monday. For a full Mon–Sun week the window holds all
 * seven weekdays, so this is identical to `addDays(weekMonday, weekday)`.
 */
export function resolveBlockBaseDates(
  activeBlockDates: Date[],
  weekMonday: Date,
  blockWeekdays: number[],
): Date[] {
  const dateByWeekday = new Map<number, Date>();
  for (const d of activeBlockDates) dateByWeekday.set(mondayBasedDayIndex(d), d);
  return blockWeekdays.map((weekday) => dateByWeekday.get(weekday) ?? addDays(weekMonday, weekday));
}
