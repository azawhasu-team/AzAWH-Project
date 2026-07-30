export const AUTH_COOKIE = 'awh_session';

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function expectedSessionToken(): Promise<string> {
  const user = process.env.DASHBOARD_USER ?? '';
  const pass = process.env.DASHBOARD_PASSWORD ?? '';
  return sha256Hex(`${user}:${pass}`);
}

export function verifyCredentials(username: string, password: string): boolean {
  return username === process.env.DASHBOARD_USER && password === process.env.DASHBOARD_PASSWORD;
}
