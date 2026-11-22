import { useEffect, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { voiceLooks, type VoiceLook } from '../engine/voiceEffects.ts';
import { auditionClip, stopSoundPreview } from '../services/audio.ts';
import { NumberField, Select } from './shared.tsx';
import type { SoundClip } from '../engine/schema.ts';

const voices = Object.keys(voiceLooks) as VoiceLook[];
export function SoundClipEditor({clip,change,locked}:{clip:SoundClip;change:(clip:SoundClip)=>void;locked:boolean}){
  const [error,setError]=useState('');
  useEffect(()=>()=>stopSoundPreview(),[clip.id,clip.asset]);
  const voice=clip.track==='dialogue'?clip.voiceEffect??voiceLooks.natural:undefined;
  const currentVoice=voice&&voices.find(name=>Object.entries(voiceLooks[name])
    .every(([key,value])=>value===voice[key as keyof typeof voice]));
  return <div className="sound-clip-editor">
    <div className="sound-preview-tools">
      <button type="button" className="quiet" onClick={()=>{setError('');void auditionClip(clip).catch(()=>setError('Could not preview the audio file.'));}}><Play size={15}/> Preview clip</button>
      <button type="button" className="quiet" onClick={stopSoundPreview}><Square size={14}/> Stop preview</button>
    </div>
    {error&&<p role="alert" className="small-text">{error}</p>}
    <fieldset disabled={locked}>
      <legend>Sound edit</legend>
      <div className="field-row"><NumberField text="Volume" value={clip.volume} min={0} max={2} step={.05} onChange={volume=>change({...clip,volume})}/>
        <NumberField text="Source offset (s)" value={clip.offset} min={0} max={180} step={.01} onChange={offset=>change({...clip,offset})}/></div>
      <div className="field-row"><NumberField text="Fade in (s)" value={clip.fadeIn??0} min={0} max={clip.length} step={.05} onChange={fadeIn=>change({...clip,fadeIn})}/>
        <NumberField text="Fade out (s)" value={clip.fadeOut??0} min={0} max={clip.length} step={.05} onChange={fadeOut=>change({...clip,fadeOut})}/></div>
      {clip.track!=='dialogue'&&<label className="check"><input type="checkbox" checked={!!clip.loop} onChange={event=>change({...clip,loop:event.target.checked})}/> Loop audio throughout this clip</label>}
      <label className="check"><input type="checkbox" checked={clip.muted} onChange={event=>change({...clip,muted:event.target.checked})}/> Mute clip</label>
    </fieldset>
    {clip.track==='dialogue'&&voice&&<fieldset disabled={locked}>
      <legend>Voice effects</legend>
      <label className="field">Voice preset<Select aria="Voice effect preset" value={currentVoice??'custom'} options={currentVoice?voices:[...voices,'custom'] as const}
        onChange={name=>{if(name!=='custom')change({...clip,voiceEffect:{...voiceLooks[name]}});}}
        render={name=>name==='deep-bass'?'Deep bass':name[0].toUpperCase()+name.slice(1)}/></label>
      {([['pitch','Pitch (semitones)'],['bass','Bass (dB)'],['clarity','Clarity (dB)']] as const).map(([key,label])=>
        <NumberField key={key} text={label} value={voice[key]} min={-9} max={9} step={.5}
          onChange={value=>change({...clip,voiceEffect:{...voice,[key]:value}})}/>)}
    </fieldset>}
  </div>;
}
