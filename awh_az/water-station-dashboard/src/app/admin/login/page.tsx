'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import {
  Box,
  Card,
  Typography,
  TextField,
  Button,
  Alert,
} from '@mui/material';

function AdminLoginForm() {
  const searchParams = useSearchParams();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      });

      if (!res.ok) {
        setError('Invalid passphrase.');
        setSubmitting(false);
        return;
      }

      // Hard navigation, not router.push — the Header's nav (rendered on this
      // page too) links to /admin/stations, and Next may have prefetched that
      // link's pre-login (redirect-to-login) response before the passphrase
      // was ever submitted. router.push can reuse that stale cache entry and
      // get stuck on this page; a full navigation always re-hits the server
      // with the just-set admin cookie.
      // Restricted to a same-origin path — unlike router.push, window.location.assign
      // would actually follow an absolute/protocol-relative URL, so an unvalidated
      // `from` param would be an open redirect.
      const from = searchParams.get('from') || '';
      const redirectTo = from.startsWith('/') && !from.startsWith('//') ? from : '/admin/stations';
      window.location.assign(redirectTo);
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #fafafa 0%, #f3e4ea 100%)',
        px: 2,
      }}
    >
      <Card
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: '100%',
          maxWidth: 400,
          p: { xs: 3, sm: 5 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2.5,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            mb: 1,
          }}
        >
          <Image src="/asu_logo.png" alt="AzAWH Logo" width={56} height={56} priority />
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: '0.05em' }}
          >
            Admin Access
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
            Enter the admin passphrase to manage stations
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ width: '100%', borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          label="Admin passphrase"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          fullWidth
          autoFocus
          autoComplete="off"
        />

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          disabled={submitting}
          sx={{ py: 1.25, mt: 1 }}
        >
          {submitting ? 'Checking...' : 'Enter Admin View'}
        </Button>
      </Card>
    </Box>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
