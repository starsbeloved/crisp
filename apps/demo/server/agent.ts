import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Local secrets live outside git; set PROVIDERS_ENV to use another file.
const DEFAULT_ENV = new URL('../.local/providers.env', import.meta.url);

/** Only the signed session URL crosses the browser boundary. Never log provider responses. */
export async function signedUrl(mode: 'checkin' | 'nurse'): Promise<string | null> {
  let file: Record<string, string | undefined> = {};
  try { file = parseEnv(readFileSync(process.env.PROVIDERS_ENV || DEFAULT_ENV, 'utf8')); } catch { /* optional */ }
  const value = (name: string) => (process.env[name] ?? file[name] ?? '').trim();
  const id = mode === 'nurse' ? value('ELEVENLABS_NURSE_AGENT_ID') || value('ELEVENLABS_AGENT_ID') : value('ELEVENLABS_AGENT_ID');
  const key = value('ELEVENLABS_API_KEY');
  if (!id || !key) return null;
  try {
    const endpoint = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');
    endpoint.searchParams.set('agent_id', id);
    const response = await fetch(endpoint, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('signed_url' in data) || typeof data.signed_url !== 'string') return null;
    const url = new URL(data.signed_url);
    return url.protocol === 'wss:' && url.hostname === 'api.elevenlabs.io' ? url.href : null;
  } catch { return null; }
}
