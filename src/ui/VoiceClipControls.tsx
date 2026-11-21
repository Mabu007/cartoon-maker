import { useEffect, useState } from 'react';
import { AudioLines, Mic, RefreshCw } from 'lucide-react';
import { audioBlob } from '../services/localLipSync.ts';
import type { Clip, Character } from '../engine/schema.ts';
type Dialogue = Extract<Clip, {track:'dialogue'}>;
export function VoiceClipControls({clip, precision, rerecord, align}: {
  clip: Dialogue; character?: Character; precision?:()=>void; rerecord?:()=>void;
  align:(clip:Dialogue,recognizer:'pocketSphinx'|'phonetic')=>Promise<string>;
}) {
  const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{let alive=true,url='';void audioBlob(clip.asset).then(blob=>{url=URL.createObjectURL(blob);if(alive)setUrl(url);}).catch(error=>{if(alive)setMessage(error.message);});return()=>{alive=false;if(url)URL.revokeObjectURL(url);};},[clip.asset]);
  return <div className="recording-controls"><strong>{clip.lipSync?.source==='dsp'?'Automatic lip sync':'Recording'}{clip.manualVisemes?.length?' · Precision edits':''}</strong><p className="small-text">Your audio drives the mouth locally. Refine any moment below.</p>{url&&<audio controls src={url} aria-label="Preview recording"/>}<button className="primary full" onClick={precision}><AudioLines size={16}/>Precision Lip Sync</button><div className="field-row"><button className="quiet" disabled={busy} onClick={()=>{setBusy(true);setMessage('');void align(clip,'phonetic').then(setMessage,error=>setMessage(error.message)).finally(()=>setBusy(false));}}><RefreshCw size={14}/>{busy?'Analyzing…':'Regenerate auto'}</button><button className="quiet" onClick={rerecord}><Mic size={14}/>Replace voice</button></div>{message&&<p className="small-text" role="status">{message}</p>}</div>;
}
