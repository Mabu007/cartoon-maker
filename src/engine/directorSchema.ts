import { z } from 'zod';
import { actions, environments, expressions, shots } from './schema.ts';

const point = z.number().min(0).max(960);
const actor = z.enum(['sbu', 'zee', 'milo', 'tumi']);
const timing = { start: z.number().min(0).max(29.9), length: z.number().min(.1).max(30) };
export const directorSchema = z.strictObject({
  title: z.string().trim().min(1).max(100), world: z.enum(environments),
  cast: z.array(z.strictObject({ character: actor, x: point, y: z.number().min(200).max(540), mirror: z.boolean() })).min(1).max(4),
  events: z.array(z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('action'), ...timing, actor, action: z.enum(actions) }),
    z.strictObject({ type: z.literal('expression'), ...timing, actor, expression: z.enum(expressions) }),
    z.strictObject({ type: z.literal('move'), ...timing, actor, from: point, to: point }),
    z.strictObject({ type: z.literal('camera'), ...timing, actor, shot: z.enum(shots) }),
    z.strictObject({ type: z.literal('dialogue'), ...timing, actor, line: z.string().trim().min(1).max(250) })
  ])).min(1).max(40)
}).superRefine((plan, ctx) => {
  const cast = new Set(plan.cast.map(item => item.character));
  if (cast.size !== plan.cast.length) ctx.addIssue({ code: 'custom', path: ['cast'], message: 'Cast members must be unique' });
  if (plan.events.filter(event => event.type === 'dialogue').length > 8) ctx.addIssue({ code: 'custom', path: ['events'], message: 'Use at most eight spoken lines' });
  plan.events.forEach((event, index) => { if (!cast.has(event.actor) || event.start + event.length > 30.0001) ctx.addIssue({ code: 'custom', path: ['events', index], message: 'Event needs a cast member and must fit the scene' }); });
});
export const directorJSONSchema = z.toJSONSchema(directorSchema);
