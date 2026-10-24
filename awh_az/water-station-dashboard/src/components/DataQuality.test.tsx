// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { DailyQuality } from '@/lib/api-client';

const h = vi.hoisted(() => ({ result: { data: undefined as unknown, isLoading: false, isError: false } }));
vi.mock('@/hooks/queries', () => ({ useStationQuality: () => h.result }));

import DataQualityBadge from './DataQualityBadge';
import DataQualityPanel from './DataQualityPanel';

const day = (date: string, over: Partial<DailyQuality> = {}): DailyQuality => ({
  date, score: 96, label: 'good', coverage_pct: 100, hours_with_data: 24, expected_hours: 24, issues: [], ...over,
});
const NOW = Date.parse('2026-10-22T20:00:00Z');
const recent = new Date(NOW - 3600_000).toISOString();

afterEach(() => {
  cleanup();
  h.result = { data: undefined, isLoading: false, isError: false };
});

describe('DataQualityBadge', () => {
  it('shows the latest complete day score with an accessible label', () => {
    h.result.data = { station_name: 's', calibrations: [], days: [day('2026-10-21', { score: 72, label: 'fair' }), day('2026-10-22', { score: 100 })] };
    render(<DataQualityBadge stationName="s" lastReading={recent} nowMs={NOW} />);
    expect(screen.getByLabelText('Data quality 72 out of 100, fair')).toBeTruthy();
  });

  it('renders nothing for a station that has not reported in a week', () => {
    h.result.data = { station_name: 's', calibrations: [], days: [day('2026-10-21')] };
    const old = new Date(NOW - 30 * 24 * 3600_000).toISOString();
    const { container } = render(<DataQualityBadge stationName="s" lastReading={old} nowMs={NOW} />);
    expect(container.textContent).toBe('');
  });

  it('renders nothing while there is no data', () => {
    const { container } = render(<DataQualityBadge stationName="s" lastReading={recent} nowMs={NOW} />);
    expect(container.textContent).toBe('');
  });
});

describe('DataQualityPanel', () => {
  it('lists days, the latest problem and recalibrations', () => {
    h.result.data = {
      station_name: 's',
      calibrations: [{ id: 'c1', station_name: 's', date: '2026-10-20', sensor: 'balance' }],
      days: [
        day('2026-10-19'),
        day('2026-10-20', { score: 40, label: 'poor', coverage_pct: 50, hours_with_data: 12, issues: [{ sensor: 'intake humidity', kind: 'frozen', detail: 'constant 40 for 12 hours' }] }),
        day('2026-10-21'),
      ],
    };
    render(<DataQualityPanel stationName="s" />);
    expect(screen.getByLabelText('2026-10-20: quality 40 out of 100, poor')).toBeTruthy();
    expect(screen.getByText(/Latest problem day, 2026-10-20/)).toBeTruthy();
    expect(screen.getByText(/intake humidity: frozen/)).toBeTruthy();
    expect(screen.getByText('2026-10-20 · balance')).toBeTruthy();
  });

  it('says so when everything is fine, and stays silent on errors or no data', () => {
    h.result.data = { station_name: 's', calibrations: [], days: [day('2026-10-21')] };
    const { unmount } = render(<DataQualityPanel stationName="s" />);
    expect(screen.getByText('No data-quality problems in this period.')).toBeTruthy();
    unmount();
    h.result = { data: undefined, isLoading: false, isError: true };
    const { container } = render(<DataQualityPanel stationName="s" />);
    expect(container.textContent).toBe('');
  });
});
