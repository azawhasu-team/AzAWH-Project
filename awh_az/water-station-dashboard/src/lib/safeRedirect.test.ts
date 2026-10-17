import { describe, it, expect } from 'vitest';
import { safeRedirectPath } from './safeRedirect';

describe('safeRedirectPath', () => {
  it('allows ordinary same-site paths, with query and hash', () => {
    expect(safeRedirectPath('/stations/testbed-1')).toBe('/stations/testbed-1');
    expect(safeRedirectPath('/compare?x=1#top')).toBe('/compare?x=1#top');
  });

  it.each([
    'https://evil.example',
    'http://evil.example/path',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'evil.example',
    '/ok\nhttps://evil.example',
    '/ok\r\nSet-Cookie: x=1',
    '',
  ])('rejects %j', (bad) => {
    expect(safeRedirectPath(bad)).toBe('/');
  });

  it('falls back for null/undefined and honours a custom fallback', () => {
    expect(safeRedirectPath(null)).toBe('/');
    expect(safeRedirectPath(undefined, '/stations')).toBe('/stations');
  });
});
