// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { makeStation } from '@/test/mocks';

const h = vi.hoisted(() => ({
  q: { data: [] as unknown[], isLoading: false, error: null as null | Error },
  readings: {} as Record<string, unknown[]>,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/queries', () => ({ useStations: () => h.q, useLatestReadingsMany: () => h.readings }));
vi.mock('@/hooks/useFreshnessClock', () => ({ useFreshnessClock: () => Date.now() }));

import StationsPage from './page';

afterEach(() => {
  cleanup();
  h.readings = {};
});

describe('stations list page', () => {
  it('renders a card per visible station and hides hidden ones', () => {
    h.q = {
      data: [
        makeStation(),
        makeStation({ station_name: 'station_other', display_name: 'Other Unit', hidden: true }),
      ],
      isLoading: false,
      error: null,
    };
    render(<StationsPage />);
    expect(screen.getByText('Testbed 1')).toBeTruthy();
    expect(screen.queryByText('Other Unit')).toBeNull();
  });

  it('shows an error message when stations fail to load', () => {
    h.q = { data: [], isLoading: false, error: new Error('boom') };
    render(<StationsPage />);
    expect(screen.getByText(/boom/)).toBeTruthy();
  });

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const withLastReading = (iso: string, over: Record<string, unknown> = {}) => {
    const st = makeStation(over);
    return { ...st, metadata: { ...st.metadata, last_reading: iso } };
  };

  it('flags an active station that stopped sending, in a banner and on its card', () => {
    h.q = { data: [withLastReading(minutesAgo(40))], isLoading: false, error: null };
    render(<StationsPage />);
    expect(screen.getByText('1 station needs attention')).toBeTruthy();
    expect(screen.getAllByText(/Station not sending data/).length).toBeGreaterThanOrEqual(2);
  });

  it('does not flag retired (inactive) stations however old their last reading', () => {
    h.q = { data: [withLastReading(minutesAgo(60 * 24 * 90), { status: 'inactive' })], isLoading: false, error: null };
    render(<StationsPage />);
    expect(screen.queryByText(/need.* attention/)).toBeNull();
  });

  it('shows no banner for a healthy live station', () => {
    h.q = { data: [withLastReading(minutesAgo(0.2))], isLoading: false, error: null };
    render(<StationsPage />);
    expect(screen.queryByText(/need.* attention/)).toBeNull();
  });
});
