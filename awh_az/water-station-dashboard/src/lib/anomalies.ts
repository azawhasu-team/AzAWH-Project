// Model-flagged "unusual activity" windows, exported in batch by
// research_extension/phase3_agents/export_anomalies.py to public/anomalies.json.
// Pure helpers only; the fetch lives in hooks/queries.ts.

export interface AnomalyInterval {
  start: string;
  end: string;
  /** The monitored parameter the model blames most for this interval. */
  parameter: string;
  /** Peak detection score across the interval's windows, 0–1. */
  score: number;
  windows: number;
  /** Plain-language description computed from the raw readings, e.g. "Water weight fell from 8.7 kg to 4.3 kg". */
  summary?: string;
}

export interface AnomalyFile {
  generated_at: string;
  days_scored: number;
  model: string;
  note: string;
  stations: Record<string, AnomalyInterval[]>;
  /** Stations left out on purpose, with the reason. */
  suppressed: Record<string, string>;
}

/**
 * The model monitors four parameters. Each maps to the chart fields that show
 * (or are derived from) that parameter, so a band can be drawn strongly on the
 * chart it is about and faintly on the others.
 */
const PARAMETER_CHART_FIELDS: Record<string, string[]> = {
  temperature: ['temperature'],
  humidity: ['humidity', 'abs_humidity_intake'],
  weight: ['weight', 'accumulated_water_L', 'incremental_water_g'],
  power: ['power', 'energy', 'incremental_energy_kWh'],
};

export function parameterMatchesField(parameter: string, field: string): boolean {
  return PARAMETER_CHART_FIELDS[parameter]?.includes(field) ?? false;
}

export interface AnomalyBand {
  startMs: number;
  endMs: number;
  parameter: string;
  score: number;
  /** 1-based number of this event in the station's list for the visible range. */
  eventNumber: number;
}

/** Intervals overlapping [rangeStart, rangeEnd], in time order. Numbering of events is by position in this list. */
export function intervalsInRange(
  intervals: AnomalyInterval[],
  rangeStartMs: number,
  rangeEndMs: number
): AnomalyInterval[] {
  return intervals
    .filter(iv => new Date(iv.end).getTime() >= rangeStartMs && new Date(iv.start).getTime() <= rangeEndMs)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/**
 * Bands to shade on ONE chart: only events about the parameter that chart shows.
 * Shading every chart for every event was redundant where the line already
 * visibly moves and confusing where it doesn't; the numbered events list
 * covers the cross-parameter context instead.
 */
export function bandsForChart(
  intervals: AnomalyInterval[],
  field: string,
  rangeStartMs: number,
  rangeEndMs: number
): AnomalyBand[] {
  return intervalsInRange(intervals, rangeStartMs, rangeEndMs).flatMap((iv, i) =>
    parameterMatchesField(iv.parameter, field)
      ? [{
          startMs: new Date(iv.start).getTime(),
          endMs: new Date(iv.end).getTime(),
          parameter: iv.parameter,
          score: iv.score,
          eventNumber: i + 1,
        }]
      : []
  );
}

/**
 * Charts use a categorical x-axis, so a shaded band must start and end on dates
 * that actually exist in the plotted data. Snap [startMs, endMs] to the first
 * and last plotted point inside it; a band shorter than the point spacing
 * collapses onto the nearest point. Returns null if it lies outside the data.
 */
export function snapBandToDates(
  dates: string[],
  startMs: number,
  endMs: number
): { x1: string; x2: string } | null {
  if (dates.length === 0) return null;
  const times = dates.map(d => new Date(d).getTime());
  if (endMs < times[0] || startMs > times[times.length - 1]) return null;

  let first = times.findIndex(t => t >= startMs);
  let last = -1;
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i] <= endMs) {
      last = i;
      break;
    }
  }
  if (first === -1) first = times.length - 1;
  if (last === -1) last = 0;
  if (first > last) {
    // Falls between two plotted points: use whichever is closer to its middle.
    const mid = (startMs + endMs) / 2;
    const nearest = Math.abs(times[first] - mid) < Math.abs(times[last] - mid) ? first : last;
    first = last = nearest;
  }
  return { x1: dates[first], x2: dates[last] };
}
