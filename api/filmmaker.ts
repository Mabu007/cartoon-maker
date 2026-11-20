import { z } from 'zod';
import { aiTasks } from '../src/engine/filmmakerAI.js';
import { authorize } from '../server/authorize.js';
import { connection } from '../server/creativeModel.js';
import { generateCreative } from '../src/engine/creativeModel.js';

const requestSchema = z.strictObject({ task: z.enum(aiTasks), prompt: z.string().trim().min(2).max(6000), context: z.json() });

async function post(request: Request) {
  let data: z.infer<typeof requestSchema>;
  try {
    if (!await authorize(request)) return Response.json({ error: 'Sign in to use AI filmmaking.' }, { status: 401 });
    const raw = await request.text();
    if (raw.length > 125_000) return Response.json({ error: 'Use a smaller scene or shorter project context.' }, { status: 413 });
    data = requestSchema.parse(JSON.parse(raw));
  } catch { return Response.json({ error: 'The filmmaking request could not be read or authenticated.' }, { status: 400 }); }
  const service = connection(data.task);
  if (!service) return Response.json({ error: 'The hosted filmmaking model is not configured.' }, { status: 503 });
  try {
    return Response.json(await generateCreative(data.task, service.provider, service.model, { prompt: data.prompt, context: data.context }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'AI generation failed.' }, { status: 502 });
  }
}

export const maxDuration = 60;
export default {
  fetch(request: Request) {
    return request.method === 'POST' ? post(request) : new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
};
