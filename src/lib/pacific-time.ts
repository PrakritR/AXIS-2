const PACIFIC_TIME_ZONE = "America/Los_Angeles";

export function formatPacificDate(date: Date | string | number, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    ...options,
  }).format(new Date(date));
}

export function formatPacificDateTime(date: Date | string | number): string {
  return formatPacificDate(date, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
