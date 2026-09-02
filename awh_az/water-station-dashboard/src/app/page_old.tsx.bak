'use client';

import React from 'react';
import { Typography, Box, Fade, Link as MuiLink } from '@mui/material';
import StationCard from '@/components/StationCard';
import { stations } from '@/data/constants';

export default function Home() {
  return (
    <Box>
      {/* Hero Section - Full Page */}
      <Box
        sx={{
          position: 'relative',
          height: 'calc(100vh - 80px)',
          minHeight: '600px',
          width: '100vw',
          marginLeft: 'calc(-50vw + 50%)',
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
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 4, maxWidth: '1400px', mx: 'auto' }}>
        <Typography 
          variant="h4" 
          component="h2" 
          gutterBottom
          sx={{ 
            mb: 2,
            fontWeight: 600,
            color: 'primary.main',
            textAlign: 'center'
          }}
        >
          Our Stations
        </Typography>

        <Box sx={{ mb: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
            Total Stations: {stations.length} | 
            Online: {stations.filter(s => s.status === 'Online').length} | 
            Offline: {stations.filter(s => s.status === 'Offline').length}
          </Typography>
        </Box>
      
      <Typography 
        variant="h6" 
        component="h2" 
        color="text.secondary"
        sx={{ 
          textAlign: 'center', 
          mb: { xs: 4, sm: 5, md: 6 },
          fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' },
          px: { xs: 2, sm: 1, md: 0 },
          color: '#666666'
        }}
      >
        Monitor and manage water stations across all regions
      </Typography>

      <Box 
        sx={{ 
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',                    // Mobile: 1 column
            sm: 'repeat(2, 1fr)',         // Small tablet: 2 columns
            md: 'repeat(2, 1fr)',         // Medium: 2 columns
            lg: 'repeat(4, 1fr)',         // Desktop: 4 columns
          },
          gap: 3,
          justifyItems: 'center',
        }}
      >
        {stations.map((station, index) => (
          <Fade key={station.id} in={true} timeout={500 + index * 100}>
            <Box sx={{ width: '100%', maxWidth: '380px', display: 'flex' }}>
              <StationCard station={station} />
            </Box>
          </Fade>
        ))}
      </Box>
      </Box>

      {/* Technology & Research Section */}
      <Box 
        sx={{ 
          py: 8, 
          px: { xs: 2, sm: 3, md: 4 },
          background: 'linear-gradient(180deg, #f5f5f5 0%, #ffffff 100%)',
        }}
      >
        <Box sx={{ maxWidth: '1200px', mx: 'auto' }}>
          <Fade in={true} timeout={800}>
            <div>
              {/* Section Title */}
              <Typography 
                variant="h4" 
                component="h2" 
                gutterBottom
                sx={{ 
                  mb: 2,
                  fontWeight: 700,
                  color: '#901340',
                  textAlign: 'center'
                }}
              >
                Atmospheric Water Harvesting Technology
              </Typography>
              
              <Typography 
                variant="h6" 
                color="text.secondary"
                sx={{ 
                  textAlign: 'center', 
                  mb: 6,
                  maxWidth: '800px',
                  mx: 'auto',
                  lineHeight: 1.6
                }}
              >
                Pioneering research in sustainable water solutions for Arizona's future
              </Typography>

              {/* Content Grid */}
              <Box 
                sx={{ 
                  display: 'flex',
                  flexDirection: { xs: 'column', md: 'row' },
                  gap: 4,
                  mb: 4
                }}
              >
                {/* Left Column - Mission */}
                <Box sx={{ flex: 1 }}>
                  <Box
                    sx={{
                      p: 4,
                      height: '100%',
                      background: 'rgba(255, 255, 255, 0.9)',
                      backdropFilter: 'blur(10px)',
                      borderRadius: 3,
                      border: '2px solid #1e88e5',
                      boxShadow: '0 4px 20px rgba(30, 136, 229, 0.15)',
                    }}
                  >
                    <Typography 
                      variant="h5" 
                      sx={{ 
                        fontWeight: 600, 
                        color: '#1e88e5',
                        mb: 2 
                      }}
                    >
                      Our Mission
                    </Typography>
                    <Typography 
                      variant="body1" 
                      sx={{ 
                        lineHeight: 1.8,
                        color: 'text.primary',
                        mb: 2
                      }}
                    >
                      The Arizona Atmospheric Water Harvesting (AzAWH) project represents a groundbreaking approach to addressing water scarcity in arid regions. By extracting water directly from the atmosphere, we're developing sustainable solutions for one of the Southwest's most critical challenges.
                    </Typography>
                    <Typography 
                      variant="body1" 
                      sx={{ 
                        lineHeight: 1.8,
                        color: 'text.primary'
                      }}
                    >
                      Our testbeds monitor environmental conditions, water production efficiency, and energy consumption across diverse Arizona climate zones, providing invaluable data for optimizing AWH technology.
                    </Typography>
                  </Box>
                </Box>

                {/* Right Column - Research Partnerships */}
                <Box sx={{ flex: 1 }}>
                  <Box
                    sx={{
                      p: 4,
                      height: '100%',
                      background: 'rgba(255, 255, 255, 0.9)',
                      backdropFilter: 'blur(10px)',
                      borderRadius: 3,
                      border: '2px solid #901340',
                      boxShadow: '0 4px 20px rgba(144, 19, 64, 0.15)',
                    }}
                  >
                    <Typography 
                      variant="h5" 
                      sx={{ 
                        fontWeight: 600, 
                        color: '#901340',
                        mb: 3 
                      }}
                    >
                      Research Partnerships
                    </Typography>
                    
                    <Box sx={{ mb: 3 }}>
                      <Typography 
                        variant="subtitle1" 
                        sx={{ 
                          fontWeight: 600,
                          color: '#1e88e5',
                          mb: 1
                        }}
                      >
                        Arizona State University
                      </Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          lineHeight: 1.6,
                          color: 'text.secondary'
                        }}
                      >
                        Leading academic research and innovation in atmospheric water harvesting technology and sustainable water resource management.
                      </Typography>
                    </Box>

                    <Box sx={{ mb: 3 }}>
                      <Typography 
                        variant="subtitle1" 
                        sx={{ 
                          fontWeight: 600,
                          color: '#1e88e5',
                          mb: 1
                        }}
                      >
                        Salt River Project (SRP)
                      </Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          lineHeight: 1.6,
                          color: 'text.secondary'
                        }}
                      >
                        Collaborative industrial-scale testing to explore AWH integration with existing water and power infrastructure.
                      </Typography>
                    </Box>

                    <Box>
                      <Typography 
                        variant="subtitle1" 
                        sx={{ 
                          fontWeight: 600,
                          color: '#1e88e5',
                          mb: 1
                        }}
                      >
                        Climate Adaptation Research
                      </Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          lineHeight: 1.6,
                          color: 'text.secondary'
                        }}
                      >
                        Developing data-driven insights to support climate resilience and water security strategies for the Southwest region.
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>

              {/* Stats Row */}
              <Box 
                sx={{ 
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    md: 'repeat(4, 1fr)'
                  },
                  gap: 3,
                  mt: 2
                }}
              >
                <Box 
                    sx={{ 
                      textAlign: 'center',
                      p: 3,
                      background: 'rgba(30, 136, 229, 0.05)',
                      borderRadius: 2,
                      border: '1px solid rgba(30, 136, 229, 0.2)'
                    }}
                  >
                    <Typography variant="h3" sx={{ fontWeight: 700, color: '#1e88e5', mb: 1 }}>
                      {stations.length}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                      Active Stations
                    </Typography>
                  </Box>
                </Box>
                
                <Box 
                    sx={{ 
                      textAlign: 'center',
                      p: 3,
                      background: 'rgba(144, 19, 64, 0.05)',
                      borderRadius: 2,
                      border: '1px solid rgba(144, 19, 64, 0.2)'
                    }}
                  >
                    <Typography variant="h3" sx={{ fontWeight: 700, color: '#901340', mb: 1 }}>
                      12+
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                      Parameters Tracked
                    </Typography>
                  </Box>
                </Box>

                <Box 
                    sx={{ 
                      textAlign: 'center',
                      p: 3,
                      background: 'rgba(30, 136, 229, 0.05)',
                      borderRadius: 2,
                      border: '1px solid rgba(30, 136, 229, 0.2)'
                    }}
                  >
                    <Typography variant="h3" sx={{ fontWeight: 700, color: '#1e88e5', mb: 1 }}>
                      24/7
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                      Real-time Monitoring
                    </Typography>
                  </Box>
                </Box>

                <Box 
                    sx={{ 
                      textAlign: 'center',
                      p: 3,
                      background: 'rgba(144, 19, 64, 0.05)',
                      borderRadius: 2,
                      border: '1px solid rgba(144, 19, 64, 0.2)'
                    }}
                  >
                    <Typography variant="h3" sx={{ fontWeight: 700, color: '#901340', mb: 1 }}>
                      100%
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                      Sustainable Water
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </div>
          </Fade>
        </Box>
      </Box>
    </Box>
  );
}
