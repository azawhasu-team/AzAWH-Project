// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { WeatherRow } from '@/lib/api-client';

const hourly = (h: number, over: Partial<WeatherRow> = {}): WeatherRow => ({
  hour: `2026-11-04T${String(h).padStart(2, '0')}:00:00Z`,
  temperature_c: 20 + h, humidity_pct: 30, wind_kmh: 10, gust_kmh: 16, precip_mm: 0, weather_code: 0,
  visibility_m: 20000, pm10: 12, dust: 1, rain: false, dust_event: false, condition: 'No rain or dust',
  ...over,
});

const rows: WeatherRow[] = [
  hourly(0), hourly(1), hourly(2, { rain: true, precip_mm: 1.2, condition: 'Rain' }),
  hourly(3, { rain: true, precip_mm: 0.8, condition: 'Rain' }), hourly(4, { dust_event: true, pm10: 180, condition: 'Possible dust event' }),
];

vi.mock('@/hooks/queries', () => ({
  useStationWeather: () => ({ isLoading: false, isError: false, data: { data: rows } }),
}));

import WeatherPanel from './WeatherPanel';

afterEach(cleanup);

describe('WeatherPanel', () => {
  it('shows the two weather charts and the rain / dust events', () => {
    render(<WeatherPanel stationName="s1" />);
    const charts = screen.getAllByRole('img');
    expect(charts.map(c => c.getAttribute('aria-label'))).toEqual([
      expect.stringContaining('temperature and humidity'),
      expect.stringContaining('wind speed, gusts and PM10'),
    ]);
    expect(screen.getByText(/Rain · .* · 2 h/)).toBeTruthy();
    expect(screen.getByText(/Dust event · .* · 1 h/)).toBeTruthy();
  });

  it('keeps the hourly table folded away until asked for', () => {
    render(<WeatherPanel stationName="s1" />);
    expect(screen.queryByLabelText('Hourly weather')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show table' }));
    expect(screen.getByLabelText('Hourly weather')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide table' })).toBeTruthy();
  });
});
