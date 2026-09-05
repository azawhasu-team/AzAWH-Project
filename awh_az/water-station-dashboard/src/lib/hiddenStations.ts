/**
 * Stations hidden from the website's public pages. Hiding is done from the
 * admin panel (/admin/stations), which sets a `hidden` flag on the station's
 * own Firestore doc — it never touches readings, Postgres, or the ingestion
 * pipeline, so historical data is untouched either way.
 */
export function filterVisibleStations<T extends { hidden?: boolean }>(stations: T[]): T[] {
  return stations.filter((s) => !s.hidden);
}
