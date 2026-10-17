// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { makeStation } from '@/test/mocks';

const h = vi.hoisted(() => ({ q: { data: [] as unknown[], isLoading: false, error: null as null | Error } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/queries', () => ({ useStations: () => h.q }));
vi.mock('@/hooks/useFreshnessClock', () => ({ useFreshnessClock: () => Date.now() }));

import StationsPage from './page';

afterEach(cleanup);

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
});
