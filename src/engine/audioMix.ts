import type { SoundClip, Scene } from './schema.ts';
/** Single shared interpretation of mute and solo for playback, export and
 * speaker lip-sync. Project backups intentionally ignore audition controls.
 */
export function audibleAudioTrack(scene: Scene, track: SoundClip['track']) {
  if (scene.trackSettings?.[track]?.muted) return false;
  const choices = (['dialogue','audio','music'] as const).filter(
    name => scene.trackSettings?.[name]?.solo
  );
  return !choices.length || choices.includes(track);
}
export type SoundWindow = { start: number; end: number };
export const DUCK_LEVEL = 0.38;
export const DUCK_ATTACK = 0.09, DUCK_RELEASE = 0.22;
const clamp01 = (value: number) => Math.min(1,Math.max(0,value));
/** Pure transport-independent envelope. Shared by AudioContext preview,
 * OfflineAudioContext export and regression tests.
 */
export function gainAt(clip: SoundClip, position: number, time: number, dialogue: SoundWindow[] = []) {
  const relative = time-position, duration=clip.length;
  if (relative < -0.00001 || relative > duration+0.00001) return 0;
  let gain = clip.volume;
  if (clip.fadeIn) gain *= clamp01(relative/Math.min(duration,clip.fadeIn));
  if (clip.fadeOut) gain *= clamp01((duration-relative)/Math.min(duration,clip.fadeOut));
  if (clip.track === 'music') {
    let reduction=1;
    for(const entry of dialogue) {
      let duck=1;
      if(time>=entry.start-DUCK_ATTACK && time<entry.start)
        duck=1-(1-DUCK_LEVEL)*(time-entry.start+DUCK_ATTACK)/DUCK_ATTACK;
      else if(time>=entry.start && time<=entry.end) duck=DUCK_LEVEL;
      else if(time>entry.end && time<=entry.end+DUCK_RELEASE)
        duck=DUCK_LEVEL+(1-DUCK_LEVEL)*(time-entry.end)/DUCK_RELEASE;
      reduction=Math.min(reduction,duck);
    }
    gain*=reduction;
  }
  return Math.max(0,gain);
}
export function gainKeyframes(clip: SoundClip, position: number, start: number, end: number, dialogue: SoundWindow[]=[]): SoundWindow[] {
  const knots=[start,end,position,position+clip.length,
    position+(clip.fadeIn??0),position+clip.length-(clip.fadeOut??0)];
  if(clip.track==='music') for (const item of dialogue)
    knots.push(item.start-DUCK_ATTACK,item.start,item.end,item.end+DUCK_RELEASE);
  const unique=[...new Set(knots.filter(t=>t>=start-1e-7 && t<=end+1e-7).map(t=>Math.max(start,Math.min(end,t))))].sort((a,b)=>a-b);
  return unique.map((time,index)=>({start:time,end:gainAt(clip,position,time,dialogue)}));
}
export function applyGainEnvelope(gain: GainNode, clip: SoundClip, position: number, start: number,
  end: number, when: number, cursor: number, dialogue: SoundWindow[] = []) {
  const points=gainKeyframes(clip,position,start,end,dialogue);
  for(const [index,point] of points.entries()) {
    const at=when+Math.max(0,point.start-cursor);
    if(index===0)gain.gain.setValueAtTime(point.end,at);
    else gain.gain.linearRampToValueAtTime(point.end,at);
  }
  return points;
}
