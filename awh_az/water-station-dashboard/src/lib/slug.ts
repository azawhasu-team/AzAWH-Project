// Turns a station's display name (or its raw station_name, as a fallback)
// into a URL-friendly slug, e.g. "Cooling Tower Unit 1" -> "cooling-tower-unit-1".
// Used so /stations/[id] links read as the station's name instead of its raw
// Firestore station_name (which contains spaces, #, @, commas).
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
