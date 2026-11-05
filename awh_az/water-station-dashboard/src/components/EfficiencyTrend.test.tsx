// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { EfficiencyDailyResponse } from '@/lib/api-client';

const h = vi.hoisted(() => ({ result: {} as { isLoading?: boolean; isError?: boolean; data?: EfficiencyDailyResponse } }));
vi.mock('@/hooks/queries', () => ({ useEfficiencyDaily: () => h.result }));

import EfficiencyTrend from './EfficiencyTrend';

afterEach(cleanup);

const response = (over: Partial<EfficiencyDailyResponse> = {}): EfficiencyDailyResponse => ({
  days: 30, warming: false, updated_at: '2026-11-05T20:00:00Z',
  stations: [{
    station_name: 's1', display_name: 'Field Testbed', latest: 0.7254, latest_date: '2026-11-04', baseline: 0.9492, change_pct: -23.6,
    days: [
      { date: '2026-11-03', energy_kWh: 19.4, water_L: 28.3, kwh_per_L: 0.6869, hours: 24, complete: true },
      { date: '2026-11-04', energy_kWh: 19.4, water_L: 26.7, kwh_per_L: 0.7254, hours: 24, complete: true },
    ],
  }],
  ...over,
});

describe('EfficiencyTrend', () => {
  it('shows each station\'s latest value, how it compares, and a chart summary', () => {
    h.result = { data: response() };
    render(<EfficiencyTrend />);
    expect(screen.getByText('0.73 kWh/L')).toBeTruthy();
    expect(screen.getByText(/24% less energy per litre/)).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Field Testbed: 0.73 kWh per litre on 2026-11-04');
  });

  it('says it is calculating while the backend warms up, and hides when there is nothing to show', () => {
    h.result = { data: response({ warming: true, stations: [] }) };
    const { unmount } = render(<EfficiencyTrend />);
    expect(screen.getByText(/Calculating/)).toBeTruthy();
    unmount();
    h.result = { data: response({ stations: [] }) };
    const { container } = render(<EfficiencyTrend />);
    expect(container.textContent).toBe('');
  });

  it('renders nothing on error', () => {
    h.result = { isError: true };
    const { container } = render(<EfficiencyTrend />);
    expect(container.textContent).toBe('');
  });
});
