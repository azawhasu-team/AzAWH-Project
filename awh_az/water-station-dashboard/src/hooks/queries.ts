import { useCallback, useState } from 'react';
import { useQuery, useQueries, keepPreviousData, type UseQueryResult } from '@tanstack/react-query';
import {
  apiClient,
  type HourlyAggregationResponse,
  type HourlyDataRow,
} from '@/lib/api-client';

export const queryKeys = {
  stations: ['stations'] as const,
  impact: ['impact'] as const,
};

/** All stations, unfiltered. Shared cache across the overview, list, detail and compare pages. */
export function useStations() {
  return useQuery({
    queryKey: queryKeys.stations,
    queryFn: () => apiClient.getStations(),
    staleTime: 5 * 60_000,
  });
}

/** Lifetime water-harvested totals. Non-critical: callers should tolerate it failing. */
export function useImpact() {
  return useQuery({
    queryKey: queryKeys.impact,
    queryFn: () => apiClient.getImpact(),
    staleTime: 5 * 60_000,
  });
}

/**
 * Most recent reading for a station, polled every 30s — independent of the
 * date-range chart data — so a field engineer can watch it advance and confirm
 * the station is actively uploading. Matches the station's own upload cadence.
 * Polling pauses while the tab is hidden.
 */
export function useLiveReading(stationName: string | null) {
  return useQuery({
    queryKey: ['live-reading', stationName],
    queryFn: () => apiClient.getStationReadings(stationName!, { limit: 1 }),
    enabled: !!stationName,
    refetchInterval: 30_000,
    staleTime: 0,
    select: resp => resp.data[0] ?? null,
  });
}

/**
 * The most recent 1,000 readings — a fast first paint while the (much larger)
 * full date range loads behind it. Small and quick even on the Firestore-backed
 * production API, unlike the multi-page range fetch.
 */
export function useLatestReadings(stationName: string | null) {
  return useQuery({
    queryKey: ['readings-latest', stationName],
    queryFn: () => apiClient.getStationReadings(stationName!, { limit: 1000 }),
    enabled: !!stationName,
    select: resp => resp.data,
  });
}

/**
 * Every reading for a station in [start, end], paged through getAllStationReadings.
 * The range is part of the query key, so changing it fetches the new range while
 * the previous data stays available, and revisiting a range is served from cache.
 * `progress` is the running row count of the fetch in flight.
 */
export function useStationReadingsRange(
  stationName: string | null,
  start: Date | null,
  end: Date | null
) {
  const [progress, setProgress] = useState(0);
  const startISO = start?.toISOString();
  const endISO = end?.toISOString();
  const query = useQuery({
    queryKey: ['readings', stationName, startISO, endISO],
    queryFn: () => {
      setProgress(0);
      return apiClient.getAllStationReadings(
        stationName!,
        { start_date: startISO, end_date: endISO },
        { onProgress: setProgress }
      );
    },
    enabled: !!stationName && !!startISO && !!endISO,
    placeholderData: keepPreviousData,
    retry: 1, // a failed attempt can already have run for up to 90s
  });
  return { query, progress };
}

/**
 * Shared by every hourly query so the station page and the compare page hit
 * the same cache entry for the same station and range. The backend answers 404
 * when a station has no readings in range, which is a normal outcome (a
 * long-inactive station), so it is returned as an empty result, not an error.
 */
function hourlyQueryOptions(stationName: string | null, startISO?: string, endISO?: string) {
  return {
    queryKey: ['hourly', stationName, startISO, endISO] as const,
    queryFn: async (): Promise<HourlyAggregationResponse> => {
      try {
        return await apiClient.getHourlyAggregation(stationName!, {
          start_date: startISO,
          end_date: endISO,
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('HTTP 404')) {
          return {
            station_name: stationName!,
            start_date: startISO ?? null,
            end_date: endISO ?? null,
            total_hours: 0,
            data: [],
          };
        }
        throw err;
      }
    },
    retry: 1,
  };
}

/** Hourly aggregates (water, energy, efficiency) for [start, end]. */
export function useHourly(stationName: string | null, start: Date | null, end: Date | null) {
  const startISO = start?.toISOString();
  const endISO = end?.toISOString();
  return useQuery({
    ...hourlyQueryOptions(stationName, startISO, endISO),
    enabled: !!stationName && !!startISO && !!endISO,
    placeholderData: keepPreviousData,
    select: resp => resp.data ?? [],
  });
}

export interface HourlyRequest {
  /** Key the result is filed under (a station name, a month key…). */
  key: string;
  stationName: string;
  start?: string;
  end?: string;
}

/**
 * One hourly query per request, fetched in parallel and cached individually,
 * so changing one station's range doesn't refetch the others. A request that
 * fails is filed as an empty result; `error` is set only if every request
 * failed (i.e. the backend itself is unreachable).
 */
export function useHourlyMany(requests: HourlyRequest[], enabled = true) {
  const keysSig = requests.map(r => r.key).join('\u0000');
  const combine = useCallback(
    (results: UseQueryResult<HourlyAggregationResponse>[]) => {
      const keys = keysSig ? keysSig.split('\u0000') : [];
      const byKey: Record<string, HourlyDataRow[]> = {};
      results.forEach((res, i) => {
        byKey[keys[i]] = res.data?.data ?? [];
      });
      const failed = results.filter(r => r.isError);
      return {
        byKey,
        isLoading: results.some(r => r.isLoading),
        isFetching: results.some(r => r.isFetching),
        error:
          results.length > 0 && failed.length === results.length
            ? (failed[0].error as Error).message
            : null,
      };
    },
    [keysSig]
  );
  return useQueries({
    queries: requests.map(r => ({
      ...hourlyQueryOptions(r.stationName, r.start, r.end),
      enabled,
    })),
    combine,
  });
}
