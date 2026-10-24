'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import { DeleteOutline } from '@mui/icons-material';
import type { CalibrationEvent } from '@/lib/api-client';

const SENSORS = ['intake anemometer', 'outtake anemometer', 'balance', 'power meter', 'flow meter', 'pump', 'other'];

/** Admin-only: record when a sensor was recalibrated or replaced. */
export default function CalibrationManager({ stationName }: { stationName: string }) {
  const base = `/api/admin/stations/${encodeURIComponent(stationName)}/calibrations`;
  const [date, setDate] = useState('');
  const [sensor, setSensor] = useState(SENSORS[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['admin-calibrations', stationName],
    queryFn: async (): Promise<CalibrationEvent[]> => {
      const res = await fetch(base);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const events = list.data ?? null;
  const load = () => list.refetch();

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, sensor, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`);
      setDate('');
      setNote('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/calibrations/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) setError(`Could not delete (HTTP ${res.status})`);
    await load();
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Log each recalibration or sensor replacement. The station page marks these days, so a step change in a
        chart is not mistaken for real drift.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TextField
          size="small"
          type="date"
          label="Date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField size="small" select label="Sensor" value={sensor} onChange={(e) => setSensor(e.target.value)} sx={{ minWidth: 190 }}>
          {SENSORS.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          sx={{ flex: 1, minWidth: 200 }}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        <Button variant="contained" disabled={busy || !date} onClick={add} sx={{ textTransform: 'none' }}>
          Add
        </Button>
      </Box>
      {(error || list.error) && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error ?? `Could not load calibrations: ${(list.error as Error).message}`}
        </Alert>
      )}
      <Box sx={{ mt: 1.5 }}>
        {events === null ? null : events.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No calibrations recorded yet.
          </Typography>
        ) : (
          events.map((e) => (
            <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {e.date}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {e.sensor}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {e.note}
              </Typography>
              <IconButton size="small" aria-label={`Delete calibration ${e.date} ${e.sensor}`} onClick={() => remove(e.id)}>
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
