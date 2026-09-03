'use client';

import React, { useEffect, useState } from 'react';
import { Typography, Box, Link as MuiLink, Skeleton, Alert } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import Link from 'next/link';
import { apiClient, type StationInfo, type ImpactResponse } from '@/lib/api-client';
import { formatPhoenixMonthDayTime } from '@/lib/timezone';
import { filterVisibleStations } from '@/lib/hiddenStations';

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
        setStations(filterVisibleStations(data));
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

  // Used only for the stats row below — the full station list with cards
  // now lives on its own page (/stations).
  const stationCards = stations.map((station) => ({
    status: (station.status === 'active' ? 'Online' : 'Offline') as 'Online' | 'Offline',
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
          from filtered balance-scale deltas (see compute_lifetime_totals.py).
          Styled as a light, bordered card with a gradient accent — like every
          other card on the site — rather than a solid saturated color block,
          which read as a jarring, off-brand banner against the rest of the
          page. Still the visual highlight of this section via the gradient
          number and top accent bar, just not by shouting in solid red. */}
      {impact && impact.total_liters > 0 && (
        <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, pt: { xs: 5, md: 7 }, pb: { xs: 1, md: 2 }, maxWidth: '1400px', mx: 'auto', width: '100%', boxSizing: 'border-box' }}>
          <Box
            sx={{
              maxWidth: '1000px',
              mx: 'auto',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 3,
              border: '1px solid rgba(0,0,0,0.08)',
              backgroundColor: '#fff',
              boxShadow: '0 8px 32px rgba(144,19,64,0.06)',
              py: { xs: 4, md: 5 },
              px: { xs: 2, md: 4 },
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 4,
                background: 'linear-gradient(90deg, #901340, #ffcb25)',
              },
            }}
          >
            <Typography
              variant="overline"
              sx={{ color: '#901340', letterSpacing: 3, fontWeight: 700, fontSize: '0.8rem' }}
            >
              Real-World Impact
            </Typography>
            <Typography
              variant="h2"
              sx={{
                fontWeight: 800,
                fontSize: { xs: '2.25rem', sm: '2.75rem', md: '3.5rem' },
                mt: 0.5,
                mb: 0.5,
                lineHeight: 1.1,
                background: 'linear-gradient(90deg, #901340, #b8336a)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {impact.total_liters.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
            </Typography>
            <Typography variant="h6" sx={{ color: '#191919', fontWeight: 400, mb: 0.5, fontSize: '1.05rem' }}>
              of water harvested directly from the air — and counting
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
              ≈ {Math.round(impact.total_liters / 2).toLocaleString()} days of drinking water for one person, at 2 L/day
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              {filterVisibleStations(impact.stations).map((s) => (
                <Box
                  key={s.station_name}
                  sx={{
                    background: 'rgba(144,19,64,0.05)',
                    border: '1px solid rgba(144,19,64,0.1)',
                    borderRadius: 2,
                    px: 3,
                    py: 1.25,
                    minWidth: 180,
                  }}
                >
                  <Typography sx={{ color: '#901340', fontWeight: 700, fontSize: '1.3rem' }}>
                    {s.total_liters.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                    {s.station_name.replace(/^station_/, '')}
                  </Typography>
                </Box>
              ))}
            </Box>

            {impact.updated_at && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.disabled' }}>
                Last updated {formatPhoenixMonthDayTime(new Date(impact.updated_at))}
              </Typography>
            )}

            <Link href="/stations" style={{ textDecoration: 'none' }}>
              <Typography
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  mt: 3,
                  color: '#901340',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  borderBottom: '2px solid transparent',
                  transition: 'border-color 150ms ease, gap 150ms ease',
                  '&:hover': {
                    borderColor: '#901340',
                    gap: 1,
                  },
                }}
              >
                View All Stations
                <ArrowForward sx={{ fontSize: 18 }} />
              </Typography>
            </Link>
          </Box>
        </Box>
      )}

      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 6, maxWidth: '1400px', mx: 'auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Separator */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            mb: 5,
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
