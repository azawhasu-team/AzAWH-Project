'use client';

import React, { useEffect } from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Box sx={{ p: 4, maxWidth: 560, mx: 'auto', textAlign: 'center' }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Something went wrong
      </Typography>
      <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
        This page hit an unexpected error. Your data is safe. Try again, and if it keeps
        happening, let the lab know.
      </Alert>
      <Button variant="contained" onClick={reset}>
        Try again
      </Button>
    </Box>
  );
}
