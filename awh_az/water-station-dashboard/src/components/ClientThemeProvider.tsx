'use client';

import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

const SUBTLE_RED = '#b8336a';
const SUBTLE_YELLOW = '#f4c430';

const theme = createTheme({
  palette: {
    primary: {
      main: SUBTLE_RED,
      light: '#d1577a',
      dark: '#7a0029',
      contrastText: '#ffffff',
    },
    secondary: {
      main: SUBTLE_YELLOW,
      light: '#f6d155',
      dark: '#c49c0e',
      contrastText: '#000000',
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
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
      color: SUBTLE_RED,
    },
    h5: {
      fontWeight: 500,
    },
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

interface ClientThemeProviderProps {
  children: React.ReactNode;
}

export default function ClientThemeProvider({ children }: ClientThemeProviderProps) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <CssBaseline />
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
}