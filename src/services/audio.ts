import { shiftVoice } from '../engine/voiceEffects.ts';
import { soundDurations, type SoundName } from '../engine/performanceCatalog.ts';
import { clamp } from '../engine/animation.ts';
import { builtinVoiceNames, soundNames, type Project, type Scene, type SoundClip } from '../engine/schema.ts';
import { applyGainEnvelope, audibleAudioTrack } from '../engine/audioMix.ts';

const builtinVoices = new Set<string>(builtinVoiceNames);
const soundTypes = new Set<string>(soundNames);
let database: Promise<IDBDatabase> | undefined;
function audioDatabase() {
  database ??= new Promise((resolve, reject) => {
    const open = indexedDB.open('toonroom-audio', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('sounds');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => { database = undefined; reject(open.error); };
  });
  return database;
}
export async function putAudio(id: string, file: Blob) {
  const db = await audioDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('sounds', 'readwrite');
    transaction.objectStore('sounds').put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('Could not save audio'));
  });
}
export async function getAudio(id: string) {
  const db = await audioDatabase();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction('sounds').objectStore('sounds').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function effect(context: BaseAudioContext, name: SoundName) {
  const duration = soundDurations[name];
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 17128;
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate;
    const remaining = 1 - t / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed / 0xffffffff) * 2 - 1;
    const phase=(hz:number)=>Math.sin(t*hz*Math.PI*2);
    if(name==='cartoon-boom'||name==='impact-thud'||name==='dance-kick'||name==='footstep')
      data[i]=(.67*Math.sin(2*Math.PI*(68*t+1.8*(1-Math.exp(-t*55))))+.26*noise*Math.exp(-t*20))*Math.exp(-t*(name==='cartoon-boom'?8:20));
    else if(name==='swing-swish'||name==='crowd-cheer')
      data[i]=noise*Math.sin(Math.PI*t/duration)**2*.28*(name==='crowd-cheer'?(.8+.2*phase(17)):1);
    else if(name==='punch-pop'||name==='dance-clap'||name==='short-drum-roll') {
      const beat=name==='short-drum-roll'?t%.074:t;
      data[i]=(noise*.6+phase(138)*.25)*Math.exp(-beat*64)*remaining;
    } else if(name==='comedy-boing'||name==='slide-whistle') {
      const hz=name==='comedy-boing'?280+160*Math.exp(-t*5)*phase(11):280+t*1400;
      data[i]=Math.sin(2*Math.PI*t*hz)*.5*remaining;
    } else if(name==='record-scratch')data[i]=(noise*.35+phase(113+phase(6)*28)*.29)*remaining**2;
    else if(name==='sparkle-chime'||name==='dramatic-hit'||name==='funny-sting'||name==='sad-trombone'){
      const interval=duration/(name==='sad-trombone'?4:3);
      const note=Math.floor(t/interval), age=t%interval;
      const hz=name==='sad-trombone'?[190,179,168,141][note]??141
        :name==='sparkle-chime'?[880,1174,1568][note]??1568
        :name==='dramatic-hit'?[108,76,57][note]??57:[330,494,185][note]??185;
      data[i]=(Math.sin(age*hz*2*Math.PI)*.36+Math.sin(age*hz*4*Math.PI)*.16)*Math.min(1,age*180)*Math.exp(-age/interval*3);
    } else if (name === 'whoosh') data[i] = noise * Math.sin(Math.PI * t / duration) ** 2 * .3;
    else if (name === 'rimshot') data[i] = (noise * .55 + Math.sin(t * 721) * .45) * (Math.exp(-t * 65) + (t > .12 ? .6 * Math.exp(-(t - .12) * 35) : 0));
    else {
      const hz = name === 'pop' ? 530 - t * 1600 : name === 'ding' ? 740 : t > .15 ? 275 : 410;
      data[i] = (Math.sin(t * hz * Math.PI * 2) * .43 + Math.sin(t * hz * 1.51 * Math.PI * 2) * .11) * remaining ** 3;
    }
    data[i] *= Math.min(1, t * 120);
  }
  return buffer;
}
type DecodedSound = { buffer: AudioBuffer; envelope: Float32Array };
const decoders = new Map<string, Promise<DecodedSound>>();
let decoderContext: OfflineAudioContext | undefined;
let remoteAudio: ((id: string) => Promise<Blob | undefined>) | undefined;
export function setRemoteAudio(loader?: (id: string) => Promise<Blob | undefined>) { remoteAudio = loader; }
export async function getOrFetchAudio(id: string) {
  const local = await getAudio(id);
  if (local || !remoteAudio) return local;
  const remote = await remoteAudio(id);
  if (remote) await putAudio(id, remote).catch(() => {});
  return remote;
}
function envelope(buffer: AudioBuffer) {
  const windowSize = Math.floor(buffer.sampleRate / 50);
  const result = new Float32Array(Math.ceil(buffer.length / windowSize));
  const pcm = buffer.getChannelData(0);
  let previous = 0;
  for (let i = 0; i < result.length; i++) {
    let energy = 0, count = 0;
    for (let n = i * windowSize; n < Math.min(pcm.length, (i + 1) * windowSize); n += 4) { energy += pcm[n] ** 2; count++; }
    const amplitude = clamp(Math.sqrt(energy / Math.max(count, 1)) * 5.6);
    previous = previous * .34 + amplitude * .66;
    result[i] = previous;
  }
  return result;
}
async function readSound(asset: string) {
  let pending = decoders.get(asset);
  if (!pending) {
    pending = (async () => {
      // Decode once at the movie mix rate, independent of the output device.
      const context = decoderContext ??= new OfflineAudioContext(2, 1, 48000);
      const name = asset.split(':')[1];
      let buffer: AudioBuffer;
      if (asset.startsWith('builtin:') && soundTypes.has(name)) buffer = effect(context, name as SoundName);
      else if (asset.startsWith('builtin:') && builtinVoices.has(name)) {
        const response = await fetch(`/audio/${name}.mp3`);
        if (!response.ok) throw new Error(`Could not load audio “${name}”`);
        buffer = await context.decodeAudioData(await response.arrayBuffer());
      } else {
        const blob = asset.startsWith('asset:') ? await getOrFetchAudio(name) : undefined;
        if (!blob) throw new Error(`Audio file is missing (${name}). Reattach the original file.`);
        buffer = await context.decodeAudioData(await blob.arrayBuffer());
      }
      return { buffer, envelope: envelope(buffer) };
    })();
    decoders.set(asset, pending);
    if (decoders.size > 48) decoders.delete(decoders.keys().next().value!);
    pending.catch(() => { if (decoders.get(asset) === pending) decoders.delete(asset); });
  }
  return pending;
}

