import { useEffect, useState } from 'react';
import { analyzeLocalLipSync, audioBlob } from '../services/localLipSync.ts';
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
export function AudioWaveform({asset,offset,length}:{asset:string;offset:number;length:number}) {
  const [peaks,setPeaks]=useState<number[]>([]);
  useEffect(()=>{let alive=true;void audioBlob(asset).then(analyzeLocalLipSync).then(result=>{if(alive)setPeaks(result.waveform);}).catch(()=>{});return()=>{alive=false;};},[asset]);
  if(!peaks.length)return null;
  return <svg className="clip-waveform" viewBox="0 0 1000 30" preserveAspectRatio="none" aria-label="Recorded audio waveform"><path d={waveformPath(peaks,offset,length,350,30)} transform="scale(2.857142857 1)" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>;
}
