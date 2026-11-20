import { directorSchema, directorJSONSchema } from '../src/engine/directorSchema.ts';
import { authorize } from '../server/authorize.ts';

async function post(request: Request) {
  const key = process.env.DIRECTOR_API_KEY, model = process.env.DIRECTOR_MODEL;
  if (!key || !model) return Response.json({ error: 'Hosted story generation is unavailable.' }, { status: 503 });
  try {
    if (!await authorize(request)) return Response.json({ error: 'Sign in to generate a story.' }, { status: 401 });
    const { story } = await request.json();
    if (typeof story !== 'string' || story.trim().length < 5 || story.length > 2500) return Response.json({ error: 'Enter a story between 5 and 2,500 characters.' }, { status: 400 });
    const endpoint = process.env.DIRECTOR_BASE_URL || 'https://api.openai.com/v1';
    const result = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(30_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, max_tokens: 2300, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: `Direct a 30-second cartoon with 1–4 existing cast members. Output one JSON object matching this schema. Choose only IDs from the schema. Each event must fit the 30 seconds, its actor must be in the cast, and no more than eight events may be dialogue. ${JSON.stringify(directorJSONSchema)}` }, { role: 'user', content: story.trim() }] }) });
    if (!result.ok) return Response.json({ error: 'The story provider is unavailable.' }, { status: 502 });
    const body = await result.json();
    const plan = directorSchema.safeParse(JSON.parse(body.choices?.[0]?.message?.content ?? 'null'));
    if (!plan.success) return Response.json({ error: 'The director returned invalid scene instructions. Try a simpler story.' }, { status: 422 });
    return Response.json(plan.data);
  } catch { return Response.json({ error: 'Story generation could not be completed.' }, { status: 502 }); }
}

export default {
  fetch(request: Request) {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    return post(request);
  }
};
