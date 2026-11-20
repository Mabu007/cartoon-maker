import { authorize } from '../server/authorize.ts';

async function post(request: Request) {
  const key = process.env.SPEECH_API_KEY;
  if (!key) return Response.json({ error: 'Hosted speech is unavailable.' }, { status: 503 });
  try {
    if (!await authorize(request)) return Response.json({ error: 'Sign in to generate hosted speech.' }, { status: 401 });
    const { text, voice } = await request.json();
    if (typeof text !== 'string' || !text.trim() || text.length > 400) return Response.json({ error: 'Enter up to 400 characters.' }, { status: 400 });
    const endpoint = process.env.SPEECH_BASE_URL || 'https://api.openai.com/v1';
    const result = await fetch(`${endpoint.replace(/\/$/, '')}/audio/speech`, { method: 'POST', signal: AbortSignal.timeout(30_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: process.env.SPEECH_MODEL || 'tts-1', input: text.trim(), voice: voice === 'bright' ? 'nova' : voice === 'deep' ? 'onyx' : 'alloy', response_format: 'mp3' }) });
    if (!result.ok || !result.body) return Response.json({ error: 'The voice provider is unavailable.' }, { status: 502 });
    return new Response(result.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Speech generation could not be completed.' }, { status: 502 }); }
}

export default {
  fetch(request: Request) {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    return post(request);
  }
};
