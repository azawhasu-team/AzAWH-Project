// Plain-text description of a chart's data, used as its accessible name so a
// screen-reader user gets the gist (span, range, latest value) that the
// drawing conveys visually.
import type { ChartDataPoint } from '@/types';

function fmt(v: number): string {
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return v.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function describeValues(values: number[], unit: string): string {
  const u = unit ? ` ${unit}` : '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const latest = values[values.length - 1];
  return `range ${fmt(min)} to ${fmt(max)}${u}, latest ${fmt(latest)}${u}`;
}

export function describeChart(
  title: string,
  data: ChartDataPoint[],
  units: { unit1?: string; unit2?: string; name2?: string } = {}
): string {
  const valid = data.filter(d => d.value != null);
  if (valid.length === 0) return `${title} chart. No data in the selected range.`;
  const first = valid[0].date.slice(0, 10);
  const last = valid[valid.length - 1].date.slice(0, 10);
  const parts = [
    `${title} chart, ${valid.length.toLocaleString('en-US')} point${valid.length === 1 ? '' : 's'} from ${first} to ${last}`,
    describeValues(valid.map(d => d.value as number), units.unit1 ?? ''),
  ];
  const second = data.filter(d => typeof d.value2 === 'number').map(d => d.value2 as number);
  if (second.length > 0) {
    parts.push(`${units.name2 ?? 'second series'}: ${describeValues(second, units.unit2 ?? '')}`);
  }
  return parts.join('. ') + '.';
}
