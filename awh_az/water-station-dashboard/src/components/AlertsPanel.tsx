'use client';

import React from 'react';
import { Box, Typography, Paper, Button, Chip, Collapse } from '@mui/material';
import { ErrorOutline, WarningAmber, InfoOutlined, CheckCircleOutline } from '@mui/icons-material';
import type { StationAlert, AlertSeverity } from '@/lib/alerts';
import { formatPhoenixMonthDayTime } from '@/lib/timezone';

const SEVERITY_STYLE: Record<AlertSeverity, { color: string; label: string; Icon: typeof InfoOutlined }> = {
  critical: { color: '#c62828', label: 'Critical', Icon: ErrorOutline },
  warning: { color: '#e65100', label: 'Warning', Icon: WarningAmber },
  info: { color: '#546e7a', label: 'Info', Icon: InfoOutlined },
};

const RECENT_COLLAPSED = 5;

function AlertRow({ alert, onJump }: { alert: StationAlert; onJump?: (a: StationAlert) => void }) {
  const { color, Icon } = SEVERITY_STYLE[alert.severity];
  const range =
    alert.active || alert.endMs === alert.startMs
      ? formatPhoenixMonthDayTime(new Date(alert.startMs))
      : `${formatPhoenixMonthDayTime(new Date(alert.startMs))} – ${formatPhoenixMonthDayTime(new Date(alert.endMs))}`;
  return (
    <Box
      component="li"
      sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, py: 1, borderTop: '1px solid', borderColor: 'divider', listStyle: 'none' }}
    >
      <Icon sx={{ color, fontSize: 20, mt: '2px', flexShrink: 0 }} titleAccess={SEVERITY_STYLE[alert.severity].label} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{alert.title}</Typography>
        <Typography variant="body2" color="text.secondary">{alert.detail}</Typography>
        <Typography variant="caption" color="text.disabled">{range}</Typography>
      </Box>
      {onJump && (
        <Button size="small" onClick={() => onJump(alert)} sx={{ textTransform: 'none', flexShrink: 0 }}>
          Show on charts
        </Button>
      )}
    </Box>
  );
}

interface AlertsPanelProps {
  active: StationAlert[];
  recent: StationAlert[];
  /** Return false/omit for alerts outside the charted range; the button is then hidden. */
  canJump?: (a: StationAlert) => boolean;
  onJump?: (a: StationAlert) => void;
}

export default function AlertsPanel({ active, recent, canJump, onJump }: AlertsPanelProps) {
  const [showAllRecent, setShowAllRecent] = React.useState(false);
  const [recentOpen, setRecentOpen] = React.useState(false);
  const jumpFor = (a: StationAlert) => (onJump && (!canJump || canJump(a)) ? onJump : undefined);
  const worst = active[0]?.severity;
  const headColor = worst ? SEVERITY_STYLE[worst].color : '#2e7d32';

  return (
    <Paper
      elevation={0}
      sx={{ p: { xs: 2, sm: 2.5 }, mt: 2, mb: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', borderLeft: `4px solid ${headColor}` }}
      aria-label="Station alerts"
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 700 }}>Alerts</Typography>
        {active.length > 0 ? (
          <Chip size="small" label={`${active.length} active`} sx={{ bgcolor: headColor, color: '#fff', fontWeight: 600 }} />
        ) : (
          <Chip size="small" icon={<CheckCircleOutline />} label="All clear" color="success" variant="outlined" />
        )}
      </Box>

      {active.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 1, p: 0 }}>
          {active.map(a => <AlertRow key={a.id} alert={a} onJump={jumpFor(a)} />)}
        </Box>
      )}

      {recent.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Button size="small" onClick={() => setRecentOpen(v => !v)} sx={{ textTransform: 'none', px: 0 }}>
            {recentOpen ? 'Hide' : 'Show'} earlier in the last 24 hours ({recent.length})
          </Button>
          <Collapse in={recentOpen}>
            <Box component="ul" sx={{ m: 0, p: 0 }}>
              {(showAllRecent ? recent : recent.slice(0, RECENT_COLLAPSED)).map(a => (
                <AlertRow key={a.id} alert={a} onJump={jumpFor(a)} />
              ))}
            </Box>
            {recent.length > RECENT_COLLAPSED && (
              <Button size="small" onClick={() => setShowAllRecent(v => !v)} sx={{ textTransform: 'none' }}>
                {showAllRecent ? 'Show fewer' : `Show all ${recent.length}`}
              </Button>
            )}
          </Collapse>
        </Box>
      )}
    </Paper>
  );
}
