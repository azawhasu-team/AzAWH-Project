// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { makeStation } from '@/test/mocks';

// Hours as the backend returns them: a power meter present (power_mean set) and
// energy_consumed_kWh null means the backend judged that hour "station off".
const hourRow = (i: number, on: boolean) => ({
  hour: new Date(Date.now() - (24 - i) * 3600_000).toISOString(),
  reading_count: 100,
  power_mean: on ? 900 : 4,
  water_produced_L: on ? 1.2 : null,
  energy_consumed_kWh: on ? 1.1 : null,
  energy_per_liter_kWh_L: on ? 0.9 : null,
  harvesting_efficiency_pct_hourly: on ? 14 : null,
});

const h = vi.hoisted(() => ({
  stations: { data: [] as unknown[], isLoading: false, error: null as null | Error },
  rows: {} as Record<string, unknown[]>,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks/useFreshnessClock', () => ({ useFreshnessClock: () => Date.now() }));
vi.mock('@/hooks/queries', () => ({
  useStations: () => h.stations,
  useHourlyMany: () => ({ byKey: h.rows, isLoading: false, isFetching: false, error: null }),
}));

import ComparePage from './page';

afterEach(cleanup);

describe('compare page', () => {
  it('marks a reporting-but-off station and withholds its latest efficiency and energy', async () => {
    const running = makeStation({ station_name: 'run', display_name: 'Running Unit' });
    const idle = makeStation({ station_name: 'idle', display_name: 'Idle Unit' });
    h.stations = { data: [running, idle], isLoading: false, error: null };
    h.rows = {
      run: Array.from({ length: 24 }, (_, i) => hourRow(i, true)),
      idle: Array.from({ length: 24 }, (_, i) => hourRow(i, i < 20)),
    };
    render(<ComparePage />);
    expect(await screen.findByText('Online, but off')).toBeTruthy();
    expect(screen.getAllByText('Off').length).toBeGreaterThanOrEqual(2); // efficiency + specific energy cells
    expect(screen.getAllByText('Running Unit').length).toBeGreaterThan(0);
  });

  it('shows the error state when stations fail to load', () => {
    h.stations = { data: [], isLoading: false, error: new Error('api down') };
    h.rows = {};
    render(<ComparePage />);
    expect(screen.getByText(/api down/)).toBeTruthy();
  });
});
