import { providerConfig } from './config.ts';
import { cached, timed } from './gemini.ts';

/** A null result lets the client use browser speechSynthesis. */
export async function speak(text: string, voice: 'alert' | 'crisp'): Promise<Uint8Array | null> {
  if (!text.trim()) return null;
  return cached('speak', { text, voice }, async () => {
    const start = Date.now();
    let ok = false;
    try {
      const config = providerConfig();
      const voiceId = voice === 'crisp' ? config.ELEVENLABS_CRISP_VOICE_ID || config.ELEVENLABS_VOICE_ID : config.ELEVENLABS_VOICE_ID;
      if (!config.ELEVENLABS_API_KEY || !voiceId) return null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const bytes = await timed(async signal => {
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
              method: 'POST', signal,
              headers: { 'xi-api-key': config.ELEVENLABS_API_KEY!, 'content-type': 'application/json', accept: 'audio/mpeg' },
              body: JSON.stringify({ text, model_id: config.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5' }),
            });
            if (!response.ok) {
              // Never read or log error bodies, which can echo text or account data.
              await response.body?.cancel();
              throw Object.assign(new Error('Provider unavailable'), { status: response.status });
            }
            if (!response.headers.get('content-type')?.toLowerCase().startsWith('audio/')) {
              await response.body?.cancel();
              throw new Error('Invalid audio');
            }
            const audio = new Uint8Array(await response.arrayBuffer());
            if (!audio.length) throw new Error('Empty audio');
            return audio;
          }, 2500);
          ok = true;
          return bytes;
        } catch (error) {
          const value = error as { status?: number; name?: string };
          if (attempt || !((value.status && value.status >= 500 && value.status <= 599) || value.name === 'TimeoutError' || value.name === 'AbortError')) return null;
        }
      }
      return null;
    } catch { return null; }
    finally { console.info(`provider speak ${ok ? 'ok' : 'fallback'} ${Date.now() - start}`); }
  });
}
