// Shared fixtures for page smoke tests.
export const nowIso = () => new Date().toISOString();

export const makeStation = (over: Record<string, unknown> = {}) => ({
  station_name: 'station_testbed_1@Powerplant',
  display_name: 'Testbed 1',
  unit: 'm/s',
  location: 'ASU Polytechnic',
  status: 'active',
  description: 'Test station',
  metadata: {
    station_name: 'station_testbed_1@Powerplant',
    available_fields: ['temperature', 'power', 'energy'],
    last_reading: nowIso(),
  },
  ...over,
});

/** `count` readings, one per minute ending now, newest first (as the API returns them). */
export const makeReadings = (count: number, energyPerMinute: number) =>
  Array.from({ length: count }, (_, i) => {
    const minutesAgo = i;
    return {
      station_name: 'station_testbed_1@Powerplant',
      timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      temperature: 28,
      power: 900 + (i % 7) * 12, // a real meter wobbles; a constant value would read as stuck
      energy: 100 + (count - i) * energyPerMinute,
    };
  });
