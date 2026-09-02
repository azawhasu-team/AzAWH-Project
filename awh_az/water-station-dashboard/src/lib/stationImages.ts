/**
 * Maps a live station_name to its real deployment photo.
 *
 * We have one photo per physical *setting* (power station, greenhouse, high-bay
 * lab), not one per station — several station_name variants share the same
 * physical location/unit (e.g. the three AquaPars name variants are all the
 * same power-station unit, renamed over time). Matching on setting keywords
 * covers every current station; new stations fall back to a generic photo
 * until a real one is captured.
 */
const STATION_IMAGE_RULES: { match: RegExp; src: string }[] = [
  { match: /greenhouse|polytech/i, src: '/dewstand.png' },
  { match: /highbay/i, src: '/testunit.png' },
  { match: /power\s*station|powerplant|power\s*plant/i, src: '/aquapars.png' },
];

export function getStationImage(stationName: string): string {
  const rule = STATION_IMAGE_RULES.find(r => r.match.test(stationName));
  return rule?.src ?? '/aquapars.png';
}
