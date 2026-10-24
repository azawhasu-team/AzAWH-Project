'use client';

import React, { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  FormControlLabel,
  Switch,
  type SelectChangeEvent,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useStations, useHourlyMany, useCalibrations } from '@/hooks/queries';
import { useFreshnessClock } from '@/hooks/useFreshnessClock';
import { filterVisibleStations } from '@/lib/hiddenStations';
import { mayHaveDataSince } from '@/lib/stationData';
import { lastCalibrationDate } from '@/lib/dataQuality';
import {
  buildEnvelope,
  summarizeEnvelope,
  metricValue,
  goodness,
  lowerIsBetter,
  MIN_HOURS_SHOWN,
  MIN_HOURS_RANKED,
  TEMP_STEP_C,
  RH_STEP_PCT,
  type EnvelopeMetric,
  type EnvelopeCell,
} from '@/lib/envelope';

const DAY_MS = 24 * 60 * 60 * 1000;
const ALL = '__all__';

type WindowKey = '30' | '90' | '180' | '365' | 'all';
const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '180', label: 'Last 6 months' },
  { key: '365', label: 'Last year' },
  { key: 'all', label: 'All time' },
];

const METRICS: Record<EnvelopeMetric, { label: string; unit: string; digits: number; hint: string }> = {
  water: { label: 'Water yield', unit: 'L per running hour', digits: 2, hint: 'higher is better' },
  energy: { label: 'Energy per litre', unit: 'kWh/L', digits: 2, hint: 'lower is better' },
  efficiency: { label: 'Harvest efficiency', unit: '%', digits: 1, hint: 'higher is better' },
};

function fmt(v: number | null, m: EnvelopeMetric): string {
  return v == null ? '–' : v.toFixed(METRICS[m].digits);
}

function cellLabel(c: Pick<EnvelopeCell, 'tempBin' | 'rhBin'>): string {
  return `${c.tempBin}–${c.tempBin + TEMP_STEP_C} °C, ${c.rhBin}–${c.rhBin + RH_STEP_PCT} % RH`;
}

