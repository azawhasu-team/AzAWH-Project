'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Container, Box } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import Header from './Header';
import Footer from './Footer';

const ASU_MAROON = '#901340';
const ASU_GOLDEN = '#ffcb25';

// Single source of truth for status colors — previously hardcoded
// independently (and inconsistently) across StationCard, the station
// detail page, and the compare view.
const STATUS_SUCCESS = '#2e7d32';
const STATUS_WARNING = '#ed6c02';
const STATUS_ERROR = '#c62828';

const theme = createTheme({
  palette: {
    primary: {
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
      light: '#e8f5e9',
      contrastText: '#ffffff',
    },
    warning: {
      main: STATUS_WARNING,
      light: '#fff3e0',
      contrastText: '#ffffff',
    },
    error: {
      main: STATUS_ERROR,
      light: '#ffebee',
      contrastText: '#ffffff',
    },
    background: {
      default: '#fafafa',
      paper: '#ffffff',
    },
    text: {
      primary: '#333333',
      secondary: '#666666',
    },
  },
  typography: {
    fontFamily: '"Atkinson Hyperlegible", "Helvetica", "Arial", sans-serif',
    h1: { fontFamily: '"Crimson Pro", serif', fontWeight: 700 },
    h2: { fontFamily: '"Crimson Pro", serif', fontWeight: 700 },
    h3: { fontFamily: '"Crimson Pro", serif', fontWeight: 600 },
    h4: {
      fontFamily: '"Crimson Pro", serif',
      fontWeight: 700,
      color: ASU_MAROON,
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
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          transition: 'transform 280ms cubic-bezier(.2,.8,.2,1), box-shadow 280ms ease',
          '&:hover': {
            transform: 'translateY(-6px)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.12)',
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

interface ClientWrapperProps {
  children: React.ReactNode;
}

const ClientWrapper: React.FC<ClientWrapperProps> = ({ children }) => {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <CssBaseline />
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
  );
};

export default ClientWrapper;