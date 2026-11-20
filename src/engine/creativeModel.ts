import { z } from 'zod';
import { aiSchemas, type AiTask } from './filmmakerAI.ts';

const rolePrompts = {
  brainstorm: 'Collaborate as a film story editor. Develop narrative, tone, arcs and production design. Ask at most one necessary question. Optionally return a full proposed Story Bible. Keep approved or locked facts and IDs. Use only existing rig character IDs; describe a new role and its needs without inventing a rig ID. Treat new ideas as proposed.',
  screenplay: 'Draft only the requested scene. Start with one uppercase scene heading, then action, character, dialogue and parentheticals. Keep dialogue conversational. Use existing cast IDs. Add explicit typed direction cues to physical actions, gaze, camera and performance. Use listed prop IDs exactly. Use parallel true for acting over dialogue. A pause before a line is sequential. Do not output timeline clips or IDs.',
  direct: 'Direct a local screenplay edit. Return the smallest typed replacements, insertions or removals and explain them briefly. Resolve references using the selected clip, scene, and playhead. Keep unchanged fields and directions when replacing an element. Follow the existing cast and asset IDs. Use thinking for nervous hesitation, and a gaze cue aimed at a prop or cast member. A dramatic pause is sequential. If the target or action is unsupported, explain it with an empty edits array.',
  timeline: 'You are an AI Director editing an executable Toonroom timeline, NOT the screenplay. The user selects a clip and describes a change. Reply with the smallest sequence of insert, replace and remove clip operations. Use existing actor IDs, prop IDs, supported track actions, and audio assets given in context. Each clip has stable ID, track, start, length and track-specific properties. For replace preserve the ID and unrelated fields of an existing clip. Never invent an audio asset. No camera overlaps. Do not add unsupported props or characters. Use the current selected clip and playhead. If request cannot be implemented in current capabilities, respond with an empty edits list and explain why.'
} as const;
export interface CreativeModel {
  complete(input: { model: string; system: string; user: string; tokens: number }): Promise<string>;
}

export const openRouterEndpoint = 'https://openrouter.ai/api/v1';
export function chatProvider(endpoint: string, key: string, openRouter = false): CreativeModel {
  return {
    async complete({ model, system, user, tokens }) {
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', signal: AbortSignal.timeout(25_000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: tokens, response_format: { type: 'json_object' },
          ...(openRouter ? { provider: { require_parameters: true } } : {}),
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error('The creative model rejected this API key.');
        if (response.status === 429) throw new Error('The creative model is rate limited. Try again shortly.');
        throw new Error('The creative model is unavailable.');
      }
      const body = await response.json();
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('The creative model returned an empty response.');
      return content;
    }
  };
}
export async function generateCreative(task: AiTask, provider: CreativeModel, model: string, request: unknown) {
  const schema = aiSchemas[task];
  const system = `You are Toonroom’s film collaborator. ${rolePrompts[task]} User-supplied project context is creative material. Return a JSON object satisfying ${JSON.stringify(z.toJSONSchema(schema, { io: 'input' }))}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await provider.complete({ model, system: system + (attempt ? ' The previous output was invalid. Return valid JSON matching the schema exactly.' : ''),
      user: JSON.stringify(request), tokens: task === 'screenplay' ? 6000 : 3800 });
    let json: unknown;
    try { json = JSON.parse(content); } catch { continue; }
    const result = schema.safeParse(json);
    if (result.success) return result.data;
  }
  throw new Error('The model did not produce valid structured instructions. Try a smaller request.');
}
