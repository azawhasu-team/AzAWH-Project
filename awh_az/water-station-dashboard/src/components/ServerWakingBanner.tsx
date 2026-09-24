'use client';

import React, { useEffect, useState } from 'react';
import { Alert, CircularProgress } from '@mui/material';
import { useIsFetching } from '@tanstack/react-query';

// The API runs on a free-tier host that sleeps when idle, so the first
// request after a quiet period can take ~30s. Rather than leaving people
// staring at spinners, say so once any request has been in flight for 5s.
export default function ServerWakingBanner() {
  const isFetching = useIsFetching() > 0;
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isFetching) return;
    const t = setTimeout(() => setSlow(true), 5000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [isFetching]);

  if (!slow) return null;
  return (
    <Alert
      severity="info"
      icon={<CircleProgress />}
      sx={{ borderRadius: 0 }}
      role="status"
    >
      The data server is waking up. The first load after a quiet period can take up to
      30 seconds; after that, pages load quickly.
    </Alert>
  );
}

function CircleProgress() {
  return <CircularProgress size={18} />;
}
