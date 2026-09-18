'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import Header from './Header';
import Footer from './Footer';
import { ColorMode, ColorModeContext, COLOR_MODE_STORAGE_KEY } from '@/lib/colorMode';

const ASU_MAROON = '#901340';
// True red, not a pink/rose tint — #901340 itself is too dark/low-contrast
// against a near-black background, but the fix stays in the red family.
const ASU_RED_DARK_MODE = '#e5484d';
const ASU_GOLDEN = '#ffcb25';

// Single source of truth for status colors — previously hardcoded
// independently (and inconsistently) across StationCard, the station
// detail page, and the compare view.
const STATUS_SUCCESS = '#2e7d32';
const STATUS_WARNING = '#ed6c02';
const STATUS_ERROR = '#c62828';

function getTheme(mode: ColorMode) {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: isDark
        ? {
            main: ASU_RED_DARK_MODE,
            light: '#ff7a70',
            dark: '#b3261e',
            contrastText: '#2a0a0a',
          }
        : {
            main: ASU_MAROON,
            light: '#b8336a',
            dark: '#6b0029',
            contrastText: '#ffffff',
          },
      secondary: {
        main: ASU_GOLDEN,
        light: '#ffd84d',
        dark: '#d4a600',
        contrastText: '#000000',
      },
      success: {
        main: STATUS_SUCCESS,
        light: isDark ? '#1b3a1d' : '#e8f5e9',
        contrastText: '#ffffff',
      },
      warning: {
        main: STATUS_WARNING,
        light: isDark ? '#3d2a10' : '#fff3e0',
        contrastText: '#ffffff',
      },
      error: {
        main: STATUS_ERROR,
        light: isDark ? '#3a1414' : '#ffebee',
        contrastText: '#ffffff',
      },
      background: isDark
        ? { default: '#121212', paper: '#1e1e1e' }
        : { default: '#fafafa', paper: '#ffffff' },
      text: isDark
        ? { primary: '#e8e8e8', secondary: '#a8a8a8' }
        : { primary: '#333333', secondary: '#666666' },
      divider: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
    },
    typography: {
      fontFamily: '"Atkinson Hyperlegible", "Helvetica", "Arial", sans-serif',
      h1: { fontFamily: '"Crimson Pro", serif', fontWeight: 700 },
      h2: { fontFamily: '"Crimson Pro", serif', fontWeight: 700 },
      h3: { fontFamily: '"Crimson Pro", serif', fontWeight: 600 },
      h4: {
        fontFamily: '"Crimson Pro", serif',
        fontWeight: 700,
        color: isDark ? ASU_RED_DARK_MODE : ASU_MAROON,
      },
      h5: {
        fontFamily: '"Crimson Pro", serif',
        fontWeight: 600,
      },
      h6: { fontFamily: '"Crimson Pro", serif', fontWeight: 600 },
    },
    transitions: {
      duration: {
        shortest: 150,
        shorter: 200,
        short: 250,
        standard: 300,
        complex: 375,
        enteringScreen: 450,
        leavingScreen: 300,
      },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            boxShadow: isDark
              ? '0 8px 24px rgba(0,0,0,0.4)'
              : '0 8px 24px rgba(0,0,0,0.08)',
            transition: 'transform 280ms cubic-bezier(.2,.8,.2,1), box-shadow 280ms ease',
            '&:hover': {
              transform: 'translateY(-6px)',
              boxShadow: isDark
                ? '0 18px 40px rgba(0,0,0,0.55)'
                : '0 18px 40px rgba(0,0,0,0.12)',
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            textTransform: 'none',
            fontWeight: 600,
            transition: 'transform 180ms ease, box-shadow 180ms ease',
            '&:hover': {
              transform: 'translateY(-2px)',
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            padding: 8,
            transition: 'transform 240ms cubic-bezier(.2,.8,.2,1), opacity 240ms ease',
          },
        },
      },
    },
  });
}

interface ClientWrapperProps {
  children: React.ReactNode;
}

const ClientWrapper: React.FC<ClientWrapperProps> = ({ children }) => {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  // The blocking script in layout.tsx already stamped the resolved mode onto
  // <html data-color-mode> before hydration, so read it back here instead of
  // defaulting to 'light' — otherwise the first client render would mismatch
  // what was already painted and cause a flash.
  const [mode, setMode] = useState<ColorMode>(() => {
    if (typeof document !== 'undefined') {
      const attr = document.documentElement.getAttribute('data-color-mode');
      if (attr === 'dark' || attr === 'light') return attr;
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-color-mode', mode);
  }, [mode]);

  const colorMode = useMemo(
    () => ({
      mode,
      toggleMode: () => {
        setMode((prev) => {
          const next: ColorMode = prev === 'light' ? 'dark' : 'light';
          try {
            localStorage.setItem(COLOR_MODE_STORAGE_KEY, next);
          } catch {
            // localStorage unavailable (private mode, etc.) — mode still
            // switches for the current session, just doesn't persist.
          }
          return next;
        });
      },
    }),
    [mode]
  );

  const theme = useMemo(() => getTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <CssBaseline enableColorScheme />
          {isLoginPage ? (
            children
          ) : (
            <Box
              suppressHydrationWarning
              sx={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100vh',
              }}
            >
              <Header />
              <Box sx={{ flex: 1 }}>
                {children}
              </Box>
              <Footer />
            </Box>
          )}
        </LocalizationProvider>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
};

export default ClientWrapper;
