'use client';

import React, { useEffect, useState } from 'react';
import { Typography, Box, Fade, Link as MuiLink, Skeleton, Alert } from '@mui/material';
import StationCard from '@/components/StationCard';
import { apiClient, type StationInfo, type ImpactResponse } from '@/lib/api-client';
import { getStationImage } from '@/lib/stationImages';
import { formatPhoenixMonthDayTime } from '@/lib/timezone';

export default function Home() {
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<ImpactResponse | null>(null);

  useEffect(() => {
    async function fetchStations() {
      try {
        setLoading(true);
        const data = await apiClient.getStations();
        setStations(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch stations:', err);
        setError(err instanceof Error ? err.message : 'Failed to load stations');
      } finally {
        setLoading(false);
      }
    }

    // Fetched separately from stations — a failure here (e.g. lifetime
    // totals haven't been computed for any station yet) shouldn't break
    // the rest of the homepage.
    async function fetchImpact() {
      try {
        const data = await apiClient.getImpact();
        setImpact(data);
      } catch (err) {
        console.error('Failed to fetch impact totals:', err);
      }
    }

    fetchStations();
    fetchImpact();
  }, []);

  // Map API data to StationCard format
  const stationCards = stations.map((station, index) => ({
    id: station.station_name, // Use station_name as ID for routing
    name: station.station_name,
    location: station.location || 'Arizona, USA',  // Default location
    status: (station.status === 'active' ? 'Online' : 'Offline') as 'Online' | 'Offline',
    units: [station.unit],
    image: getStationImage(station.station_name),
  }));

  if (loading) {
    return (
      <Box sx={{ width: '100%' }}>
        <Skeleton variant="rectangular" width="100%" height={420} />
        <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 6, maxWidth: '1400px', mx: 'auto' }}>
          <Skeleton variant="text" width={260} height={48} sx={{ mx: 'auto', mb: 1 }} />
          <Skeleton variant="text" width={420} height={28} sx={{ mx: 'auto', mb: 5 }} />
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
    <Box sx={{ overflowX: 'hidden', width: '100%' }}>
      {/* Hero Section - Full Page */}
      <Box
        sx={{
          position: 'relative',
          height: 'calc(100vh - 80px)',
          minHeight: '600px',
          width: '100%',
          backgroundImage: 'url(/phx_cityscape.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
          }
        }}
      >
        <Box
          sx={{
            position: 'relative',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            px: { xs: 2, md: 4 },
            zIndex: 1,
          }}
        >
          <MuiLink
            href="https://azawh.asu.edu/"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              textDecoration: 'none',
              color: 'inherit',
              '&:hover': {
                opacity: 0.9,
              },
            }}
          >
            <Typography
              variant="h2"
              sx={{
                color: 'white',
                fontWeight: 700,
                fontSize: { xs: '2.5rem', sm: '3rem', md: '4rem', lg: '5rem' },
                textShadow: '2px 2px 8px rgba(0,0,0,0.7)',
                mb: 2,
                lineHeight: 1.2,
              }}
            >
              Arizona Atmospheric Water Harvesting (AzAWH) Testbeds
            </Typography>
          </MuiLink>
          <Typography
            variant="h3"
            sx={{
              color: '#ffcb25',
              fontWeight: 600,
              fontSize: { xs: '1.25rem', sm: '1.5rem', md: '2rem', lg: '2.5rem' },
              textShadow: '2px 2px 8px rgba(0,0,0,0.7)',
              lineHeight: 1.4,
              fontStyle: 'italic',
            }}
          >
            Harvesting Tomorrow's Water, Today
          </Typography>
        </Box>
      </Box>

      {/* Impact Section - real cumulative water harvested, computed offline
          from filtered balance-scale deltas (see compute_lifetime_totals.py) */}
      {impact && impact.total_liters > 0 && (
        <Box
          sx={{
            background: 'linear-gradient(135deg, #901340 0%, #5e0c29 100%)',
            py: { xs: 4, md: 5 },
            px: { xs: 2, md: 4 },
          }}
        >
          <Box sx={{ maxWidth: '1000px', mx: 'auto', textAlign: 'center' }}>
            <Typography
              variant="overline"
              sx={{ color: '#ffcb25', letterSpacing: 3, fontWeight: 700, fontSize: '0.8rem' }}
            >
              Real-World Impact
            </Typography>
            <Typography
              variant="h2"
              sx={{
                color: 'white',
                fontWeight: 800,
                fontSize: { xs: '2.25rem', sm: '2.75rem', md: '3.5rem' },
                mt: 0.5,
                mb: 0.5,
                lineHeight: 1.1,
              }}
            >
              {impact.total_liters.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
            </Typography>
            <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.92)', fontWeight: 400, mb: 0.5, fontSize: '1.05rem' }}>
              of water harvested directly from the air — and counting
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 2.5 }}>
              ≈ {Math.round(impact.total_liters / 2).toLocaleString()} days of drinking water for one person, at 2 L/day
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              {impact.stations.map((s) => (
                <Box
                  key={s.station_name}
                  sx={{
                    background: 'rgba(255,255,255,0.12)',
                    borderRadius: 2,
                    px: 3,
                    py: 1.25,
                    minWidth: 180,
                  }}
                >
                  <Typography sx={{ color: '#ffcb25', fontWeight: 700, fontSize: '1.3rem' }}>
                    {s.total_liters.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                  </Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem' }}>
                    {s.station_name.replace(/^station_/, '')}
                  </Typography>
                </Box>
              ))}
            </Box>

            {impact.updated_at && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'rgba(255,255,255,0.5)' }}>
                Last updated {formatPhoenixMonthDayTime(new Date(impact.updated_at))}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Stations Section */}
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 6, maxWidth: '1400px', mx: 'auto', width: '100%', boxSizing: 'border-box' }}>
        <Typography 
          variant="h4" 
          component="h2" 
          gutterBottom
          sx={{ 
            mb: 1,
            fontWeight: 700,
            color: '#191919',
            textAlign: 'center',
            letterSpacing: '-0.5px'
          }}
        >
          Our Stations
        </Typography>

        <Box sx={{ mb: 5, textAlign: 'center' }}>
          <Typography variant="body1" sx={{ fontWeight: 500, color: '#484848', fontSize: '0.95rem' }}>
            Total Stations: {stationCards.length} | 
            Online: {stationCards.filter(s => s.status === 'Online').length} | 
            Offline: {stationCards.filter(s => s.status === 'Offline').length}
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
          color: '#484848',
          fontWeight: 400,
          lineHeight: 1.6
        }}
      >
        Monitor and manage water stations across all regions
      </Typography>

      <Box 
        sx={{ 
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(4, 1fr)',
          },
          gap: 3,
          width: '100%',
        }}
      >
        {stationCards.map((station, index) => (
          <Fade key={station.id} in={true} timeout={500 + index * 100}>
            <Box sx={{ width: '100%', minWidth: 0, display: 'flex' }}>
              <StationCard station={station} />
            </Box>
          </Fade>
        ))}
      </Box>

      {/* Separator */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          my: 8
        }}
      >
        <Box sx={{ flex: 1, height: '2px', background: 'linear-gradient(to right, transparent, #901340, transparent)' }} />
        <Typography
          variant="body2"
          sx={{
            color: '#901340',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '2px',
            px: 2
          }}
        >
          LIVE STATISTICS
        </Typography>
        <Box sx={{ flex: 1, height: '2px', background: 'linear-gradient(to right, transparent, #901340, transparent)' }} />
      </Box>

      {/* Stats Row — static grid. Was an auto-scrolling marquee; replaced
          because infinite-scroll stat tiles read as a dated pattern for a
          research/monitoring tool and didn't respect prefers-reduced-motion. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' },
          gap: 3,
        }}
      >
        {[
          { value: String(stationCards.length), label: 'Total Stations', color: '#901340' },
          { value: String(stationCards.filter(s => s.status === 'Online').length), label: 'Online Now', color: '#2e7d32' },
          { value: '12+', label: 'Parameters Tracked', color: '#ffcb25' },
          { value: '24/7', label: 'Real-time Monitoring', color: '#901340' },
          { value: impact ? `${impact.total_liters.toLocaleString(undefined, { maximumFractionDigits: 0 })} L` : '—', label: 'Harvested Lifetime', color: '#ffcb25' },
        ].map((stat, i) => (
          <Box
            key={i}
            sx={{
              textAlign: 'center',
              p: 4,
              background: '#ffffff',
              borderRadius: 2,
              border: '2px solid',
              borderColor: stat.color,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'box-shadow 200ms ease, transform 200ms ease',
              '&:hover': {
                boxShadow: '0 6px 20px rgba(0,0,0,0.1)',
                transform: 'translateY(-3px)',
              },
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, color: stat.color, mb: 1.5, fontSize: '2.5rem' }}>
              {stat.value}
            </Typography>
            <Typography variant="body2" sx={{ color: '#484848', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {stat.label}
            </Typography>
          </Box>
        ))}
      </Box>
      </Box>
    </Box>
  );
}
