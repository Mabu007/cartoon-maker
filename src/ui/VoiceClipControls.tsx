import { useEffect, useState } from 'react';
import { RotateCcw, Sparkles, Volume2, History, PlayCircle } from 'lucide-react';
import { getOrFetchAudio } from '../services/audio.ts';
import { voices } from '../services/speech.ts';
import { type Clip, type Character } from '../engine/schema.ts';
type Dialogue = Extract<Clip, { track:'dialogue' }>;
export function VoiceClipControls({ clip, character, generate, restore }: {
  clip: Dialogue; character?: Character;
  generate:(clip:Dialogue,text:string,voice:string,force?:boolean)=>Promise<string>;
  restore:(clip:Dialogue,index:number)=>Promise<string>;
}) {
  const [text,setText]=useState(clip.text);
  const [voice,setVoice]=useState(clip.voicePreset??character?.voicePreset??'warm');
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const [url,setUrl]=useState(''),[versionIndex,setVersionIndex]=useState(-1);
  useEffect(()=>{setText(clip.text);setVoice(clip.voicePreset??character?.voicePreset??'warm');setVersionIndex(-1);},[clip.asset,clip.id,character?.voicePreset]);
  useEffect(()=>{
    let canceled=false;let objectUrl='';
    setUrl('');
    void (async()=>{
      try{
        if(clip.asset.startsWith('builtin:')) {
          if(!canceled)setUrl('/audio/'+clip.asset.slice(8)+'.mp3');
          return;
        }
        if(!clip.asset.startsWith('asset:'))return;
        const file=await getOrFetchAudio(clip.asset.slice(6));
        if(!file)throw new Error('This recording is not on this device or in cloud storage.');
        objectUrl=URL.createObjectURL(file);
        if(!canceled)setUrl(objectUrl);
      }catch(err){if(!canceled)setError(err instanceof Error?err.message:'Could not load audio preview.');}
    })();
    return()=>{canceled=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[clip.asset]);
  async function execute(task:()=>Promise<string>){
    if(busy)return;
    setBusy(true);setStatus('');setError('');
    try{setStatus(await task());}
    catch(cause){setError(cause instanceof Error?cause.message:'Voice generation failed. Previous audio is unchanged.');}
    finally{setBusy(false);}
  }
  return <div className="voice-generation-controls" aria-label="Dialogue voice production">
    <label className="field">Spoken line
      <textarea aria-label="Edit spoken dialogue" maxLength={400} value={text}
        onChange={event=>setText(event.target.value)} placeholder="What should this character say?"/>
    </label>
    <label className="field">Voice preset
      <select aria-label="Voice preset" value={voice} onChange={event=>setVoice(event.target.value)}>
        {voices.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
      </select>
    </label>
    {character&&<p className="small-text">Character voice: {character.voicePreset??'warm'} · used for new dialogue in every scene. Change it in the Character Editor.</p>}
    <div className="voice-generation-actions">
      <button type="button" className="primary" disabled={busy||!text.trim()} onClick={()=>void execute(()=>generate(clip,text,voice,false))}>
        <Sparkles size={15}/> {busy?'Processing…':'Generate Voice'}
      </button>
      <button type="button" className="quiet" disabled={busy||!text.trim()} onClick={()=>void execute(()=>generate(clip,text,voice,true))}>
        <RotateCcw size={15}/> Regenerate Voice
      </button>
    </div>
    {url&&<div className="voice-clip-preview"><label><PlayCircle size={14}/> Preview this recording</label>
      <audio controls preload="metadata" src={url} aria-label="Dialogue audio playback preview"/></div>}
    {(clip.versions?.length??0)>0&&<div className="voice-version-list"><label className="field"><History size={15}/> Previous recordings
      <select aria-label="Previous voice version" value={versionIndex} onChange={event=>setVersionIndex(Number(event.target.value))}>
        <option value={-1}>Choose a version</option>
        {clip.versions!.map((item,index)=><option key={index+item.asset} value={index}>Version {index+1} — {item.length.toFixed(2)}s · {item.text.slice(0,44)}</option>)}
      </select>
    </label><button type="button" className="quiet" disabled={busy||versionIndex<0} onClick={()=>void execute(()=>restore(clip,versionIndex))}>
      <RotateCcw size={14}/> Restore selected audio
    </button></div>}
    <p className="small-text">Only this dialogue clip changes. Your earlier audio stays available for restoration. Longer recordings cannot introduce new dialogue collisions.</p>
    {status&&<p role="status" className="small-text">{status}</p>}
    {error&&<p role="alert" className="form-error">{error}</p>}
  </div>;
}
