import { readFileSync } from 'node:fs';

// Local secrets live outside git; set PROVIDERS_ENV to use another file.
const DEFAULT_ENV = new URL('../.local/providers.env', import.meta.url);

export function providerVariables(): Record<string, string> {
  let source = '';
  try { source = readFileSync(process.env.PROVIDERS_ENV || DEFAULT_ENV, 'utf8'); } catch { /* optional */ }
  const values: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return values;
}

export function providerStatus(): { gemini: boolean; elevenlabs: boolean; agent: boolean } {
  const values = providerVariables();
  return {
    gemini: Boolean(values.GEMINI_API_KEY),
    elevenlabs: Boolean(values.ELEVENLABS_API_KEY && values.ELEVENLABS_VOICE_ID),
    agent: Boolean(values.ELEVENLABS_AGENT_ID),
  };
}
