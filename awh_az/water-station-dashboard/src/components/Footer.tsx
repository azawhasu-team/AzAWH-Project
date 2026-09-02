'use client';

import { Box, Container, Typography, Link as MuiLink, Divider } from '@mui/material';

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        mt: 'auto',
      }}
    >
      {/* Main footer content with black background */}
      <Box
        sx={{
          py: 4,
          px: 2,
          backgroundColor: '#000000',
          color: 'white',
        }}
      >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'center', md: 'flex-start' },
            gap: 3,
          }}
        >
          {/* Logo and Title Section */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: { xs: 'center', md: 'flex-start' },
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <img
                src="/asu_logo.png"
                alt="ASU Logo"
                style={{
                  height: '35px',
                  width: 'auto',
                }}
              />
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: 'primary.main',
                  letterSpacing: '0.05em',
                }}
              >
                AzAWH
              </Typography>
            </Box>
            <Typography
              variant="body2"
              sx={{ 
                textAlign: { xs: 'center', md: 'left' },
                color: 'rgba(255, 255, 255, 0.9)',
              }}
            >
              Atmospheric Water Harvesting
            </Typography>
            <Typography
              variant="caption"
              sx={{ 
                textAlign: { xs: 'center', md: 'left' },
                color: 'rgba(255, 203, 37, 0.9)',
                fontStyle: 'italic',
              }}
            >
              Harvesting Tomorrow's Water, Today
            </Typography>
          </Box>

          {/* Quick Links */}
          <Box
            sx={{
              display: 'flex',
              gap: 4,
              textAlign: { xs: 'center', md: 'left' },
            }}
          >
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  mb: 1.5,
                  color: '#ffcb25',
                }}
              >
                Quick Links
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <MuiLink
                  href="/"
                  underline="hover"
                  sx={{
                    fontSize: '0.875rem',
                    color: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { color: '#ffcb25' },
                  }}
                >
                  Home
                </MuiLink>
                <MuiLink
                  href="/about"
                  underline="hover"
                  sx={{
                    fontSize: '0.875rem',
                    color: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { color: '#ffcb25' },
                  }}
                >
                  About
                </MuiLink>
                <MuiLink
                  href="/contact"
                  underline="hover"
                  sx={{
                    fontSize: '0.875rem',
                    color: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { color: '#ffcb25' },
                  }}
                >
                  Contact
                </MuiLink>
              </Box>
            </Box>

            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  mb: 1.5,
                  color: '#ffcb25',
                }}
              >
                Resources
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <MuiLink
                  href="#"
                  underline="hover"
                  sx={{
                    fontSize: '0.875rem',
                    color: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { color: '#ffcb25' },
                  }}
                >
                  Documentation
                </MuiLink>
                <MuiLink
                  href="#"
                  underline="hover"
                  sx={{
                    fontSize: '0.875rem',
                    color: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { color: '#ffcb25' },
                  }}
                >
                  Support
                </MuiLink>
                <MuiLink
                  href="#"
                  underline="hover"
                  sx={{
                    fontSize: '0.875rem',
                    color: 'rgba(255, 255, 255, 0.8)',
                    '&:hover': { color: '#ffcb25' },
                  }}
                >
                  Privacy Policy
                </MuiLink>
              </Box>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 3, borderColor: 'rgba(255, 203, 37, 0.3)' }} />
      </Container>
      </Box>

      {/* Copyright section with yellow background */}
      <Box
        sx={{
          py: 2,
          px: 2,
          backgroundColor: '#ffcb25',
        }}
      >
        <Typography
          variant="body2"
          align="center"
          sx={{ 
            fontSize: '0.875rem',
            color: '#000000',
            fontWeight: 500,
          }}
        >
          © {new Date().getFullYear()} Arizona State University. All rights reserved.
        </Typography>
      </Box>
    </Box>
  );
}
