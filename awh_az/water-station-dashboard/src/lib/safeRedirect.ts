// Post-login redirect targets come from a query string (?from=...), which an
// attacker controls. Only same-site paths are allowed; anything that could
// leave the site ("//evil.example", "https://...", "/\evil", embedded control
// characters) falls back to the default.
export function safeRedirectPath(from: string | null | undefined, fallback = '/'): string {
  if (!from) return fallback;
  if (!from.startsWith('/')) return fallback;
  if (from.startsWith('//') || from.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(from)) return fallback;
  // Resolve against a dummy origin: it must stay on that origin.
  try {
    const base = 'https://site.invalid';
    if (new URL(from, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return from;
}