function hourFloorISO(ms: number): string {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

export default function EnvelopePage() {
  const theme = useTheme();
  const nowMs = useFreshnessClock();
  const stationsQuery = useStations();
  const stations = useMemo(() => filterVisibleStations(stationsQuery.data ?? []), [stationsQuery.data]);

  const [stationChoice, setStationChoice] = useState<string>(ALL);
  const [windowKey, setWindowKey] = useState<WindowKey>('180');
  const [metric, setMetric] = useState<EnvelopeMetric>('water');

  const [sinceCalibration, setSinceCalibration] = useState(false);
  const singleStation = stationChoice === ALL ? null : stationChoice;
  const calibrationsQuery = useCalibrations(singleStation, !!singleStation);
  const lastCal = lastCalibrationDate(calibrationsQuery.data);
  const windowStartISO = windowKey === 'all' ? undefined : hourFloorISO(nowMs - Number(windowKey) * DAY_MS);
  // Only data after the most recent recalibration: before it, the sensors read differently.
  const calStartISO = sinceCalibration && lastCal ? `${lastCal}T07:00:00.000Z` : undefined; // Phoenix midnight
  const startISO =
    calStartISO && (!windowStartISO || calStartISO > windowStartISO) ? calStartISO : windowStartISO;
  const selected = (stationChoice === ALL ? stations : stations.filter((s) => s.station_name === stationChoice)).filter(
    (s) => mayHaveDataSince(s, startISO)
  );
  const query = useHourlyMany(
    selected.map((s) => ({ key: s.station_name, stationName: s.station_name, start: startISO })),
    selected.length > 0
  );

  const env = useMemo(() => {
    const rows = selected.flatMap((s) => query.byKey[s.station_name] ?? []);
    return buildEnvelope(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.byKey, stationChoice, stations]);

  const summary = useMemo(() => summarizeEnvelope(env, metric), [env, metric]);
  const cellAt = useMemo(() => {
    const m = new Map<string, EnvelopeCell>();
    env.cells.forEach((c) => m.set(`${c.tempBin}|${c.rhBin}`, c));
    return m;
  }, [env]);

  const loading = stationsQuery.isLoading || query.isLoading;
  const rhRowsTopDown = [...env.rhBins].reverse(); // humid air at the top, like a weather chart
  const good = theme.palette.success.main;

  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 4, maxWidth: '1200px', mx: 'auto' }}>
      <Typography variant="h3" component="h1" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>
        Operating Envelope
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 780, lineHeight: 1.7 }}>
        Where does a station actually make water? Every running hour is placed by the air it breathed in
        (intake temperature and relative humidity). Greener cells are the conditions where the chosen measure is
        best. Hours when a station was switched off are left out.
      </Typography>

      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="env-station">Station</InputLabel>
          <Select
            labelId="env-station"
            label="Station"
            value={stationChoice}
            onChange={(e: SelectChangeEvent) => setStationChoice(e.target.value)}
          >
            <MenuItem value={ALL}>All stations (pooled)</MenuItem>
            {stations.map((s) => (
              <MenuItem key={s.station_name} value={s.station_name}>
                {s.display_name || s.station_name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="env-window">Period</InputLabel>
          <Select
            labelId="env-window"
            label="Period"
            value={windowKey}
            onChange={(e: SelectChangeEvent) => setWindowKey(e.target.value as WindowKey)}
          >
            {WINDOWS.map((w) => (
              <MenuItem key={w.key} value={w.key}>
                {w.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={metric}
          onChange={(_, v: EnvelopeMetric | null) => v && setMetric(v)}
          aria-label="Measure"
        >
          {(Object.keys(METRICS) as EnvelopeMetric[]).map((m) => (
            <ToggleButton key={m} value={m} sx={{ textTransform: 'none', px: 2 }}>
              {METRICS[m].label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {singleStation && (
          <Tooltip title={lastCal ? `Last recalibration: ${lastCal}` : 'No recalibration recorded for this station (add one in Admin)'}>
            <span>
              <FormControlLabel
                disabled={!lastCal}
                control={<Switch size="small" checked={sinceCalibration && !!lastCal} onChange={(e) => setSinceCalibration(e.target.checked)} />}
                label="Only since last calibration"
              />
            </span>
          </Tooltip>
        )}
      </Paper>

      {query.error && <Alert severity="error" sx={{ mb: 2 }}>Could not load hourly data: {query.error}</Alert>}

      {loading ? (
        <Skeleton variant="rounded" height={380} />
      ) : env.cells.length === 0 ? (
        <Alert severity="info">
          No running hours with temperature, humidity and water data in this period. Try a longer period or a
          different station.
        </Alert>
      ) : (
        <>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, mb: 3 }}>
            <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="overline" color="text.secondary">Sweet spot</Typography>
              {summary.best ? (
                <>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{cellLabel(summary.best)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {fmt(metricValue(summary.best, metric), metric)} {METRICS[metric].unit} over {summary.best.hours} running hours
                  </Typography>
                  {stationChoice === ALL && stations.length > 1 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Pooled across machines: pick a single station to confirm it holds for one unit.
                    </Typography>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Not enough data yet: a cell needs at least {MIN_HOURS_RANKED} running hours to be ranked.
                </Typography>
              )}
            </Paper>
            <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="overline" color="text.secondary">Best vs worst conditions</Typography>
              {summary.spreadFactor ? (
                <>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{summary.spreadFactor.toFixed(1)}× spread</Typography>
                  <Typography variant="body2" color="text.secondary">
                    between the best and worst ranked cells ({summary.rankedCells} cells with ≥ {MIN_HOURS_RANKED} h)
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">Needs at least two ranked cells.</Typography>
              )}
            </Paper>
            <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="overline" color="text.secondary">Data used</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{env.usedHours.toLocaleString()} running hours</Typography>
              <Typography variant="body2" color="text.secondary">
                {env.skippedHours.toLocaleString()} hours skipped (station off or sensor values missing)
              </Typography>
            </Paper>
          </Box>

          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {METRICS[metric].label} ({METRICS[metric].unit}), {METRICS[metric].hint}
            </Typography>
            <Box
              role="table"
              aria-label={`${METRICS[metric].label} by intake temperature and relative humidity`}
              sx={{ mt: 2, minWidth: 360 }}
            >
              {rhRowsTopDown.map((rh) => (
                <Box key={rh} role="row" sx={{ display: 'flex', alignItems: 'stretch' }}>
                  <Box role="rowheader" sx={{ width: 64, flexShrink: 0, pr: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <Typography variant="caption" color="text.secondary">{rh}–{rh + RH_STEP_PCT} %</Typography>
                  </Box>
                  {env.tempBins.map((t) => {
                    const c = cellAt.get(`${t}|${rh}`);
                    const v = c ? metricValue(c, metric) : null;
                    const thin = !!c && c.hours < MIN_HOURS_SHOWN;
                    const isBest = !!summary.best && c === summary.best;
                    const bg = c && v != null ? alpha(good, 0.1 + 0.75 * goodness(v, env, metric)) : 'transparent';
                    return (
                      <Tooltip
                        key={t}
                        arrow
                        title={c ? `${cellLabel(c)}: ${fmt(v, metric)} ${METRICS[metric].unit}, ${c.hours} h` : `${cellLabel({ tempBin: t, rhBin: rh })}: never observed while running`}
                      >
                        <Box
                          role="cell"
                          sx={{
                            flex: 1,
                            minWidth: 44,
                            height: 44,
                            m: '1px',
                            borderRadius: 0.5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: bg,
                            opacity: thin ? 0.7 : 1,
                            border: '1px solid',
                            borderColor: isBest ? 'primary.main' : c ? 'transparent' : 'divider',
                            borderWidth: isBest ? 2 : 1,
                          }}
                        >
                          {c && (
                            <Box sx={{ textAlign: 'center', lineHeight: 1.1 }}>
                              <Typography variant="caption" sx={{ display: 'block', fontWeight: isBest ? 700 : 500, color: 'text.primary' }}>
                                {fmt(v, metric)}
                              </Typography>
                              <Typography sx={{ display: 'block', fontSize: 10, color: 'text.secondary' }}>
                                {c.hours} h
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>
              ))}
              <Box sx={{ display: 'flex' }}>
                <Box sx={{ width: 64, flexShrink: 0 }} />
                {env.tempBins.map((t) => (
                  <Box key={t} sx={{ flex: 1, minWidth: 44, textAlign: 'center', m: '1px' }}>
                    <Typography variant="caption" color="text.secondary">{t}°</Typography>
                  </Box>
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
                Intake air temperature (°C), bins of {TEMP_STEP_C} °C. Rows are relative humidity, bins of {RH_STEP_PCT} %.
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Outlined cell: the sweet spot. Faded cells have fewer than {MIN_HOURS_SHOWN} running hours (the small number in each cell is its running hours); cells with
              fewer than {MIN_HOURS_RANKED} are never ranked. {lowerIsBetter(metric) ? 'Energy per litre is total kWh divided by total litres in the cell.' : 'Values are averages per running hour.'}
              {' '}Stations differ in size and design, so pooled results mix machines; pick one station to compare like with like.
            </Typography>
          </Paper>
        </>
      )}
    </Box>
  );
}
