/**
 * API Client for AWH Station Monitoring Backend
 * Handles all HTTP requests to FastAPI server with type safety
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface StationReading {
  station_name: string;
  timestamp: string;
  unit?: string | null;
  temperature?: number | null;
  humidity?: number | null;
  velocity?: number | null;
  outtake_unit?: string | null;
  outtake_humidity?: number | null;
  outtake_velocity?: number | null;
  outtake_temperature?: number | null;
  flow_lmin?: number | null;
  flow_hz?: number | null;
  flow_total?: number | null;
  weight?: number | null;
  power?: number | null;
  voltage?: number | null;
  current?: number | null;
  energy?: number | null;
  pump_status?: number | string | null;
}

export interface StationMetadata {
  station_name: string;
  available_fields: string[];
  field_groups: Record<string, string[]>;
  last_reading?: string | null;
  total_readings: number;
  units?: Record<string, string>;
}

export interface StationInfo {
  station_name: string;
  unit: string;
  location?: string | null;
  status: string;
  metadata: StationMetadata;
  display_name?: string | null;
  description?: string | null;
  image_url?: string | null;
  hidden?: boolean;
}

export interface ReadingsResponse {
  data: StationReading[];
  total: number;
  limit: number;
  offset: number;
  metadata?: StationMetadata;
}

export interface ReadingsQueryParams {
  start_date?: string;
  end_date?: string;
  fields?: string[];
  limit?: number;
  offset?: number;
}

export interface BulkExportRequest {
  station_names?: string[];
  start_date?: string;
  end_date?: string;
  fields?: string[];
  format: 'csv' | 'json' | 'parquet';
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  services: Record<string, string>;
}

export interface StationImpact {
  station_name: string;
  location?: string | null;
  total_liters: number;
  readings_processed: number;
  updated_at?: string | null;
  hidden?: boolean;
}

export interface ImpactResponse {
  total_liters: number;
  stations: StationImpact[];
  updated_at?: string | null;
}

class APIClient {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  /**
   * Generic fetch wrapper with error handling. `timeoutMs`, when given, hard-aborts
   * the request via AbortController — some backend queries here (wide-date-range
   * Firestore reads) can otherwise hang far longer than any reasonable UI wait.
   */
  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs?: number
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const controller = timeoutMs ? new AbortController() : undefined;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller?.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      if (error instanceof Error) {
        throw new Error(`API Error: ${error.message}`);
      }
      throw new Error('Unknown API error occurred');
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /**
   * Real-world cumulative water-harvested totals across all stations
   */
  async getImpact(): Promise<ImpactResponse> {
    return this.fetch<ImpactResponse>('/impact');
  }

  /**
   * Health check
   */
  async health(): Promise<HealthResponse> {
    return this.fetch<HealthResponse>('/health');
  }

  /**
   * Get all stations with metadata
   */
  async getStations(): Promise<StationInfo[]> {
    return this.fetch<StationInfo[]>('/stations');
  }

  /**
   * Get readings for a specific station
   */
  async getStationReadings(
    stationName: string,
    params?: ReadingsQueryParams,
    timeoutMs?: number
  ): Promise<ReadingsResponse> {
    const queryParams = new URLSearchParams();

    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);
    if (params?.fields?.length) queryParams.append('fields', params.fields.join(','));
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const query = queryParams.toString();
    const endpoint = `/stations/${encodeURIComponent(stationName)}/readings${query ? `?${query}` : ''}`;

    return this.fetch<ReadingsResponse>(endpoint, {}, timeoutMs);
  }

  /**
   * Get ALL readings for a station across a date range, paginating past the
   * backend's single-page cap (10,000 rows — which for a busy station can be
   * under two days of data) until the full range is covered, `maxRows` is
   * hit, or `maxDurationMs` elapses. A single getStationReadings() call
   * silently truncates to the first page; callers that need to plot or
   * export a complete range should use this instead.
   *
   * Pages advance by a `start_date` cursor (last reading's timestamp + 1ms)
   * rather than `offset` — Firestore's offset pagination re-skips-and-discards
   * every prior document on every page, so a deep page can be far slower than
   * a shallow one. Requires `params.start_date` to be set (ASCENDING order);
   * without it, only a single page is fetched.
   *
   * Each individual page can itself take 30-90s+ on this backend (Firestore
   * streams 10,000 docs one at a time — that's the real bottleneck, not the
   * pagination strategy), and can occasionally run far longer under load.
   * `maxDurationMs` bounds total wait *between* completed pages, but that
   * alone can't help if a single page — including the first — just hangs;
   * `pageTimeoutMs` hard-aborts any individual page that takes too long.
   * If that happens after some data has already been gathered, what's been
   * loaded so far is kept (marked truncated) rather than thrown away; if it
   * happens on the very first page, the error is surfaced to the caller
   * instead of returning a misleading empty result.
   */
  async getAllStationReadings(
    stationName: string,
    params?: Omit<ReadingsQueryParams, 'offset'>,
    options?: {
      maxRows?: number;
      maxDurationMs?: number;
      pageTimeoutMs?: number;
      onProgress?: (rowsSoFar: number) => void;
    }
  ): Promise<{ data: StationReading[]; truncated: boolean }> {
    const maxRows = options?.maxRows ?? 50000;
    const maxDurationMs = options?.maxDurationMs ?? 90000;
    const pageTimeoutMs = options?.pageTimeoutMs ?? 120000;
    const pageSize = params?.limit && params.limit < 10000 ? params.limit : 10000;
    const startedAt = Date.now();
    const all: StationReading[] = [];
    let truncated = false;
    let cursorStartDate = params?.start_date;

    while (true) {
      let page: ReadingsResponse;
      try {
        page = await this.getStationReadings(
          stationName,
          { ...params, start_date: cursorStartDate, limit: pageSize },
          pageTimeoutMs
        );
      } catch (err) {
        if (all.length > 0) {
          // Already have some data — treat a stuck/failed later page like hitting
          // the cap rather than discarding everything already loaded.
          truncated = true;
          break;
        }
        throw err; // nothing loaded yet — let the caller show a real error
      }
      all.push(...page.data);
      options?.onProgress?.(all.length);

      if (page.data.length < pageSize) break; // last page — full range covered
      if (all.length >= maxRows || Date.now() - startedAt >= maxDurationMs || !cursorStartDate) {
        truncated = true; // page was full, so more data likely remains beyond this cap
        break;
      }

      const lastTs = new Date(page.data[page.data.length - 1].timestamp);
      lastTs.setMilliseconds(lastTs.getMilliseconds() + 1);
      cursorStartDate = lastTs.toISOString();
    }

    return { data: all, truncated };
  }

  /**
   * Export data as CSV, JSON, or Parquet
   */
  async exportData(request: BulkExportRequest): Promise<Blob> {
    const url = `${this.baseURL}/export`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return await response.blob();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Export Error: ${error.message}`);
      }
      throw new Error('Unknown export error occurred');
    }
  }

  /**
   * Download exported data as file
   */
  async downloadExport(request: BulkExportRequest, filename?: string): Promise<void> {
    const blob = await this.exportData(request);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `station_data_${Date.now()}.${request.format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  /**
   * Get hourly aggregated data for a station
   */
  async getHourlyAggregation(
    stationName: string,
    params?: { start_date?: string; end_date?: string }
  ): Promise<HourlyAggregationResponse> {
    const queryParams = new URLSearchParams();
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);

    const query = queryParams.toString();
    const endpoint = `/stations/${encodeURIComponent(stationName)}/hourly${query ? `?${query}` : ''}`;

    return this.fetch<HourlyAggregationResponse>(endpoint);
  }
}

