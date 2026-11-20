import { chatProvider, generateCreative, openRouterEndpoint } from '../engine/creativeModel.ts';
import { aiSchemas, type AiTask } from '../engine/filmmakerAI.ts';
import { audioLength, putAudio } from './audio.ts';
import { analyzeLipSync } from './lipSync.ts';
import type { Clip } from '../engine/schema.ts';
import type { Account } from './cloud.ts';
import { uid } from '../engine/schema.ts';
import type { SpeechProvider } from './speech.ts';
import type { z } from 'zod';

export type AiAccess = { account: Account | null; personal: { key: string; model: string } | null };
export const canUseAI = (access: AiAccess) => Boolean(access.account || access.personal);

export async function filmmaker<T extends AiTask>(access: AiAccess, task: T, prompt: string, context: unknown): Promise<z.infer<typeof aiSchemas[T]>> {
  if (access.personal) {
    const { key, model } = access.personal;
    return aiSchemas[task].parse(await generateCreative(task, chatProvider(openRouterEndpoint, key, true), model, { prompt, context })) as z.infer<typeof aiSchemas[T]>;
  }
  const { account } = access;
  if (!account) throw new Error('Connect an AI model first.');
  const response = await fetch('/api/filmmaker', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await account.getIdToken()}` },
    body: JSON.stringify({ task, prompt, context }), signal: AbortSignal.timeout(65_000)
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error ?? 'Hosted AI is unavailable.');
  return aiSchemas[task].parse(value) as z.infer<typeof aiSchemas[T]>;
}

type Dialogue = Extract<Clip,{track:'dialogue'}>;
export function renderSpeech(speech: SpeechProvider, getToken?: () => Promise<string>) {
  const cache = new Map<string, Promise<{ asset: `asset:${string}`; seconds: number;
    visemes: NonNullable<Dialogue['visemes']>; lipSync:NonNullable<Dialogue['lipSync']> }>>();
  return (text: string, voice: string) => {
    const key = JSON.stringify([voice, text]);
    const prior = cache.get(key);
    if (prior) return prior;
    const request = (async () => {
      const blob = await speech.synthesize(text, voice);
      const seconds = await audioLength(blob);
      const aligned = await analyzeLipSync(blob,text,seconds,{
        token: await getToken?.().catch(()=>undefined)
      });
      const id = uid();
      await putAudio(id, blob);
      return { asset: `asset:${id}` as const, seconds, visemes:aligned.cues,
        lipSync:{source:aligned.source,engine:aligned.engine,
          ...(aligned.cacheKey?{cacheKey:aligned.cacheKey}:{}),analyzedDuration:aligned.analyzedDuration} };
    })();
    cache.set(key, request);
    request.catch(()=>{if(cache.get(key)===request)cache.delete(key);});
    return request;
  };
}
