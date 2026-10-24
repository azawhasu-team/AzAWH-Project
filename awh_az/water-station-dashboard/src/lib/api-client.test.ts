import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiClient, ApiStatusError } from './api-client';

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('apiClient errors', () => {
  it('keeps the HTTP status even when the backend sends its own message', async () => {
    vi.stubGlobal('fetch', reply(404, { detail: "No readings found for 's' in the given range" }));
    const err = await apiClient.getHourlyAggregation('s', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiStatusError);
    expect(err.status).toBe(404);
    expect(err.message).toContain('No readings found');
  });

  it('reports other failures with their status too', async () => {
    vi.stubGlobal('fetch', reply(500, {}));
    const err = await apiClient.getHourlyAggregation('s', {}).catch((e) => e);
    expect(err.status).toBe(500);
  });
});
