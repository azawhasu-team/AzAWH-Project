'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Card,
  Typography,
  TextField,
  Button,
  Alert,
} from '@mui/material';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        setError('Invalid username or password.');
        setSubmitting(false);
        return;
      }

      const redirectTo = searchParams.get('from') || '/';
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
          <img src="/asu_logo.png" alt="ASU Logo" style={{ height: 48, width: 'auto' }} />
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: '0.05em' }}
          >
            AzAWH
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
            Sign in to view the monitoring dashboard
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ width: '100%', borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          fullWidth
          autoFocus
          autoComplete="username"
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          autoComplete="current-password"
        />

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          disabled={submitting}
          sx={{ py: 1.25, mt: 1 }}
        >
          {submitting ? 'Signing in...' : 'Sign In'}
        </Button>
      </Card>
    </Box>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
