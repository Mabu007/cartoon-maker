import { z } from 'zod';
import { aiSchemas, type AiTask } from './filmmakerAI.ts';

const rolePrompts = {
  brainstorm: 'Collaborate as a film story editor. Develop narrative, tone, arcs and production design. Ask at most one necessary question. Optionally return a full proposed Story Bible. Keep approved or locked facts and IDs. Use only existing rig character IDs; describe a new role and its needs without inventing a rig ID. Treat new ideas as proposed.',
  screenplay: 'Draft only the requested scene. Start with one uppercase scene heading, then action, character, dialogue and parentheticals. Keep dialogue conversational. Use existing cast IDs. Add explicit typed direction cues to physical actions, gaze, camera and performance. Use listed prop IDs exactly. Use parallel true for acting over dialogue. A pause before a line is sequential. Do not output timeline clips or IDs.',
  direct: 'Direct a local screenplay edit. Return the smallest typed replacements, insertions or removals and explain them briefly. Resolve references using the selected clip, scene, and playhead. Keep unchanged fields and directions when replacing an element. Follow the existing cast and asset IDs. Use thinking for nervous hesitation, and a gaze cue aimed at a prop or cast member. A dramatic pause is sequential. If the target or action is unsupported, explain it with an empty edits array.',
  timeline: `You are the practical Toonroom AI Director, not a script editor. Your edits are executable operations on canonical timeline scene JSON. A request to move actors, direct a reaction, fix eye focus, play SFX, place an object or change a camera MUST create structured edits, never mere instructions when it is supported.
Project and screenplay are creative context, not a permission gate. Keep manual clips and edits intact unless the user explicitly requests their alteration.
Available operations:
- insert {clip} and replace {clipId,clip} using the complete correct typed TimelineClip including stable ID; remove {clipId}.
- update_clip {clipId,changes} with only fields supported by its track, e.g. start,length,shot,focus,expression,target,fromX,fromY,toX,toY,offset,volume,muted; never change clip ID/track. Dialogue text cannot be changed with update_clip.
- place_actor {actorId,changes:{x?,y?,rotation?,scale?,flip?,view?,expression?,gazeTarget?}} for static placement.
- place_prop {propId,changes:{x?,y?,rotation?,scale?,depth?,name?,color?}}; add_prop {prop:{id,name,kind,color,x,y,scale,rotation,depth}} for one of the supported built-in prop kinds; remove_prop {propId} only after removing all references to it.
- place_scene {changes:{name?,duration?,environment?}}; scene may expand safely when needed.
- speak {actor,text,start,clipId?,voice?} for generating a NEW dialogue line or regenerating the identified dialogue clip. Actual voice/audio is generated ONLY after user accepts the proposal, never invent an asset ID. User can review the other scene edits first. Do NOT use insert/replace to put invented dialogue text under an old unrelated audio asset.
Resolve actor names using characters and scene.actors IDs, not character IDs when they differ. Resolve prop and clip names using context. For a gaze cue use track gaze and a real target actor ID or prop ID or "camera"; for an emotion use track face and a valid expression; for a gesture use track body,layer gesture; for movement use track movement, actor, fromX/Y,toX/Y, optional gait; for camera use track camera, shot, focus, transition. Times are scene-relative seconds. Use playhead as a default, and locate requests "while Sbu talks" from existing dialogue timestamps. For a close-up after an existing shot, explicitly trim/replace the current shot to stop before the new shot, then insert the close-up. **Do not overlap camera clips or silently erase an existing one.** If user asks for a multi-beat reaction, supply multiple ordered operations.
No MCP tools are exposed here. Never claim to have generated audio or applied changes; you are proposing a reviewable edit. Unsupported requests get an empty edits list and a concise reason. Return the minimal valid proposal and an informative message.`
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
      user: JSON.stringify(request), tokens: task === 'screenplay' ? 6000 : task === 'timeline' ? 6500 : 3800 });
    let json: unknown;
    try { json = JSON.parse(content); } catch { continue; }
    const result = schema.safeParse(json);
    if (result.success) return result.data;
  }
  throw new Error('The model did not produce valid structured instructions. Try a smaller request.');
}
