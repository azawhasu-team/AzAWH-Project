'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const router = useRouter();
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

      const redirectTo = searchParams.get('from') || '/admin/stations';
      router.push(redirectTo);
      router.refresh();
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
