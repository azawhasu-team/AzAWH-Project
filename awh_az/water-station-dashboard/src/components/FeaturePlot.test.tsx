// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import FeaturePlot from './FeaturePlot';
import type { FeatureType } from '@/types';

afterEach(cleanup);

// jsdom has no layout, so recharts draws nothing; what matters here is that the
// component mounts without throwing and exposes a readable chart summary.
describe('FeaturePlot', () => {
  it('gives the chart an accessible text summary', () => {
    const data = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
      value: 20 + i,
    }));
    render(
      <FeaturePlot
        data={data}
        feature={'Intake Air - Temperature' as FeatureType}
        startDate="2026-10-01"
        endDate="2026-10-01"
        paramUnits={['°C']}
      />
    );
    const chart = screen.getByRole('img');
    expect(chart.getAttribute('aria-label')).toContain('range 20 to 49 °C, latest 49 °C');
  });

  it('shows the empty message with no data', () => {
    render(<FeaturePlot data={[]} feature={'Intake Air - Temperature' as FeatureType} startDate="a" endDate="b" />);
    expect(screen.getByText('No data available for the selected date range')).toBeTruthy();
  });

  it('mounts with rain and dust shading, on both continuous and hourly bar charts', () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 10, 4, i)).toISOString(),
      value: 5 + i,
    }));
    const bands = [
      { kind: 'rain' as const, startMs: Date.UTC(2026, 10, 4, 1), endMs: Date.UTC(2026, 10, 4, 3) },
      { kind: 'dust_event' as const, startMs: Date.UTC(2026, 10, 4, 4), endMs: Date.UTC(2026, 10, 4, 5) },
    ];
    for (const chartType of ['area', 'bar'] as const) {
      const { unmount } = render(
        <FeaturePlot
          data={data}
          feature={'Intake Air - Temperature' as FeatureType}
          startDate="2026-11-04"
          endDate="2026-11-04"
          chartType={chartType}
          weatherBands={bands}
        />
      );
      expect(screen.getByRole('img')).toBeTruthy();
      unmount();
    }
  });
});
