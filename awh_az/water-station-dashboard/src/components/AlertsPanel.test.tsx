// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AlertsPanel from './AlertsPanel';
import type { StationAlert } from '@/lib/alerts';

afterEach(cleanup);

const alert = (over: Partial<StationAlert>): StationAlert => ({
  id: 'a', type: 'power_unstable', severity: 'warning', title: 'Unstable power (3 sudden changes)',
  detail: 'details', startMs: Date.UTC(2026, 9, 1), endMs: Date.UTC(2026, 9, 1, 1), active: true, ...over,
});

describe('AlertsPanel', () => {
  it('says all clear when nothing is active', () => {
    render(<AlertsPanel active={[]} recent={[]} />);
    expect(screen.getByText('All clear')).toBeTruthy();
  });

  it('lists active alerts with a severity label and a count', () => {
    render(<AlertsPanel active={[alert({}), alert({ id: 'b', severity: 'critical', title: 'Station not sending data' })]} recent={[]} />);
    expect(screen.getByText('2 active')).toBeTruthy();
    expect(screen.getByText('Station not sending data')).toBeTruthy();
    expect(screen.getByTitle('Critical')).toBeTruthy();
  });

  it('hides earlier alerts until expanded and offers Show on charts only when allowed', () => {
    const onJump = vi.fn();
    render(
      <AlertsPanel
        active={[]}
        recent={[alert({ id: 'r', active: false, title: 'Power stopped changing for a while' })]}
        canJump={() => true}
        onJump={onJump}
      />
    );
    fireEvent.click(screen.getByText(/earlier in the last 24 hours/));
    fireEvent.click(screen.getByText('Show on charts'));
    expect(onJump).toHaveBeenCalledWith(expect.objectContaining({ id: 'r' }));
  });

  it('omits Show on charts for alerts outside the charted range', () => {
    render(<AlertsPanel active={[alert({})]} recent={[]} canJump={() => false} onJump={() => {}} />);
    expect(screen.queryByText('Show on charts')).toBeNull();
  });
});
