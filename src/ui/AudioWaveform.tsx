import { useEffect, useState } from 'react';
import { audioBlob } from '../services/localLipSync.ts';

export function waveformPath(peaks: readonly number[], offset: number, length: number, width=1000, height=60) {
  const start=Math.floor(offset*50), count=Math.max(1,Math.ceil(length*50)), columns=Math.min(width,count), max=Math.max(.01,...peaks);
  let path='';
  for(let x=0;x<columns;x++){
    let peak=0;const from=start+Math.floor(x*count/columns),to=start+Math.ceil((x+1)*count/columns);
    for(let i=from;i<to;i++)peak=Math.max(peak,peaks[i]??0);
    const y=peak/max*(height/2-2),at=(x+.5)/columns*width;
    path+=`M${at.toFixed(2)} ${(height/2-y).toFixed(2)}v${(2*y).toFixed(2)}`;
  }
  return path;
}
/** Waveforms should not run the speech-viseme DSP engine for every music/SFX
 * clip. Decode once per asset, cache its amplitude envelope and reuse it across
 * clips, scenes and time-range changes.
 */
const cached=new Map<string,Promise<number[]>>();
async function amplitudePeaks(asset:string):Promise<number[]>{
  const existing=cached.get(asset);
  if(existing)return existing;
  const task=(async()=>{
    const blob=await audioBlob(asset);
    const bytes=await blob.arrayBuffer();
    const ctx=new OfflineAudioContext(1,1,16000);
    const audio=await ctx.decodeAudioData(bytes);
    const count=Math.max(1,Math.ceil(audio.duration*50));
    const peaks=new Array<number>(count).fill(0);
    const stride=Math.max(1,Math.round(audio.sampleRate/1000));
    for(let channel=0;channel<audio.numberOfChannels;channel++){
      const values=audio.getChannelData(channel);
      for(let i=0;i<values.length;i+=stride){
        const at=Math.min(count-1,Math.floor(i/audio.sampleRate*50));
        peaks[at]=Math.max(peaks[at],Math.abs(values[i]));
      }
    }
    return peaks;
  })();
  cached.set(asset,task);
  task.catch(()=>{if(cached.get(asset)===task)cached.delete(asset);});
  return task;
}
export function AudioWaveform({asset,offset,length}:{asset:string;offset:number;length:number}) {
  const [peaks,setPeaks]=useState<number[]>([]);
  useEffect(()=>{
    let alive=true;
    void amplitudePeaks(asset).then(result=>{if(alive)setPeaks(result);}).catch(()=>{if(alive)setPeaks([]);});
    return()=>{alive=false;};
  },[asset]);
  if(!peaks.length)return null;
  return <svg className="clip-waveform" viewBox="0 0 1000 30" preserveAspectRatio="none" aria-label="Recorded audio waveform">
    <path d={waveformPath(peaks,offset,length,350,30)} transform="scale(2.857142857 1)" fill="none" stroke="currentColor" strokeWidth="1.2"/>
  </svg>;
}
