'use client';

import { useEffect, useState } from 'react';

/** Re-render status displays so stations age from Online to Offline without a page refresh. */
export function useFreshnessClock(intervalMs = 5_000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return nowMs;
}