// Cache by decoded source and pitch. EQ remains live and never duplicates PCM.
const pitched = new WeakMap<AudioBuffer, Map<number,AudioBuffer>>();
function clipBuffer(context:BaseAudioContext,buffer:AudioBuffer,clip:SoundClip) {
  const pitch=clip.track==='dialogue'?clip.voiceEffect?.pitch??0:0;
  if(!pitch)return buffer;
  let cache=pitched.get(buffer);
  if(!cache){cache=new Map();pitched.set(buffer,cache);}
  const entry=cache.get(pitch);
  if(entry)return entry;
  const source=Array.from({length:buffer.numberOfChannels},(_,channel)=>buffer.getChannelData(channel));
  const shifted=shiftVoice(source,buffer.sampleRate,pitch);
  const result=context.createBuffer(shifted.length,buffer.length,buffer.sampleRate);
  shifted.forEach((channel,index)=>result.getChannelData(index).set(channel));
  if(cache.size>=2)cache.delete(cache.keys().next().value!);
  cache.set(pitch,result);
  return result;
}
function wireClip(context:BaseAudioContext,source:AudioBufferSourceNode,gain:GainNode,clip:SoundClip) {
  const nodes:AudioNode[]=[source];
  const voice=clip.track==='dialogue'?clip.voiceEffect:undefined;
  if(voice){
    for(const [type,frequency,value] of [['lowshelf',200,voice.bass],['highshelf',2600,voice.clarity]] as const){
      if(!value)continue;
      const filter=context.createBiquadFilter();
      filter.type=type;filter.frequency.value=frequency;filter.gain.value=value;
      nodes.at(-1)!.connect(filter);nodes.push(filter);
    }
  }
  nodes.at(-1)!.connect(gain);
  return ()=>[...nodes,gain].forEach(node=>node.disconnect());
}
let audition: { stop:()=>void } | undefined;
let auditionToken=0;
export function stopSoundPreview(){auditionToken++;audition?.stop();audition=undefined;}
export function previewSound(name:SoundName) {
  return auditionClip({ id:'audition',track:'audio',start:0,length:soundDurations[name],name,asset:'builtin:'+name,volume:.45,muted:false,offset:0 });
}
export async function auditionClip(clip:SoundClip) {
  stopSoundPreview();
  const token=++auditionToken;
  const context=new AudioContext();
  try {
    await context.resume();
    const {buffer}=await readSound(clip.asset);
    if(token!==auditionToken){await context.close();return;}
    const playback=soundPlayback(clip,0,buffer.duration);
    if(!playback){await context.close();return;}
    const source=context.createBufferSource(), gain=context.createGain();
    source.buffer=clipBuffer(context,buffer,clip);
    source.loop=Boolean(clip.loop);
    const detach=wireClip(context,source,gain,clip);
    gain.connect(context.destination);
    const when=context.currentTime+.025;
    applyGainEnvelope(gain,clip,0,0,playback.duration,when,0);
    const close=()=>{detach();if(context.state!=='closed')void context.close().catch(()=>{});};
    audition={stop:()=>{source.onended=null;source.stop();close();}};
    source.onended=()=>{if(auditionToken===token)audition=undefined;close();};
    source.start(when,playback.offset,playback.duration);
  } catch(error) {
    if(context.state!=='closed')void context.close().catch(()=>{});
    throw error;
  }
}
export const sceneSounds = (scene: Scene) => scene.clips.filter((clip): clip is SoundClip => clip.track === 'dialogue' || clip.track === 'audio' || clip.track === 'music');
export const projectAssets = (project: Project) => [...new Set(project.scenes.flatMap(scene =>
  sceneSounds(scene).flatMap(clip => [clip.asset, ...(clip.track === 'dialogue' ? (clip.versions ?? []).map(item => item.asset) : [])])
).filter(asset => asset.startsWith('asset:')).map(asset => asset.slice(6)))];
export function soundEvents(scenes: Scene[]) {
  let sceneStart = 0;
  return scenes.flatMap(scene => {
    const start = sceneStart;
    sceneStart += scene.duration;
    return sceneSounds(scene).filter(clip => !clip.muted && audibleAudioTrack(scene,clip.track))
      .map(clip => ({ clip, position: start + clip.start }));
  });
}
export function soundPlayback(clip: SoundClip, position: number, bufferDuration: number, cursor = 0) {
  const skip = Math.max(0, cursor - position);
  const offset = clip.offset + skip;
  const duration = clip.loop ? clip.length-skip : Math.min(clip.length - skip, bufferDuration - offset);
  return duration > 0 && bufferDuration > 0 ? { delay: Math.max(0, position - cursor),
    offset: clip.loop ? offset % bufferDuration : offset, duration } : undefined;
}

