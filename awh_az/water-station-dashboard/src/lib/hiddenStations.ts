/**
 * Stations hidden from the website while they're being re-set-up.
 *
 * This only filters what the frontend lists — it never touches Firestore,
 * Postgres, or the ingestion pipeline, so historical data for these stations
 * is untouched and the backend keeps ingesting for them normally.
 *
 * To unhide a station: delete (or comment out) its entry below and redeploy.
 */
export const HIDDEN_STATION_NAMES: string[] = [
  'station_Dewstand @ GreenHouse, Polytech',
  'station_Dewstand@GreenHouse_Polytechnic',
  'station_T50@Power Station',
  'station_T50@PowerPlant',
];

export function isStationHidden(stationName: string): boolean {
  return HIDDEN_STATION_NAMES.includes(stationName);
}

export function filterVisibleStations<T extends { station_name: string }>(stations: T[]): T[] {
  return stations.filter((s) => !isStationHidden(s.station_name));
}
