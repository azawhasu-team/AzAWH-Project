// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { makeStation, makeReadings } from '@/test/mocks';

const h = vi.hoisted(() => ({
  stations: { data: [] as unknown[], isLoading: false, isSuccess: true, error: null as null | Error },
  live: { data: null as unknown, error: null, isLoading: false },
  latest: { data: [] as unknown[] },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'testbed-1' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/hooks/queries', () => ({
  useStations: () => h.stations,
  useLiveReading: () => h.live,
  useLatestReadings: () => h.latest,
  useStationReadingsRange: () => ({ query: { data: undefined, isFetching: false }, progress: 0 }),
  useHourly: () => ({ data: [], isFetching: false }),
  useAnomalies: () => ({ data: null }),
}));

import StationPage from './page';

beforeEach(() => {
  h.stations = { data: [makeStation()], isLoading: false, isSuccess: true, error: null };
});
afterEach(cleanup);

const setReadings = (energyPerMinute: number) => {
  const readings = makeReadings(90, energyPerMinute);
  h.live = { data: readings[0], error: null, isLoading: false };
  h.latest = { data: readings };
};

describe('station page', () => {
  it('shows "Station not found" for an unknown slug', () => {
    h.stations = { data: [], isLoading: false, isSuccess: true, error: null };
    setReadings(0.02);
    render(<StationPage />);
    expect(screen.getByText('Station not found')).toBeTruthy();
  });

  it('shows Live and no alerts for a station that is running', async () => {
    setReadings(0.02); // 1.2 kWh/hour
    render(<StationPage />);
    expect(await screen.findByText('Live')).toBeTruthy();
    expect(screen.queryByText(/but off/)).toBeNull();
    expect(screen.getByText('All clear')).toBeTruthy();
  });

  it('shows "Live, but off" and a station-off alert when energy is flat', async () => {
    setReadings(0); // reporting, but the energy register never moves
    render(<StationPage />);
    expect(await screen.findByText('Live, but off')).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy(); // header chip
    expect(screen.getByText('Station is off')).toBeTruthy();
  });
});
