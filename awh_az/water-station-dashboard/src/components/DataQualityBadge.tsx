'use client';

import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { FactCheckOutlined } from '@mui/icons-material';
import { useStationQuality } from '@/hooks/queries';
import { badgeDay, describeIssues, QUALITY_COLOR } from '@/lib/dataQuality';

const RECENT_MS = 7 * 24 * 3600_000;

/** Small "Data quality 92" chip for a station card. Renders nothing for stations that have not reported lately. */
export default function DataQualityBadge({
  stationName,
  lastReading,
  nowMs,
}: {
  stationName: string;
  lastReading?: string | null;
  nowMs: number;
}) {
  const last = lastReading ? Date.parse(lastReading) : NaN;
  const recent = Number.isFinite(last) && nowMs - last <= RECENT_MS;
  const { data } = useStationQuality(stationName, 3, recent);
  const day = data ? badgeDay(data.days, nowMs) : null;
  if (!recent || !day) return null;

  const issues = describeIssues(day);
  return (
    <Tooltip
      arrow
      title={
        <>
          <strong>
            Data quality on {day.date}: {day.score}/100 ({day.label})
          </strong>
          {issues.length === 0 ? <div>No problems found.</div> : issues.map((l) => <div key={l}>{l}</div>)}
        </>
      }
    >
      <Chip
        size="small"
        variant="outlined"
        color={QUALITY_COLOR[day.label]}
        icon={<FactCheckOutlined />}
        label={`Data quality ${day.score}`}
        aria-label={`Data quality ${day.score} out of 100, ${day.label}`}
        sx={{ fontWeight: 600 }}
      />
    </Tooltip>
  );
}
