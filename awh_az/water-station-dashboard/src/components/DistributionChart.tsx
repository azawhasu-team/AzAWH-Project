'use client';

// Box plot / violin / histogram views for the compare page. Plain SVG (not
// recharts): recharts has no box or violin primitive, and drawing all three
// the same way keeps axes, colours and hover behaviour consistent.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  kernelDensity,
  sharedHistogram,
  type DistributionPoint,
} from '@/lib/compareMath';

export type DistributionView = 'box' | 'violin' | 'histogram';

interface Props {
  points: DistributionPoint[];
  view: DistributionView;
  color: string;
  colorEnd: string;
  unitLabel: string;
  formatValue: (v: number) => string;
  gridColor: string;
  axisColor: string;
  tickColor: string;
  markerColor: string;
  height: number;
}

const SERIES_COLORS = ['#901340', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#e53935', '#6d4c41'];
const MARGIN = { top: 16, right: 16, bottom: 56, left: 64 };

function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= hi + step * 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  return ticks;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || 640);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function tipLines(p: DistributionPoint, f: (v: number) => string): [string, string][] {
  return [
    ['Hours', String(p.n)],
    ['Median', f(p.median)],
    ['Mean', f(p.mean)],
    ['Q1 – Q3', `${f(p.q1)} – ${f(p.q3)}`],
    ['Min – Max', `${f(p.min)} – ${f(p.max)}`],
    ['Outlier hours', String(p.outliers.length)],
  ];
}