export interface HourlyDataRow {
  hour: string;
  reading_count: number;
  temperature_mean: number | null;
  temperature_std: number | null;
  humidity_mean: number | null;
  humidity_std: number | null;
  velocity_mean: number | null;
  velocity_std: number | null;
  outtake_temperature_mean: number | null;
  outtake_temperature_std: number | null;
  outtake_humidity_mean: number | null;
  outtake_humidity_std: number | null;
  outtake_velocity_mean: number | null;
  outtake_velocity_std: number | null;
  power_mean: number | null;
  power_std: number | null;
  current_mean: number | null;
  current_std: number | null;
  voltage_mean: number | null;
  voltage_std: number | null;
  abs_humidity_intake_mean: number | null;
  abs_humidity_intake_std: number | null;
  abs_humidity_outtake_mean: number | null;
  abs_humidity_outtake_std: number | null;
  water_produced_g: number | null;
  water_produced_L: number | null;
  energy_consumed_kWh: number | null;
  energy_per_liter_kWh_L: number | null;
  intake_available_water_g_hourly?: number | null;
  water_captured_g_hourly?: number | null;
  harvesting_efficiency_pct_hourly?: number | null;
}

export interface HourlyAggregationResponse {
  station_name: string;
  start_date: string | null;
  end_date: string | null;
  total_hours: number;
  data: HourlyDataRow[];
}

// Export singleton instance
export const apiClient = new APIClient();

// Export class for custom instances
export default APIClient;