export function dialogueAmplitude(scene: Scene, actor: string, time: number, envelopeFor: (asset: string) => Float32Array | undefined) {
  let value = 0;
  for (const clip of scene.clips) {
    if (clip.track !== 'dialogue' || !audibleAudioTrack(scene,'dialogue') || clip.actor !== actor || clip.muted || time < clip.start || time >= clip.start + clip.length) continue;
    const frame = Math.floor((time - clip.start + clip.offset) * 50);
    value = Math.max(value, (envelopeFor(clip.asset)?.[frame] ?? 0) * Math.min(1, clip.volume));
  }
  return value;
}
export async function prepareDialoguePreview(scene: Scene) {
  const envelopes = new Map<string, Float32Array>();
  const assets = new Set(scene.clips.flatMap(clip => clip.track === 'dialogue' && !clip.muted && audibleAudioTrack(scene,'dialogue') ? [clip.asset] : []));
  await Promise.allSettled([...assets].map(async asset => { envelopes.set(asset, (await readSound(asset)).envelope); }));
  return (actor: string, time: number) => dialogueAmplitude(scene, actor, time, asset => envelopes.get(asset));
}

export function createAudioMixer() {
  const context = new AudioContext();
  const master = context.createGain();
  const limiter = context.createDynamicsCompressor();
  master.connect(limiter);
  const prepared = new Map<string, DecodedSound>();
  const voiceBuffers=new Map<string,AudioBuffer>();
  let sources: {source:AudioBufferSourceNode;detach:()=>void}[] = [];
  let monitoring = false;
  function monitor() { if (!monitoring) { limiter.connect(context.destination); monitoring = true; } }
  function stop() { for (const {source,detach} of sources) { source.onended=null;try { source.stop(); } catch { /* already ended */ } detach(); } sources = []; }
  async function prepare(scenes: Scene[]) {
    const events=soundEvents(scenes);
    const assets=new Set(events.map(event=>event.clip.asset));
    await Promise.all([...assets].map(async asset => { prepared.set(asset, await readSound(asset)); }));
    voiceBuffers.clear();
    for(const {clip} of events){
      if(clip.track!=='dialogue'||!clip.voiceEffect?.pitch)continue;
      const key=clip.asset+'/'+clip.voiceEffect.pitch;
      const audio=prepared.get(clip.asset);
      if(audio&&!voiceBuffers.has(key))voiceBuffers.set(key,clipBuffer(context,audio.buffer,clip));
    }
    for(const asset of prepared.keys())if(!assets.has(asset))prepared.delete(asset);
  }
  function schedule(scenes: Scene[], offset: number, when = context.currentTime) {
    stop();
    const events = soundEvents(scenes);
    const dialogue = events.filter(event=>event.clip.track==='dialogue').map(event=>({
      start:event.position,end:event.position+event.clip.length }));
    for (const { clip, position } of events) {
      const audio = prepared.get(clip.asset);
      if (!audio) continue;
      const playback = soundPlayback(clip, position, audio.buffer.duration, offset);
      if (!playback) continue;
      const source = context.createBufferSource(), gain = context.createGain();
      const voiceKey=clip.track==='dialogue'?clip.asset+'/'+(clip.voiceEffect?.pitch??0):'';
      source.buffer = voiceBuffers.get(voiceKey)??audio.buffer;
      if(clip.loop){source.loop=true;source.loopStart=0;source.loopEnd=audio.buffer.duration;}
      const detach=wireClip(context,source,gain,clip);gain.connect(master);
      const start=Math.max(position,offset), end=start+playback.duration;
      applyGainEnvelope(gain,clip,position,start,end,when,offset,dialogue);
      source.onended = () => { detach(); sources=sources.filter(item=>item.source!==source); };
      source.start(when + playback.delay, playback.offset, playback.duration);
      sources.push({source,detach});
    }
  }
  function amplitude(scene: Scene, actor: string, time: number) {
    return dialogueAmplitude(scene, actor, time, asset => prepared.get(asset)?.envelope);
  }
  return { context, master, output: limiter, monitor, prepare, schedule, amplitude, stop, close: () => { stop(); if (context.state !== 'closed') void context.close(); } };
}
export type Mixer = ReturnType<typeof createAudioMixer>;
export async function audioLength(blob: Blob) {
  const context = new OfflineAudioContext(1, 1, 24000);
  return (await context.decodeAudioData(await blob.arrayBuffer())).duration;
}

export async function mixOffline(scenes: Scene[], duration: number, signal: AbortSignal) {
  const context = new OfflineAudioContext(2, Math.ceil(duration * 48000), 48000);
  const master = context.createGain();
  const limiter = context.createDynamicsCompressor();
  master.connect(limiter).connect(context.destination);
  const events = soundEvents(scenes);
  const dialogue = events.filter(event=>event.clip.track==='dialogue').map(event=>({
    start:event.position,end:event.position+event.clip.length }));
  await Promise.all(events.map(async ({ clip, position }) => {
    const { buffer } = await readSound(clip.asset);
    signal.throwIfAborted();
    const playback = soundPlayback(clip, position, buffer.duration);
    if (!playback) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = clipBuffer(context,buffer,clip);
    if(clip.loop){source.loop=true;source.loopStart=0;source.loopEnd=buffer.duration;}
    wireClip(context,source,gain,clip);gain.connect(master);
    applyGainEnvelope(gain,clip,position,position,position+playback.duration,0,0,dialogue);
    source.start(playback.delay, playback.offset, playback.duration);
  }));
  signal.throwIfAborted();
  return context.startRendering();
}
