// All AWH stations are physically located in Arizona, which does not observe DST,
// so timestamps are always rendered in America/Phoenix regardless of the viewer's browser timezone.
export const PHOENIX_TIME_ZONE = 'America/Phoenix';

export function formatPhoenixTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PHOENIX_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatPhoenixShortDate(date: Date): string {
  const monthDay = new Intl.DateTimeFormat('en-US', {
    timeZone: PHOENIX_TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
  }).format(date);
  return `${monthDay} ${formatPhoenixTime(date)}`;
}

export function formatPhoenixMonthDayTime(date: Date): string {
  const monthDay = new Intl.DateTimeFormat('en-US', {
    timeZone: PHOENIX_TIME_ZONE,
    month: 'short',
    day: '2-digit',
  }).format(date);
  return `${monthDay}, ${formatPhoenixTime(date)}`;
}

export function formatPhoenixFullDateTime(date: Date): string {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: PHOENIX_TIME_ZONE, weekday: 'short' }).format(date);
  const monthDay = new Intl.DateTimeFormat('en-US', {
    timeZone: PHOENIX_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
  return `${weekday}, ${monthDay} ${formatPhoenixTime(date)}`;
}

// yyyy-mm-dd in Phoenix local time, for same-day comparisons independent of viewer timezone.
export function phoenixDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PHOENIX_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
