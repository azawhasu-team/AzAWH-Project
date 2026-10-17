import { describe, it, expect } from 'vitest';
import { clampWindow, scaleWindow, panWindow, isFullWindow } from './chartZoom';

const bounds = { start: 0, end: 1000 };

describe('chartZoom', () => {
  it('zooms in around the anchor, keeping it fixed', () => {
    const w = scaleWindow(bounds, 0.5, 0.5, bounds, 10);
    expect(w).toEqual({ start: 250, end: 750 });
  });

  it('zooms in at the left edge without leaving bounds', () => {
    expect(scaleWindow(bounds, 0.5, 0, bounds, 10)).toEqual({ start: 0, end: 500 });
  });

  it('never zooms in past the minimum span', () => {
    const w = scaleWindow({ start: 0, end: 100 }, 0.01, 0.5, bounds, 50);
    expect(w.end - w.start).toBe(50);
  });

  it('zooming out is capped at the full range', () => {
    const w = scaleWindow({ start: 400, end: 600 }, 100, 0.5, bounds, 10);
    expect(w).toEqual(bounds);
    expect(isFullWindow(w, bounds)).toBe(true);
  });

  it('pans and stops at the edges', () => {
    const w = { start: 100, end: 300 };
    expect(panWindow(w, 0.5, bounds, 10)).toEqual({ start: 200, end: 400 });
    expect(panWindow(w, -5, bounds, 10)).toEqual({ start: 0, end: 200 });
    expect(panWindow(w, 99, bounds, 10)).toEqual({ start: 800, end: 1000 });
  });

  it('clamps a window that overshoots the end', () => {
    expect(clampWindow({ start: 900, end: 1100 }, bounds, 10)).toEqual({ start: 800, end: 1000 });
  });
});
