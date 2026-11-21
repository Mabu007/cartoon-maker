import { analyzePCM } from '../engine/dspLipSync.ts';
self.onmessage = (event: MessageEvent<{ pcm: Float32Array; sampleRate: number }>) => {
  try { self.postMessage({ result: analyzePCM(event.data.pcm, event.data.sampleRate) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Audio analysis failed.' }); }
};
