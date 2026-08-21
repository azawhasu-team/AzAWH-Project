'use client';

import React, { useEffect, useState } from 'react';
import { Typography, Box, Fade, Link as MuiLink, CircularProgress, Alert } from '@mui/material';
import StationCard from '@/components/StationCard';
import { apiClient, type StationInfo } from '@/lib/api-client';
import { getStationImage } from '@/lib/stationImages';

export default function Home() {
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    fetchStations();
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <CircularProgress size={60} sx={{ color: '#901340' }} />
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
          backgroundImage: 'url(https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80)',
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

      {/* Stats Row - Horizontal Scrolling */}
      <Box 
        sx={{ 
          mt: 8,
          overflow: 'hidden',
          position: 'relative',
          '&::before, &::after': {
            content: '""',
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '100px',
            zIndex: 2,
            pointerEvents: 'none',
          },
          '&::before': {
            left: 0,
            background: 'linear-gradient(to right, #fafafa, transparent)',
          },
          '&::after': {
            right: 0,
            background: 'linear-gradient(to left, #fafafa, transparent)',
          }
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: 3,
            animation: 'scroll 20s linear infinite',
            '@keyframes scroll': {
              '0%': {
                transform: 'translateX(0)',
              },
              '100%': {
                transform: 'translateX(-50%)',
              },
            },
            '&:hover': {
              animationPlayState: 'paused',
            }
          }}
        >
          {/* First set of stats */}
          <Box 
            sx={{ 
              textAlign: 'center',
              p: 4,
              minWidth: '280px',
              background: '#ffffff',
              borderRadius: 2,
              border: '2px solid #901340',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(144, 19, 64, 0.12)',
                transform: 'translateY(-2px)'
              }
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#901340', mb: 1.5, fontSize: '2.5rem' }}>
              {stationCards.length}
            </Typography>
            <Typography variant="body2" sx={{ color: '#484848', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Stations
            </Typography>
          </Box>
          
          <Box 
            sx={{ 
              textAlign: 'center',
              p: 4,
              minWidth: '280px',
              background: '#ffffff',
              borderRadius: 2,
              border: '2px solid #4caf50',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(76, 175, 80, 0.12)',
                transform: 'translateY(-2px)'
              }
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#4caf50', mb: 1.5, fontSize: '2.5rem' }}>
              {stationCards.filter(s => s.status === 'Online').length}
            </Typography>
            <Typography variant="body2" sx={{ color: '#484848', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Online Now
            </Typography>
          </Box>
          
          <Box 
            sx={{ 
              textAlign: 'center',
              p: 4,
              minWidth: '280px',
              background: '#ffffff',
              borderRadius: 2,
              border: '2px solid #ffcb25',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(255, 203, 37, 0.12)',
                transform: 'translateY(-2px)'
              }
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#ffcb25', mb: 1.5, fontSize: '2.5rem' }}>
              12+
            </Typography>
            <Typography variant="body2" sx={{ color: '#484848', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Parameters Tracked
            </Typography>
          </Box>

          <Box 
            sx={{ 
              textAlign: 'center',
              p: 4,
              minWidth: '280px',
              background: '#ffffff',
              borderRadius: 2,
              border: '2px solid #901340',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(144, 19, 64, 0.12)',
                transform: 'translateY(-2px)'
              }
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#901340', mb: 1.5, fontSize: '2.5rem' }}>
              24/7
            </Typography>
            <Typography variant="body2" sx={{ color: '#484848', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Real-time Monitoring
            </Typography>
          </Box>

          <Box 
            sx={{ 
              textAlign: 'center',
              p: 4,
              minWidth: '280px',
              background: '#ffffff',
              borderRadius: 2,
              border: '2px solid #ffcb25',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(255, 203, 37, 0.12)',
                transform: 'translateY(-2px)'
              }
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#ffcb25', mb: 1.5, fontSize: '2.5rem' }}>
              100%
            </Typography>
            <Typography variant="body2" sx={{ color: '#484848', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Sustainable Water
            </Typography>
          </Box>

          {/* Duplicate set for seamless loop */}
          <Box 
            sx={{ 
              textAlign: 'center',
              p: 4,
              minWidth: '280px',
              background: '#ffffff',
              borderRadius: 2,
              border: '2px solid #901340',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(144, 19, 64, 0.12)',
                transform: 'translateY(-2px)'
              }
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#901340', mb: 1.5, fontSize: '2.5rem' }}>
              {stationCards.length}
            </Typography>
            <Typography variant="body2" sx={{ color: '#484848', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Stations
            </Typography>
          </Box>
          
          <Box 
            sx={{ 
              textAlign: 'center',
              p: 4,
              minWidth: '280px',
              background: '#ffffff',
              borderRadius: 2,
              border: '2px solid #4caf50',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(76, 175, 80, 0.12)',
                transform: 'translateY(-2px)'
              }
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#4caf50', mb: 1.5, fontSize: '2.5rem' }}>
              {stationCards.filter(s => s.status === 'Online').length}
            </Typography>
            <Typography variant="body2" sx={{ color: '#484848', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Online Now
            </Typography>
          </Box>
          
          <Box 
            sx={{ 
              textAlign: 'center',
              p: 4,
              minWidth: '280px',
              background: '#ffffff',
              borderRadius: 2,
              border: '2px solid #ffcb25',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(255, 203, 37, 0.12)',
                transform: 'translateY(-2px)'
              }
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#ffcb25', mb: 1.5, fontSize: '2.5rem' }}>
              12+
            </Typography>
            <Typography variant="body2" sx={{ color: '#484848', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Parameters Tracked
            </Typography>
          </Box>

          <Box 
            sx={{ 
              textAlign: 'center',
              p: 4,
              minWidth: '280px',
              background: '#ffffff',
              borderRadius: 2,
              border: '2px solid #901340',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(144, 19, 64, 0.12)',
                transform: 'translateY(-2px)'
              }
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#901340', mb: 1.5, fontSize: '2.5rem' }}>
              24/7
            </Typography>
            <Typography variant="body2" sx={{ color: '#484848', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Real-time Monitoring
            </Typography>
          </Box>

          <Box 
            sx={{ 
              textAlign: 'center',
              p: 4,
              minWidth: '280px',
              background: '#ffffff',
              borderRadius: 2,
              border: '2px solid #ffcb25',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 16px rgba(255, 203, 37, 0.12)',
                transform: 'translateY(-2px)'
              }
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, color: '#ffcb25', mb: 1.5, fontSize: '2.5rem' }}>
              100%
            </Typography>
            <Typography variant="body2" sx={{ color: '#484848', fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Sustainable Water
            </Typography>
          </Box>
        </Box>
      </Box>
      </Box>
    </Box>
  );
}
