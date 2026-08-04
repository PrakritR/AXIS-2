/**
 * Does a Google Calendar event mean the manager is unavailable for a tour?
 *
 * ONE predicate, deliberately in a dependency-free module, because two surfaces
 * have to agree about it: the public booking grid
 * (`/api/public/property-tour-availability`, which subtracts busy time from what
 * a prospect is offered) and the manager's own calendar
 * (`googleCalendarEventsToMeetings` → the "N open" day headers and week badge).
 * When only one side filtered, a declined invite at 2pm vanished from the
 * manager's remaining-capacity count while the public page still sold 2pm.
 *
 * The rules, in order:
 *
 * - **Declined never blocks.** An invite the manager declined is a meeting they
 *   are not attending.
 * - **All-day always blocks**, even when Google reports it Free — Google
 *   Calendar defaults all-day entries to Free, so honouring transparency first
 *   would quietly un-block every trip and holiday. An all-day entry usually does
 *   mean away; over-blocking a day costs an unsold slot, under-blocking it sends
 *   a prospect to an empty house.
 * - **Free ("transparent") does not block.** That is the manager explicitly
 *   marking the time available.
 */
export function googleEventBlocksTours(event: {
  transparency?: string;
  declinedBySelf?: boolean;
  allDay?: boolean;
}): boolean {
  if (event.declinedBySelf) return false;
  if (event.allDay) return true;
  if (event.transparency === "transparent") return false;
  return true;
}
