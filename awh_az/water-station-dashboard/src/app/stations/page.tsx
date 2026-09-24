'use client';

import React, { useMemo } from 'react';
import { Typography, Box, Fade, Skeleton, Alert } from '@mui/material';
import StationCard from '@/components/StationCard';
import { useStations } from '@/hooks/queries';
import { filterVisibleStations } from '@/lib/hiddenStations';

// Fixed-max card width + auto-fit + centered justification, instead of a
// fixed N-column grid — with online stations usually numbering 1-2, a rigid
// grid would pin them to the left with a big empty gap. This centers
// whatever count is present and reflows naturally as more come online.
const stationGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 260px))',
  justifyContent: 'center',
  gap: 2.5,
  width: '100%',
} as const;

export default function StationsPage() {
  const stationsQuery = useStations();
  const stations = useMemo(
    () => filterVisibleStations(stationsQuery.data ?? []),
    [stationsQuery.data]
  );
  const loading = stationsQuery.isLoading;
  const error = stationsQuery.error ? stationsQuery.error.message : null;

  // Online stations are listed before offline ones (a stable partition —
  // order within each group is otherwise untouched) so the stations someone
  // can actually act on aren't buried below a wall of offline cards.
  const stationCards = stations
    .map((station) => ({
      id: station.station_name,
      name: station.display_name || station.station_name,
      location: station.location || 'Arizona, USA',
      status: (station.status === 'active' ? 'Online' : 'Offline') as 'Online' | 'Offline',
      units: [station.unit],
      image: station.image_url || undefined,
      description: station.description || undefined,
      lastReading: station.metadata.last_reading,
    }))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'Online' ? -1 : 1));
  const onlineStationCards = stationCards.filter((s) => s.status === 'Online');
  const offlineStationCards = stationCards.filter((s) => s.status === 'Offline');

  if (loading) {
    return (
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 6, maxWidth: '1400px', mx: 'auto' }}>
        <Skeleton variant="text" width={260} height={48} sx={{ maxWidth: '100%', mx: 'auto', mb: 1 }} />
        <Skeleton variant="text" width={420} height={28} sx={{ maxWidth: '100%', mx: 'auto', mb: 5 }} />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
            gap: 3,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={340} />
          ))}
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" sx={{ maxWidth: 600, mx: 'auto' }}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 6, maxWidth: '1400px', mx: 'auto', width: '100%', boxSizing: 'border-box' }}>
      <Typography
        variant="h4"
        component="h1"
        gutterBottom
        sx={{
          mb: 1,
          fontWeight: 700,
          color: 'text.primary',
          textAlign: 'center',
          letterSpacing: '-0.5px',
        }}
      >
        Our Stations
      </Typography>

      <Box sx={{ mb: 5, textAlign: 'center' }}>
        <Typography variant="body1" sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.95rem' }}>
          Total Stations: {stationCards.length} |
          Online: {onlineStationCards.length} |
          Offline: {offlineStationCards.length}
        </Typography>
      </Box>

      <Typography
        variant="h6"
        component="h2"
        sx={{
          textAlign: 'center',
          mb: { xs: 5, sm: 6, md: 7 },
          fontSize: { xs: '1.05rem', sm: '1.15rem', md: '1.25rem' },
          px: { xs: 2, sm: 1, md: 0 },
          color: 'text.secondary',
          fontWeight: 400,
          lineHeight: 1.6,
        }}
      >
        Monitor and manage water stations across all regions
      </Typography>

      <Box sx={stationGridSx}>
        {onlineStationCards.map((station, index) => (
          <Fade key={station.id} in={true} timeout={500 + index * 100}>
            <Box sx={{ width: '100%', minWidth: 0, display: 'flex' }}>
              <StationCard station={station} />
            </Box>
          </Fade>
        ))}
      </Box>

      {onlineStationCards.length > 0 && offlineStationCards.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 5 }}>
          <Box sx={{ flex: 1, height: '1px', backgroundColor: 'divider' }} />
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1.5px', px: 2, fontSize: '0.78rem' }}
          >
            Offline
          </Typography>
          <Box sx={{ flex: 1, height: '1px', backgroundColor: 'divider' }} />
        </Box>
      )}

      <Box sx={{ ...stationGridSx, opacity: offlineStationCards.length > 0 ? 0.85 : 1 }}>
        {offlineStationCards.map((station, index) => (
          <Fade key={station.id} in={true} timeout={500 + index * 100}>
            <Box sx={{ width: '100%', minWidth: 0, display: 'flex' }}>
              <StationCard station={station} />
            </Box>
          </Fade>
        ))}
      </Box>
    </Box>
  );
}
