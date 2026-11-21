import { authorize } from '../server/authorize.js';

const MODEL = 'fish-audio/s2.1-pro-free:free';
const MAX_REQUEST = 400, MAX_AUDIO = 20 * 1024 * 1024;
const voicePattern = /^[a-zA-Z0-9_.:-]{1,120}$/;

/** Authentication and provider secrets stay exclusively on the server.
 * OpenRouter documents POST /api/v1/audio/speech with raw audio output;
 * provider-specific voice IDs must be configured or supplied explicitly.
 */
async function post(request: Request) {
  if (!await authorize(request).catch(() => false))
    return Response.json({ error: 'Sign in to generate hosted speech, or use the local voice engine.' }, { status: 401 });
  const key = process.env.OPENROUTER_API_KEY || process.env.SPEECH_API_KEY;
  if (!key) return Response.json({ error: 'Hosted voice is not configured. The local voice engine is available.' }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Send valid JSON.' }, { status: 400 }); }
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const text = input.text, voice = input.voice, voiceId = input.voiceId;
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_REQUEST)
    return Response.json({ error: 'Enter a spoken line between 1 and 400 characters.' }, { status: 400 });
  if (typeof voice !== 'string' || !['warm','bright','deep'].includes(voice))
    return Response.json({ error: 'Select a supported voice preset.' }, { status: 400 });
  if (voiceId !== undefined && (typeof voiceId !== 'string' || !voicePattern.test(voiceId)))
    return Response.json({ error: 'The hosted voice ID is invalid.' }, { status: 400 });
  const chosen = voiceId || (voice === 'bright' ? process.env.FISH_VOICE_BRIGHT : voice === 'deep' ? process.env.FISH_VOICE_DEEP : process.env.FISH_VOICE_WARM);
  if (chosen && !voicePattern.test(chosen)) return Response.json({ error: 'The configured provider voice ID is invalid.' }, { status: 503 });
  try {
    // Do not allow client control of the provider URL or model.
    const upstream = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST', signal: AbortSignal.timeout(55_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.SPEECH_MODEL || MODEL, input: text.trim(),
        ...(chosen ? { voice: chosen } : {}), response_format: 'mp3' })
    });
    if (!upstream.ok) {
      let error = 'Voice provider returned HTTP ' + upstream.status + '.';
      const details = await upstream.json().catch(() => null);
      const message = details && typeof details === 'object' && 'error' in details
        ? (typeof details.error === 'string' ? details.error : typeof details.error === 'object' &&
          details.error && 'message' in details.error ? details.error.message : undefined) : undefined;
      if (typeof message === 'string') error += ' ' + message.slice(0,250);
      return Response.json({ error }, { status: upstream.status === 429 ? 429 : 502 });
    }
    const type = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!type || !['audio/mpeg','audio/mp3','audio/wav','audio/x-wav'].includes(type))
      return Response.json({ error: 'The voice provider did not return playable MP3/WAV audio.' }, { status: 502 });
    const content = await upstream.arrayBuffer();
    if (!content.byteLength || content.byteLength > MAX_AUDIO)
      return Response.json({ error: 'The generated audio is empty or exceeds 20 MB.' }, { status: 502 });
    return new Response(content, { headers: { 'Content-Type': type === 'audio/mp3' ? 'audio/mpeg' : type,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const detail = error instanceof Error && error.name === 'TimeoutError' ? 'The voice service timed out.' : 'The voice provider is currently unavailable.';
    return Response.json({ error: detail + ' Try the local voice engine.' }, { status: 502 });
  }
}
export default { fetch(request: Request) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  return post(request);
}};
