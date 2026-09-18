'use client';

import React, { createContext, useContext } from 'react';

export type ColorMode = 'light' | 'dark';

export const COLOR_MODE_STORAGE_KEY = 'azawh-color-mode';

interface ColorModeContextValue {
  mode: ColorMode;
  toggleMode: () => void;
}

export const ColorModeContext = createContext<ColorModeContextValue>({
  mode: 'light',
  toggleMode: () => {},
});

export function useColorMode() {
  return useContext(ColorModeContext);
}

// Read before React hydrates (inlined as a blocking <script> in layout.tsx)
// so the page never flashes the wrong theme on load.
export const COLOR_MODE_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('${COLOR_MODE_STORAGE_KEY}');
    var mode = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-color-mode', mode);
  } catch (e) {}
})();
`;