export default function DistributionChart({
  points, view, color, colorEnd, unitLabel, formatValue,
  gridColor, axisColor, tickColor, markerColor, height,
}: Props) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 50);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const data = useMemo(() => points.filter((p) => p.hasData), [points]);

  const hist = useMemo(() => (view === 'histogram' ? sharedHistogram(data) : null), [view, data]);

  // Value axis: y for box/violin, x for histogram.
  const [vMin, vMax] = useMemo(() => {
    const lo = Math.min(...data.map((p) => p.min));
    const hi = Math.max(...data.map((p) => p.max));
    const pad = (hi - lo) * 0.05 || Math.abs(hi) * 0.05 || 1;
    return [lo - pad, hi + pad];
  }, [data]);

  const violins = useMemo(() => {
    if (view !== 'violin') return [];
    return data.map((p) => {
      const grid = Array.from({ length: 64 }, (_, i) => p.min + ((p.max - p.min || 1) * i) / 63);
      const dens = kernelDensity(p.values, grid);
      const peak = Math.max(...dens) || 1;
      return { grid, dens: dens.map((d) => d / peak) };
    });
  }, [view, data]);

  if (data.length === 0) return null;

  const band = innerW / data.length;
  const yScale = (v: number) => MARGIN.top + innerH - ((v - vMin) / (vMax - vMin)) * innerH;
  const valueTicks = niceTicks(vMin, vMax);

  const axis = (
    <>
      {view !== 'histogram' &&
        valueTicks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yScale(t)} y2={yScale(t)} stroke={gridColor} />
            <text x={MARGIN.left - 8} y={yScale(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={tickColor}>
              {t.toLocaleString(undefined, { maximumSignificantDigits: 4 })}
            </text>
          </g>
        ))}
      <text
        transform={`translate(14 ${MARGIN.top + innerH / 2}) rotate(-90)`}
        textAnchor="middle" fontSize={11} fill={tickColor}
      >
        {view === 'histogram' ? 'Share of hours (%)' : unitLabel}
      </text>
    </>
  );

  let body: React.ReactNode = null;

  if (view === 'box' || view === 'violin') {
    body = data.map((p, i) => {
      const cx = MARGIN.left + band * (i + 0.5);
      const half = Math.min(band * 0.3, 44);
      const label = (
        <text x={cx} y={MARGIN.top + innerH + 18} textAnchor={data.length > 6 ? 'end' : 'middle'} fontSize={12} fill={tickColor}
          transform={data.length > 6 ? `rotate(-30 ${cx} ${MARGIN.top + innerH + 18})` : undefined}>
          {p.displayName}
          <tspan x={cx} dy={14} fontSize={10} fill={tickColor} opacity={0.7}>{`n=${p.n}`}</tspan>
        </text>
      );

      if (view === 'violin') {
        const v = violins[i];
        const right = v.grid.map((g, k) => `${cx + v.dens[k] * half},${yScale(g)}`);
        const left = v.grid.map((g, k) => `${cx - v.dens[k] * half},${yScale(g)}`).reverse();
        return (
          <g key={p.key}>
            <polygon points={[...right, ...left].join(' ')} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={1.5} />
            <line x1={cx} x2={cx} y1={yScale(p.whiskerLow)} y2={yScale(p.whiskerHigh)} stroke={markerColor} strokeWidth={1.5} />
            <rect x={cx - 4} width={8} y={yScale(p.q3)} height={Math.max(yScale(p.q1) - yScale(p.q3), 1)} fill={markerColor} />
            <circle cx={cx} cy={yScale(p.median)} r={3.5} fill="#fff" stroke={markerColor} />
            {label}
          </g>
        );
      }
      return (
        <g key={p.key}>
          <line x1={cx} x2={cx} y1={yScale(p.whiskerHigh)} y2={yScale(p.q3)} stroke={markerColor} strokeWidth={1.5} />
          <line x1={cx} x2={cx} y1={yScale(p.q1)} y2={yScale(p.whiskerLow)} stroke={markerColor} strokeWidth={1.5} />
          <line x1={cx - half / 2} x2={cx + half / 2} y1={yScale(p.whiskerHigh)} y2={yScale(p.whiskerHigh)} stroke={markerColor} strokeWidth={1.5} />
          <line x1={cx - half / 2} x2={cx + half / 2} y1={yScale(p.whiskerLow)} y2={yScale(p.whiskerLow)} stroke={markerColor} strokeWidth={1.5} />
          <rect
            x={cx - half} width={half * 2} y={yScale(p.q3)} height={Math.max(yScale(p.q1) - yScale(p.q3), 1)}
            fill={color} fillOpacity={0.4} stroke={color} strokeWidth={1.5} rx={3}
          />
          <line x1={cx - half} x2={cx + half} y1={yScale(p.median)} y2={yScale(p.median)} stroke={colorEnd} strokeWidth={3} />
          <circle cx={cx} cy={yScale(p.mean)} r={3.5} fill="#fff" stroke={markerColor} strokeWidth={1.5} />
          {p.outliers.map((o, k) => (
            <circle key={k} cx={cx} cy={yScale(o)} r={2.5} fill="none" stroke={color} strokeOpacity={0.7} />
          ))}
          {label}
        </g>
      );
    });
  } else if (hist) {
    const { edges, shares } = hist;
    const xScale = (v: number) => MARGIN.left + ((v - edges[0]) / (edges[edges.length - 1] - edges[0])) * innerW;
    const yMax = Math.max(...shares.flat(), 1) * 1.1;
    const hy = (pct: number) => MARGIN.top + innerH - (pct / yMax) * innerH;
    const xTicks = niceTicks(edges[0], edges[edges.length - 1], Math.max(Math.floor(innerW / 90), 2));
    const yTicks = niceTicks(0, yMax, 4);
    body = (
      <>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={hy(t)} y2={hy(t)} stroke={gridColor} />
            <text x={MARGIN.left - 8} y={hy(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={tickColor}>{t}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={xScale(t)} y={MARGIN.top + innerH + 16} textAnchor="middle" fontSize={11} fill={tickColor}>
            {t.toLocaleString(undefined, { maximumSignificantDigits: 4 })}
          </text>
        ))}
        <text x={MARGIN.left + innerW / 2} y={MARGIN.top + innerH + 36} textAnchor="middle" fontSize={11} fill={tickColor}>
          {unitLabel}
        </text>
        {data.map((p, i) => {
          const c = SERIES_COLORS[i % SERIES_COLORS.length];
          const path = shares[i].flatMap((pct, b) => [`${xScale(edges[b])},${hy(pct)}`, `${xScale(edges[b + 1])},${hy(pct)}`]);
          const closed = [`${xScale(edges[0])},${hy(0)}`, ...path, `${xScale(edges[edges.length - 1])},${hy(0)}`];
          return (
            <g key={p.key}>
              <polygon points={closed.join(' ')} fill={c} fillOpacity={0.14} />
              <polyline points={path.join(' ')} fill="none" stroke={c} strokeWidth={1.8} />
            </g>
          );
        })}
      </>
    );
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < MARGIN.left || x > width - MARGIN.right || y < MARGIN.top || y > MARGIN.top + innerH) {
      setHover(null);
      return;
    }
    const frac = (x - MARGIN.left) / innerW;
    const index = view === 'histogram' && hist
      ? Math.min(Math.floor(frac * (hist.edges.length - 1)), hist.edges.length - 2)
      : Math.min(Math.floor(frac * data.length), data.length - 1);
    setHover({ index, x, y });
  };

  // Highlight under the cursor: the hovered column (box/violin) or bin (histogram).
  let highlight: React.ReactNode = null;
  if (hover) {
    if (view === 'histogram' && hist) {
      const x0 = MARGIN.left + (hover.index / (hist.edges.length - 1)) * innerW;
      highlight = <rect x={x0} y={MARGIN.top} width={innerW / (hist.edges.length - 1)} height={innerH} fill={markerColor} fillOpacity={0.08} />;
    } else {
      highlight = <rect x={MARGIN.left + band * hover.index} y={MARGIN.top} width={band} height={innerH} fill={markerColor} fillOpacity={0.08} />;
    }
  }

  let tooltip: React.ReactNode = null;
  if (hover) {
    let heading = '';
    let rows: [string, string][] = [];
    if (view === 'histogram' && hist) {
      heading = `${formatValue(hist.edges[hover.index])} – ${formatValue(hist.edges[hover.index + 1])}`;
      rows = data.map((p, i) => [p.displayName, `${hist.shares[i][hover.index].toFixed(1)}% of hours`]);
    } else {
      const p = data[hover.index];
      heading = p.displayName;
      // Follows the cursor's height: the value under it, how many of this
      // group's hours sit at or below that value, and (box plot) the nearest
      // marker when the cursor is close to one.
      const cursorVal = vMin + ((MARGIN.top + innerH - hover.y) / innerH) * (vMax - vMin);
      const atOrBelow = p.values.filter((v) => v <= cursorVal).length;
      rows = [['At cursor', formatValue(cursorVal)], ['Hours at or below', `${((atOrBelow / p.n) * 100).toFixed(0)}%`]];
      if (view === 'box') {
        const marks: [string, number][] = [
          ['Upper whisker', p.whiskerHigh], ['Q3', p.q3], ['Median', p.median], ['Mean', p.mean],
          ['Q1', p.q1], ['Lower whisker', p.whiskerLow], ...p.outliers.map((o): [string, number] => ['Outlier', o]),
        ];
        const [name, val] = marks.reduce((a, b) => (Math.abs(yScale(b[1]) - hover.y) < Math.abs(yScale(a[1]) - hover.y) ? b : a));
        if (Math.abs(yScale(val) - hover.y) <= 10) rows.unshift([`▸ ${name}`, formatValue(val)]);
      }
      rows = [...rows, ...tipLines(p, formatValue)];
    }
    const flip = hover.x > width / 2;
    tooltip = (
      <div
        style={{
          position: 'absolute',
          top: Math.max(hover.y - 10, 0),
          ...(flip ? { right: width - hover.x + 14 } : { left: hover.x + 14 }),
          pointerEvents: 'none',
          background: 'rgba(30,30,30,0.94)',
          color: '#fff',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 12,
          lineHeight: 1.5,
          zIndex: 10,
          boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{heading}</div>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
            <span style={{ opacity: 0.75 }}>{k}</span>
            <span style={{ fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {tooltip}
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${view} plot of hourly values by group`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {highlight}
        {axis}
        <line x1={MARGIN.left} x2={width - MARGIN.right} y1={MARGIN.top + innerH} y2={MARGIN.top + innerH} stroke={axisColor} />
        {body}
      </svg>
      {view === 'histogram' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', justifyContent: 'center', fontSize: 12, color: tickColor }}>
          {data.map((p, i) => (
            <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 3, borderRadius: 2, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              {p.displayName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
