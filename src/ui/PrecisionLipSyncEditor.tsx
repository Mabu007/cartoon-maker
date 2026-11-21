import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, Plus, Redo2, Repeat2, RotateCcw, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { effectiveCues, overrideRegion } from '../engine/dspLipSync.ts';
import { sampleTimedViseme, type Viseme, type VisemeCue } from '../engine/visemes.ts';
import type { Character, Clip } from '../engine/schema.ts';
import { facialPerformance } from '../engine/facialAnimation.ts';
import { analyzeLocalLipSync, audioBlob } from '../services/localLipSync.ts';
import { waveformPath } from './AudioWaveform.tsx';
import { NativeCharacterPreview } from './NativeCharacterPreview.tsx';
import { SvgMouthRig } from './SvgMouthRig.tsx';
import { clock, IconButton, Modal } from './shared.tsx';
type Dialogue = Extract<Clip,{track:'dialogue'}>;
const shapes: {shape:Viseme;name:string;color:string}[] = [
  {shape:'rest',name:'Rest',color:'#777b95'},{shape:'closed',name:'M / B / P',color:'#f69eb4'},
  {shape:'open',name:'AH',color:'#ffc58b'},{shape:'wide',name:'EE',color:'#f0df83'},
  {shape:'round',name:'OH / OO',color:'#a6dfb5'},{shape:'bite',name:'F / V',color:'#87d5e6'},
  {shape:'tongue',name:'L',color:'#c6b1ff'},{shape:'pucker',name:'CH / SH',color:'#f1b0ea'}
];
export function PrecisionLipSyncEditor({clip,character,change,close,regenerate,undo,redo,canUndo,canRedo}:{
  clip:Dialogue;character:Character;change:(clip:Dialogue)=>void;close:()=>void;regenerate:()=>Promise<string>;
  undo:()=>void;redo:()=>void;canUndo:boolean;canRedo:boolean;
}) {
  const audio=useRef<HTMLAudioElement>(null),sheet=useRef<HTMLDivElement>(null);
  const suppressClick=useRef(false);
  const rangeDrag=useRef<{start:number;current:number}|undefined>(undefined);
  const drag=useRef<{index:number;edge:'start'|'end';x:number;base:VisemeCue[];cue:VisemeCue;next:VisemeCue[];width:number}|null>(null);
  const [url,setUrl]=useState(''),[peaks,setPeaks]=useState<number[]>([]),[automatic,setAutomatic]=useState<VisemeCue[]>([]);
  const [cursor,setCursor]=useState(clip.offset),[zoom,setZoom]=useState(1),[playing,setPlaying]=useState(false),[loop,setLoop]=useState(false);
  const [region,setRegion]=useState<{start:number;end:number}>(),[preview,setPreview]=useState<VisemeCue[]>();
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[mode,setMode]=useState<'automatic'|'precision'>('precision');
  const from=clip.offset,to=Math.min(clip.lipSync?.analyzedDuration??clip.offset+clip.length,clip.offset+clip.length),duration=Math.max(.1,to-from);
  const cues=useMemo(()=>effectiveCues(clip.visemes?.length?clip.visemes:automatic,preview??clip.manualVisemes),[clip.visemes,clip.manualVisemes,automatic,preview]);
  const visible=cues.filter(c=>c.end>from&&c.start<to);
  const sample=sampleTimedViseme(cues,cursor),selected=visible.find(c=>cursor>=c.start&&cursor<c.end);
  const state=useRef({loop,region,from,to});state.current={loop,region,from,to};
  useEffect(()=>{let alive=true,url='';setError('');void audioBlob(clip.asset).then(async blob=>{
    url=URL.createObjectURL(blob);if(alive)setUrl(url);const result=await analyzeLocalLipSync(blob);if(alive){setPeaks(result.waveform);setAutomatic(result.cues);}
  }).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;audio.current?.pause();if(url)URL.revokeObjectURL(url);};},[clip.asset]);
  useEffect(()=>{if(!playing)return;let raf=0;const tick=()=>{
    const player=audio.current;if(!player)return;const current=state.current;
    const end=current.region?.end??current.to,start=current.region?.start??current.from;
    if(player.currentTime>=end-.003||player.ended){if(current.loop){player.currentTime=start;void player.play().catch(e=>setError(e.message));}else{player.pause();setPlaying(false);setCursor(end);return;}}
    setCursor(player.currentTime);raf=requestAnimationFrame(tick);
  };raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[playing]);
  const pause=()=>{audio.current?.pause();setPlaying(false);};
  function seek(value:number){pause();const next=Math.max(from,Math.min(to-.001,value));if(audio.current)audio.current.currentTime=next;setCursor(next);}
  async function play(start?:number,end?:number){
    const player=audio.current;if(!player)return;
    if(playing&&start===undefined){pause();return;}
    const bounds=start!==undefined?{start,end:end??to}:region;
    setRegion(bounds);player.currentTime=start??(cursor>=((bounds?.end??to)-.01)?(bounds?.start??from):Math.max(bounds?.start??from,cursor));
    try{await player.play();setPlaying(true);}catch(e){setError(e instanceof Error?e.message:'Audio could not play.');}
  }
  function commit(manual:VisemeCue[]){if(!clip.visemes?.length&&!automatic.length)return;change({...clip,visemes:clip.visemes?.length?clip.visemes:automatic,manualVisemes:manual});}
  function shape(value:Viseme){
    const start=region?.start??selected?.start??cursor,end=region?.end??selected?.end??Math.min(to,cursor+.1);
    pause();seek((Math.max(from,start)+Math.min(to,end))/2);
    commit(overrideRegion(clip.manualVisemes??[],Math.max(from,start),Math.min(to,end),value));
  }
  function reset(){if(selected||region)commit(overrideRegion(clip.manualVisemes??[],region?.start??selected!.start,region?.end??selected!.end));}
  function begin(event:PointerEvent<HTMLSpanElement>,cue:VisemeCue,index:number,edge:'start'|'end'){
    event.preventDefault();event.stopPropagation();suppressClick.current=true;pause();setRegion(undefined);
    const base=clip.manualVisemes??[],width=sheet.current?.getBoundingClientRect().width??1;
    drag.current={index,edge,x:event.clientX,base,cue,next:base,width};event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<HTMLSpanElement>){const d=drag.current;if(!d)return;
    const delta=(event.clientX-d.x)/d.width*duration;
    const start=d.edge==='start'?Math.max(from,Math.min(d.cue.end-.005,d.cue.start+delta)):d.cue.start;
    const end=d.edge==='end'?Math.min(to,Math.max(d.cue.start+.005,d.cue.end+delta)):d.cue.end;
    const cleared=overrideRegion(d.base,d.cue.start,d.cue.end);
    d.next=overrideRegion(cleared,start,end,d.cue.shape);setPreview(d.next);setCursor(start);
  }
  function finish(){const d=drag.current;drag.current=null;setPreview(undefined);if(d&&JSON.stringify(d.next)!==JSON.stringify(d.base))commit(d.next);}
  function key(event:React.KeyboardEvent){
    if((event.target as HTMLElement).closest('input,select,textarea'))return;
    const cmd=event.ctrlKey||event.metaKey;
    if(cmd&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();pause();event.shiftKey||event.key.toLowerCase()==='y'?redo():undo();return;}
    if(event.code==='Space'){event.preventDefault();void play();}
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const direction=event.key==='ArrowRight'?1:-1;
      if(event.shiftKey){const times=visible.map(c=>c.start);seek(direction>0?(times.find(t=>t>cursor+.001)??to):([...times].reverse().find(t=>t<cursor-.001)??from));}
      else seek(cursor+direction/30);
    }
    if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();reset();}
  }
  return <Modal wide title="Precision Lip Sync" description={`${character.name} · Click a colorful block to hear it, then choose a mouth.`} close={close}>
    <div className="precision-editor" onKeyDown={key}>
      <div className="lip-overview"><div className="lip-face"><NativeCharacterPreview character={character} view="front" action="idle" expression="neutral" flip={false} scale={1} faceOnly mouthSample={sample} frozenTime={cursor}/></div><div className="lip-intro"><div className="lip-modes" role="group" aria-label="Lip-sync mode"><button className={mode==='automatic'?'active':''} onClick={()=>setMode('automatic')}>Automatic</button><button className={mode==='precision'?'active':''} onClick={()=>setMode('precision')}>Precision</button></div><h3>{mode==='precision'?'Little edits. More personality.':'Your voice sets the rhythm.'}</h3><p>{mode==='precision'?'Select a block, listen, and try a shape. Drag its edges to change the timing.':'Automatic lip sync uses the energy and texture of your actual recording. It creates stylized speech motion, without recognizing words or phonemes.'}</p><button className="quiet" disabled={busy} onClick={()=>{pause();setBusy(true);void regenerate().then(()=>setError(''),e=>setError(e.message)).finally(()=>setBusy(false));}}><RotateCcw size={14}/>{busy?'Analyzing…':'Regenerate automatic track'}</button><small>Precision corrections stay saved in either mode.</small></div></div>
      <div className="lip-toolbar"><IconButton title={playing?'Pause audio':'Play audio'} onClick={()=>void play()}>{playing?<Pause size={18}/>:<Play size={18}/>}</IconButton><IconButton title="Previous frame" onClick={()=>seek(cursor-1/30)}><ArrowLeft size={16}/></IconButton><IconButton title="Next frame" onClick={()=>seek(cursor+1/30)}><ArrowRight size={16}/></IconButton><span className="lip-clock">{clock(cursor-from)} / {clock(duration)}</span><IconButton title="Loop selected region" active={loop} onClick={()=>setLoop(v=>!v)}><Repeat2 size={16}/></IconButton><button className="quiet" onClick={()=>{pause();setRegion(undefined);seek(from);}}>Full clip</button><span className="spacer"/><IconButton title="Undo mouth edit" disabled={!canUndo} onClick={()=>{pause();undo();}}><Undo2 size={16}/></IconButton><IconButton title="Redo mouth edit" disabled={!canRedo} onClick={()=>{pause();redo();}}><Redo2 size={16}/></IconButton><IconButton title="Zoom waveform out" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z/1.5))}><ZoomOut size={16}/></IconButton><IconButton title="Zoom waveform in" disabled={zoom>=12} onClick={()=>setZoom(z=>Math.min(12,z*1.5))}><ZoomIn size={16}/></IconButton></div>
      <div className="lip-wave-scroll"><div className="lip-wave-sheet" ref={sheet} style={{width:zoom*100+'%'}}>
        <div className="lip-ruler">{Array.from({length:11},(_,i)=><span key={i} style={{left:i*10+'%'}}>{(duration*i/10).toFixed(2)}s</span>)}</div>
        <svg className="lip-wave" viewBox="0 0 1000 90" preserveAspectRatio="none" role="img" aria-label="Actual recorded audio waveform" onPointerDown={e=>{pause();const box=e.currentTarget.getBoundingClientRect();const at=Math.max(from,Math.min(to,from+(e.clientX-box.left)/box.width*duration));rangeDrag.current={start:at,current:at};e.currentTarget.setPointerCapture(e.pointerId);seek(at);}}
        onPointerMove={e=>{const drag=rangeDrag.current;if(!drag)return;const box=e.currentTarget.getBoundingClientRect();drag.current=Math.max(from,Math.min(to,from+(e.clientX-box.left)/box.width*duration));if(Math.abs(drag.current-drag.start)>.025)setRegion({start:Math.min(drag.start,drag.current),end:Math.max(drag.start,drag.current)});}}
        onPointerUp={()=>{const drag=rangeDrag.current;rangeDrag.current=undefined;if(!drag)return;if(Math.abs(drag.current-drag.start)>.025){void play(Math.min(drag.start,drag.current),Math.max(drag.start,drag.current));}else{const cue=cues.find(c=>c.start<=drag.start&&drag.start<c.end);if(cue)void play(Math.max(from,cue.start),Math.min(to,cue.end));}}}
        onPointerCancel={()=>{rangeDrag.current=undefined;}}><path d={waveformPath(peaks,from,duration,1000,90)} fill="none" stroke="currentColor" strokeWidth="1.1"/></svg>
        {region&&<div className="lip-region" style={{left:(region.start-from)/duration*100+'%',width:(region.end-region.start)/duration*100+'%'}}/>}
        <div className="lip-segments">{visible.map((cue,index)=>{
          const info=shapes.find(s=>s.shape===cue.shape)!,manual=(preview??clip.manualVisemes??[]).some(c=>c.start<cue.end&&c.end>cue.start);
          return <button key={index} className={`lip-segment ${selected===cue?'selected':''} ${manual?'manual':''}`} title={`${info.name} · ${cue.start.toFixed(2)}–${cue.end.toFixed(2)}s${manual?' · Manual correction':''}`} aria-label={`Mouth ${index+1}: ${info.name}`} style={{left:(Math.max(from,cue.start)-from)/duration*100+'%',width:(Math.min(to,cue.end)-Math.max(from,cue.start))/duration*100+'%',background:info.color}} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}seek(cue.start);setRegion({start:Math.max(from,cue.start),end:Math.min(to,cue.end)});void play(Math.max(from,cue.start),Math.min(to,cue.end));}}><span className="lip-edge" role="slider" aria-label={`Start of mouth ${index+1}`} tabIndex={0} aria-valuemin={from} aria-valuemax={cue.end-.005} aria-valuenow={cue.start} onPointerDown={e=>begin(e,cue,index,'start')} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{drag.current=null;setPreview(undefined);}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.stopPropagation();e.preventDefault();const start=Math.max(from,Math.min(cue.end-.005,cue.start+(e.key==='ArrowRight'?1:-1)/30));commit(overrideRegion(overrideRegion(clip.manualVisemes??[],cue.start,cue.end),start,cue.end,cue.shape));}}}/><span className="lip-segment-label">{info.name}</span><span className="lip-edge right" role="slider" aria-label={`End of mouth ${index+1}`} tabIndex={0} aria-valuemin={cue.start+.005} aria-valuemax={to} aria-valuenow={cue.end} onPointerDown={e=>begin(e,cue,index,'end')} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{drag.current=null;setPreview(undefined);}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.stopPropagation();e.preventDefault();const end=Math.min(to,Math.max(cue.start+.005,cue.end+(e.key==='ArrowRight'?1:-1)/30));commit(overrideRegion(overrideRegion(clip.manualVisemes??[],cue.start,cue.end),cue.start,end,cue.shape));}}}/></button>;
        })}</div><div className="lip-playhead" style={{left:(cursor-from)/duration*100+'%'}}/>
      </div></div>
      {mode==='precision'&&<><div className="viseme-palette" aria-label="Mouth shape palette">{shapes.map(info=><button key={info.shape} aria-label={`Use ${info.name} mouth`} aria-pressed={sample.shape===info.shape} onClick={()=>shape(info.shape)}><svg viewBox="-32 -22 64 44"><SvgMouthRig character={character} mood={facialPerformance(0,character.id,'idle','neutral',0,{shape:info.shape,weight:info.shape==='rest'?0:1})} view="front" x={0} y={0} clipId={'palette-'+info.shape}/></svg><span>{info.name}</span></button>)}</div><div className="lip-edit-actions"><button className="quiet" onClick={()=>{pause();const end=Math.min(to,cursor+.1);if(end>cursor)commit(overrideRegion(clip.manualVisemes??[],cursor,end,'open'));}}><Plus size={14}/>Add mouth keyframe</button><button className="quiet" disabled={!selected&&!region} onClick={reset}><RotateCcw size={14}/>Reset to Auto</button><button className="quiet" disabled={!selected&&!region} onClick={reset}><Trash2 size={14}/>Remove correction</button></div></>}
      <p className="small-text">Space: play/pause · Arrows: one frame · Shift + arrows: next/previous mouth · Ctrl/Cmd + Z: undo. Colored blocks are visual mouth shapes, not phoneme recognition.</p>
      {!peaks.length&&!error&&<p role="status">Reading your recording…</p>}{error&&<p role="alert" className="form-error">{error}</p>}
      <audio ref={audio} src={url} preload="auto" onPause={()=>setPlaying(false)} onEnded={()=>{if(loop){const player=audio.current;if(player){player.currentTime=region?.start??from;void player.play().then(()=>setPlaying(true),e=>setError(e.message));}}else setPlaying(false);}} hidden/>
    </div><footer className="modal-footer"><span className="small-text">All edits save with your cartoon.</span><span className="spacer"/><button className="primary" onClick={close}>Done</button></footer>
  </Modal>;
}
