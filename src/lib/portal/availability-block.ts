/**
 * Pure date helpers for the availability-block editor (portal-calendar-panels).
 *
 * Shared by admin, manager, and vendor schedule surfaces. The availability grid
 * always renders a full Monday–Sunday week. A column's weekday must always be
 * derived from its real date — never from its position in the window.
 */

/** Every portal availability week is Mon–Sun (admin, manager, vendor). */
export const AVAILABILITY_WEEK_DAY_COUNT = 7;

/** JS `getDay()` is 0=Sun..6=Sat; convert to a Monday-based index 0=Mon..6=Sun. */
export function mondayBasedDayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

/** Build the seven noon-anchored dates for the week that starts on `weekMonday`. */
export function buildMondayWeekDates(weekMonday: Date): Date[] {
  return Array.from({ length: AVAILABILITY_WEEK_DAY_COUNT }, (_, dayOffset) => addDays(weekMonday, dayOffset));
}

/**
 * Resolve each selected Monday-based weekday (0=Mon..6=Sun) to the concrete date
 * it refers to within the active Mon–Sun week window.
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
