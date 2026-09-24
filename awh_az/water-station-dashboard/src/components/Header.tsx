'use client';

import { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useColorMode } from '@/lib/colorMode';

const NAV_LINKS: { label: string; href: string; prefetch?: boolean }[] = [
  { label: 'Home', href: '/' },
  { label: 'Stations', href: '/stations' },
  { label: 'Compare', href: '/compare' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  // prefetch=false — this route is gated by the admin passphrase; prefetching it while
  // unauthenticated caches Next's redirect-to-/admin/login response, which the router
  // can then reuse (stale) right after a successful login and get stuck there.
  { label: 'Admin', href: '/admin/stations', prefetch: false },
];

const WEBSITE_URL = 'https://azawh.asu.edu/';

const navButtonSx = {
  color: 'text.primary',
  textTransform: 'none',
  fontSize: '1rem',
  fontWeight: 500,
  '&:hover': {
    backgroundColor: 'rgba(144, 19, 64, 0.08)',
    color: 'primary.main',
  },
} as const;

export default function Header() {
  const router = useRouter();
  const { mode, toggleMode } = useColorMode();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSignOut = async () => {
    setDrawerOpen(false);
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const colorModeButton = (
    <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton
        onClick={toggleMode}
        size="small"
        aria-label="Toggle color mode"
        sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
      >
        {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );

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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/asu_logo.png" alt="ASU Logo" style={{ height: '40px', width: 'auto' }} />
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: '0.05em' }}
            >
              AzAWH
            </Typography>
          </Box>
        </Link>

        {/* Desktop navigation */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 2, alignItems: 'center' }}>
          {NAV_LINKS.map(({ label, href, prefetch }) => (
            <Button key={href} component={Link} href={href} prefetch={prefetch} sx={navButtonSx}>
              {label}
            </Button>
          ))}

          <Button
            component="a"
            href={WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            size="small"
            sx={{
              ml: 1,
              color: 'primary.main',
              borderColor: 'primary.main',
              textTransform: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              '&:hover': { backgroundColor: 'rgba(144, 19, 64, 0.08)', borderColor: 'primary.main' },
            }}
          >
            Visit Website
          </Button>

          {colorModeButton}

          <Button
            onClick={handleSignOut}
            size="small"
            sx={{
              ml: 1,
              color: 'text.secondary',
              textTransform: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              '&:hover': { backgroundColor: 'rgba(144, 19, 64, 0.08)', color: 'primary.main' },
            }}
          >
            Sign Out
          </Button>
        </Box>

        {/* Mobile: color toggle + menu button */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 0.5 }}>
          {colorModeButton}
          <IconButton
            edge="end"
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            sx={{ color: 'text.primary' }}
          >
            <MenuIcon />
          </IconButton>
        </Box>
      </Toolbar>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { sx: { width: 260, backgroundColor: 'background.paper' } } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
          <IconButton aria-label="Close navigation menu" onClick={() => setDrawerOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
        <List component="nav" aria-label="Main navigation">
          {NAV_LINKS.map(({ label, href, prefetch }) => (
            <ListItemButton
              key={href}
              component={Link}
              href={href}
              prefetch={prefetch}
              onClick={() => setDrawerOpen(false)}
              sx={{ py: 1.5 }}
            >
              <ListItemText primary={label} slotProps={{ primary: { sx: { fontWeight: 500 } } }} />
            </ListItemButton>
          ))}
        </List>
        <Divider />
        <List>
          <ListItemButton
            component="a"
            href={WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ py: 1.5 }}
          >
            <ListItemText primary="Visit Website" />
          </ListItemButton>
          <ListItemButton onClick={handleSignOut} sx={{ py: 1.5 }}>
            <ListItemText primary="Sign Out" slotProps={{ primary: { sx: { color: 'text.secondary' } } }} />
          </ListItemButton>
        </List>
      </Drawer>
    </AppBar>
  );
}
