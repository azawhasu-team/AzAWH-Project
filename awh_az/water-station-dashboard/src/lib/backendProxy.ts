// Server-side pass-through from the browser to the backend API. The backend is
// private (X-API-Key), and the key must never reach the browser, so browser
// code calls /api/backend/* on this app, which checks the site session and then
// forwards the request with the key attached. Pure and dependency-injected so
// it can be unit tested without a server.

/** First path segments the browser may reach. Everything else (admin, cache, docs) is refused. */
const ALLOWED_ROOTS = new Set(['stations', 'impact', 'export', 'stations-registry']);
/** The only POST route; every other allowed route is read-only. */
const POST_ROOTS = new Set(['export']);
const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept'];
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'content-length'];

export interface ProxyDeps {
  sessionOk: boolean;
  backendUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

function refuse(status: number, message: string): Response {
  return new Response(JSON.stringify({ detail: message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function forwardToBackend(
  request: Request,
  segments: string[],
  deps: ProxyDeps
): Promise<Response> {
  if (!deps.sessionOk) return refuse(401, 'Not signed in');

  const decoded = segments.map(s => {
    try {
      return decodeURIComponent(s);
    } catch {
      return null;
    }
  });
  if (
    decoded.some(s => s === null || s === '' || s === '.' || s === '..' || /[\\\u0000-\u001f]/.test(s as string))
  ) {
    return refuse(400, 'Bad path');
  }
  const root = decoded[0] as string | undefined;
  if (!root || !ALLOWED_ROOTS.has(root)) return refuse(404, 'Not found');

  const method = request.method.toUpperCase();
  const allowed = method === 'GET' || (method === 'POST' && POST_ROOTS.has(root));
  if (!allowed) return refuse(405, 'Method not allowed');

  const url = new URL(request.url);
  // Re-encode each segment: Next hands catch-all params over decoded, and a
  // station name such as "AquaPars #2 @Power Station, Tempe" would otherwise
  // be cut off at the "#" (or "?") and silently 404.
  const path = (decoded as string[]).map(encodeURIComponent).join('/');
  const target = `${deps.backendUrl.replace(/\/+$/, '')}/${path}${url.search}`;

  const headers = new Headers();
  for (const h of FORWARDED_REQUEST_HEADERS) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (deps.apiKey) headers.set('x-api-key', deps.apiKey);

  const init: RequestInit & { duplex?: 'half' } = { method, headers, cache: 'no-store' };
  if (method === 'POST') {
    init.body = request.body;
    init.duplex = 'half';
  }

  let upstream: Response;
  try {
    upstream = await (deps.fetchImpl ?? fetch)(target, init);
  } catch {
    return refuse(502, 'Backend unreachable');
  }

  // fetch() has already decoded any content-encoding, so the upstream
  // content-length/encoding no longer describe the bytes we stream back.
  const out = new Headers({ 'cache-control': 'no-store' });
  for (const h of FORWARDED_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v && !(h === 'content-length' && upstream.headers.get('content-encoding'))) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
