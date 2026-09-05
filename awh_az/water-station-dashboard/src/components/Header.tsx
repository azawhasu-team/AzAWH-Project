'use client';

import { AppBar, Toolbar, Box, Typography, Button, Link as MuiLink } from '@mui/material';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Header() {
  const router = useRouter();

  const handleSignOut = async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        backgroundColor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Toolbar
        sx={{
          justifyContent: 'space-between',
          px: { xs: 2, md: 4 },
          py: 1.5,
        }}
      >
        {/* Logo on the left */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              cursor: 'pointer',
            }}
          >
            <img
              src="/asu_logo.png"
              alt="ASU Logo"
              style={{
                height: '40px',
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
        </Link>

        {/* Navigation links on the right */}
        <Box
          sx={{
            display: 'flex',
            gap: { xs: 1, md: 2 },
            alignItems: 'center',
          }}
        >
          <Link href="/" passHref style={{ textDecoration: 'none' }}>
            <Button
              sx={{
                color: 'text.primary',
                textTransform: 'none',
                fontSize: { xs: '0.875rem', md: '1rem' },
                fontWeight: 500,
                '&:hover': {
                  backgroundColor: 'rgba(185, 51, 106, 0.08)',
                  color: 'primary.main',
                },
              }}
            >
              Home
            </Button>
          </Link>
          <Link href="/stations" passHref style={{ textDecoration: 'none' }}>
            <Button
              sx={{
                color: 'text.primary',
                textTransform: 'none',
                fontSize: { xs: '0.875rem', md: '1rem' },
                fontWeight: 500,
                '&:hover': {
                  backgroundColor: 'rgba(144, 19, 64, 0.08)',
                  color: 'primary.main',
                },
              }}
            >
              Stations
            </Button>
          </Link>
          <Link href="/compare" passHref style={{ textDecoration: 'none' }}>
            <Button
              sx={{
                color: 'text.primary',
                textTransform: 'none',
                fontSize: { xs: '0.875rem', md: '1rem' },
                fontWeight: 500,
                '&:hover': {
                  backgroundColor: 'rgba(144, 19, 64, 0.08)',
                  color: 'primary.main',
                },
              }}
            >
              Compare
            </Button>
          </Link>
          <Link href="/about" passHref style={{ textDecoration: 'none' }}>
            <Button
              sx={{
                color: 'text.primary',
                textTransform: 'none',
                fontSize: { xs: '0.875rem', md: '1rem' },
                fontWeight: 500,
                '&:hover': {
                  backgroundColor: 'rgba(144, 19, 64, 0.08)',
                  color: 'primary.main',
                },
              }}
            >
              About
            </Button>
          </Link>
          <Link href="/contact" passHref style={{ textDecoration: 'none' }}>
            <Button
              sx={{
                color: 'text.primary',
                textTransform: 'none',
                fontSize: { xs: '0.875rem', md: '1rem' },
                fontWeight: 500,
                '&:hover': {
                  backgroundColor: 'rgba(144, 19, 64, 0.08)',
                  color: 'primary.main',
                },
              }}
            >
              Contact
            </Button>
          </Link>
          
          <Link href="/admin/stations" passHref style={{ textDecoration: 'none' }}>
            <Button
              sx={{
                color: 'text.primary',
                textTransform: 'none',
                fontSize: { xs: '0.875rem', md: '1rem' },
                fontWeight: 500,
                '&:hover': {
                  backgroundColor: 'rgba(144, 19, 64, 0.08)',
                  color: 'primary.main',
                },
              }}
            >
              Admin
            </Button>
          </Link>

          <MuiLink
            href="https://azawh.asu.edu/"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              ml: { xs: 0, md: 1 },
              textDecoration: 'none',
            }}
          >
            <Button
              variant="outlined"
              size="small"
              sx={{
                color: 'primary.main',
                borderColor: 'primary.main',
                textTransform: 'none',
                fontSize: { xs: '0.75rem', md: '0.875rem' },
                fontWeight: 600,
                '&:hover': {
                  backgroundColor: 'rgba(144, 19, 64, 0.08)',
                  borderColor: 'primary.main',
                },
              }}
            >
              Visit Website
            </Button>
          </MuiLink>

          <Button
            onClick={handleSignOut}
            size="small"
            sx={{
              ml: { xs: 0, md: 1 },
              color: 'text.secondary',
              textTransform: 'none',
              fontSize: { xs: '0.75rem', md: '0.875rem' },
              fontWeight: 600,
              '&:hover': {
                backgroundColor: 'rgba(144, 19, 64, 0.08)',
                color: 'primary.main',
              },
            }}
          >
            Sign Out
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}