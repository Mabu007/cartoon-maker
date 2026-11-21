import { useEffect, useMemo, useRef, useState, type PointerEvent, type DragEvent } from 'react';
import { ChevronDown, ChevronUp, ClipboardCopy, Code2, Copy, Keyboard, Plus, Trash2, ZoomIn, ZoomOut, Maximize2, Scissors, Magnet, Lock, Unlock, Volume2, VolumeX, Headphones, ChevronRight, ListFilter, CopyPlus, ClipboardPaste } from 'lucide-react';
import { AudioWaveform } from './AudioWaveform.tsx';
import { clamp } from '../engine/animation.ts';
import { tracks, trackNames, uid, type Clip, type Scene, type Track } from '../engine/schema.ts';
import { compatibleObjects } from '../engine/interactions.ts';
import { selectClipRange, snapGuides, snapTime, snapMoveDelta, moveTimelineClips, trimTimelineClip, resizeSceneTimeline, trackIsLocked } from '../engine/timelineEditing.ts';
import { type Selection } from '../studio.ts';
import { clipLabel, IconButton, trackIcon } from './shared.tsx';

type Keyframe = { clipId: string; index: number } | null;
type DragSession = {
  sceneId: string; ids: string[]; clip: Clip; startX: number; edge: 'move'|'in'|'out';
  moved: boolean; preview: Scene; base: Scene; collapseOnClick: boolean; guides: number[]; lastDelta: number;
};
type ContextMenu = {x:number;y:number;id:string}|null;

export function Timeline({
  scene, names, selection, selectedClipIds, selectedKeyframe, select, selectClips, selectKeyframe, seek, change, add, remove, duplicate, copy, cut, paste, split, selectAll, apply, compact, onCompact, onCode, onContext, onCopyScene, onCopyProject, onResizeScene, playhead
}: {
  scene: Scene; names: Record<string,string>; selection: Selection; selectedClipIds: string[]; selectedKeyframe: Keyframe;
  select: (value: Selection) => void; selectClips: (ids: string[]) => void; selectKeyframe: (clipId:string,index:number) => void;
  seek: (t:number) => void; change: (clip:Clip,original:Clip) => void; add: (track?:Track) => void;
  remove: () => void; duplicate: () => void; copy: () => void; cut: () => void; paste: () => void; split: () => void; selectAll: () => void;
  apply: (next:Scene, ids?:string[]) => void; compact:boolean; onCompact:()=>void; onCode:()=>void; onContext:()=>void; onCopyScene:()=>void; onCopyProject:()=>void; onResizeScene:(duration:number)=>void; playhead:number;
}) {
  const [zoom,setZoom]=useState(1), [viewport,setViewport]=useState(900), [snap,setSnap]=useState(true);
  const [shortcuts,setShortcuts]=useState(false),[contextOpen,setContextOpen]=useState(false);
  const [menu,setMenu]=useState<ContextMenu>(null),[preview,setPreview]=useState<Scene|null>(null),[dropTrack,setDropTrack]=useState<Track|null>(null);
  const viewportRef=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),needle=useRef<HTMLDivElement>(null);
  const playheadRef=useRef(playhead),drag=useRef<DragSession|null>(null),scrub=useRef(false),contextRef=useRef<HTMLDivElement>(null);
  const anchor=useRef<string|null>(null);
  const [labelWidth,setLabelWidth]=useState(200);
  const sheetWidth=Math.max(viewport,260)*zoom;
  const unitsPerPixel=scene.duration/Math.max(1,sheetWidth-labelWidth);
  const pixelsPerSecond=1/unitsPerPixel;
  const shown=preview?.id===scene.id?preview:scene;
  const chosen=new Set(selectedClipIds);
  const byTrack=useMemo(()=>{
    const result = {} as Record<Track,Clip[]>;
    for (const track of tracks) result[track]=[];
    for(const clip of shown.clips) result[clip.track].push(clip);
    for(const track of tracks)result[track].sort((a,b)=>a.start-b.start);
    return result;
  },[shown]);
  useEffect(()=>{
    const element=viewportRef.current;
    if(!element)return;
    const size=()=>{
      setViewport(element.clientWidth);
      setLabelWidth(parseFloat(getComputedStyle(element).getPropertyValue('--track-label')));
    };
    size();
    const observer=new ResizeObserver(size);observer.observe(element);return()=>observer.disconnect();
  },[compact]);
  useEffect(()=>{
    const time=(event:Event)=>{
      const at=clamp((event as CustomEvent<number>).detail,0,scene.duration);
      playheadRef.current=at;
      if(needle.current)needle.current.style.left=(at/scene.duration*100)+'%';
    };
    window.addEventListener('toonroom-time',time);
    return()=>window.removeEventListener('toonroom-time',time);
  },[scene.id,scene.duration]);
  useEffect(()=>{ playheadRef.current=playhead; if(needle.current)needle.current.style.left=(playhead/scene.duration*100)+'%'; },[scene.id,playhead,scene.duration]);
  useEffect(()=>{
    const dismiss=(event:globalThis.PointerEvent)=>{
      if(!contextRef.current?.contains(event.target as Node))setContextOpen(false);
      if(menu && !(event.target as HTMLElement)?.closest('.timeline-context-menu'))setMenu(null);
    };
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setContextOpen(false);setMenu(null);}};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',key);};
  },[menu]);
  useEffect(()=>{setPreview(null);drag.current=null;anchor.current=null;setMenu(null);},[scene.id]);
  const setZoomAround=(next:number)=>{
    const value=clamp(next,1,9), el=viewportRef.current;
    if(!el){setZoom(value);return;}
    const at=playheadRef.current/scene.duration;
    const viewportPosition=labelWidth+at*(sheetWidth-labelWidth)-el.scrollLeft;
    const nextSheet=Math.max(viewport,260)*value;
    setZoom(value);
    requestAnimationFrame(()=>{el.scrollLeft=Math.max(0,labelWidth+at*(nextSheet-labelWidth)-viewportPosition);});
  };
  useEffect(()=>{
    const element=viewportRef.current;
    if(!element || compact)return;
    const wheel=(event:WheelEvent)=>{
      if(event.ctrlKey||event.metaKey){event.preventDefault();setZoomAround(zoom*(event.deltaY>0?.85:1.15));}
    };
    element.addEventListener('wheel',wheel,{passive:false});
    return()=>element.removeEventListener('wheel',wheel);
  },[zoom,viewport,compact,scene.duration]);
  useEffect(()=>{
    const onZoom=(event:Event)=>setZoomAround(zoom*((event as CustomEvent<'in'|'out'>).detail==='in'?1.4:1/1.4));
    window.addEventListener('toonroom-zoom',onZoom);
    return()=>window.removeEventListener('toonroom-zoom',onZoom);
  },[zoom,viewport,scene.duration]);
  const seekAt=(event:PointerEvent)=>{
    const box=surface.current?.getBoundingClientRect();
    if(!box)return;
    const value=clamp((event.clientX-box.left)/box.width,0,1)*scene.duration;
    seek(Math.round(value*100)/100);
  };
  const selectionFor=(id:string,event:{shiftKey:boolean;metaKey:boolean;ctrlKey:boolean})=>{
    const ids=selectClipRange(scene,selectedClipIds,anchor.current??selection?.id,id,event.shiftKey,event.metaKey||event.ctrlKey);
    if(!event.shiftKey)anchor.current=id;
    selectClips(ids);
    return ids;
  };
  function pointerDown(event:PointerEvent<HTMLDivElement>, clip:Clip) {
    if(event.button!==0)return;
    const hit=event.target as HTMLElement;
    if(hit.closest('.timeline-keyframe'))return;
    const collapseOnClick = !event.shiftKey && !event.ctrlKey && !event.metaKey && chosen.has(clip.id) && chosen.size > 1;
    const ids = collapseOnClick ? selectedClipIds : selectionFor(clip.id,event);
    event.currentTarget.focus({preventScroll:true});
    if(!ids.includes(clip.id))return;
    if(trackIsLocked(scene,clip.track))return;
    const edge=hit.closest('[data-edge]')?.getAttribute('data-edge') as 'in'|'out'|null;
    const moving = edge ? [clip.id] : ids;
    drag.current={base:scene,collapseOnClick,guides:snapGuides(scene,playheadRef.current,moving),sceneId:scene.id,ids:moving,clip,startX:event.clientX,edge:edge??'move',moved:false,preview:scene,lastDelta:0};
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }
  function pointerMove(event:PointerEvent<HTMLDivElement>){
    const data=drag.current;
    if(!data||data.base!==scene)return;
    const dx=event.clientX-data.startX;
    if(!data.moved && Math.abs(dx)<3)return;
    data.moved=true;
    const delta=dx*unitsPerPixel;
    let next:Scene;
    try{
      if(data.edge==='move'){
        const target=data.clip.start+delta;
        const targetEnd=data.clip.start+data.clip.length+delta;
        const adjustment = snapMoveDelta(target,targetEnd,data.guides,pixelsPerSecond,snap);
        data.lastDelta=delta+adjustment;
        next=moveTimelineClips(scene,data.ids,data.lastDelta);
      }else{
        const edgeTime=data.edge==='in'?data.clip.start+delta:data.clip.start+data.clip.length+delta;
        const snapped=snapTime(edgeTime,data.guides,pixelsPerSecond,snap);
        next=trimTimelineClip(scene,data.clip.id,data.edge,snapped);
      }
      data.preview=next;
      setPreview(next);
    }catch{ /* Locked/invalid operation keeps last valid preview. */ }
  }
  function pointerUp(event:PointerEvent<HTMLDivElement>){
    const data=drag.current;drag.current=null;
    setPreview(null);
    if(!data||data.base!==scene)return;
    if(!data.moved){if(data.collapseOnClick)selectClips([data.clip.id]);seek(data.clip.start);return;}
    try{
      let next=data.preview;
      if(data.edge==='move'){
        const over=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-timeline-track]');
        const destination=over?.dataset.timelineTrack as Track|undefined;
        if(destination && destination!==data.clip.track)
          next=moveTimelineClips(scene,data.ids,data.lastDelta,destination);
      }
      if(JSON.stringify(next)!==JSON.stringify(scene))apply(next,data.ids);
    }catch{ /* App edit boundary reports validation errors. */ }
  }
  function insertDropped(event:DragEvent<HTMLDivElement>,track:Track){
    event.preventDefault();setDropTrack(null);
    if(trackIsLocked(scene,track))return;
    const box=event.currentTarget.getBoundingClientRect();
    const start=Math.max(0,Math.min(scene.duration-.1,Math.round(clamp((event.clientX-box.left)/box.width)*scene.duration*100)/100));
    const action=event.dataTransfer.getData('application/x-toonroom-action');
    const sound=event.dataTransfer.getData('application/x-toonroom-sound');
    const actor=scene.actors.find(a=>a.id===selection?.id)??scene.actors[0];
    const length=Math.min(2,scene.duration-start);
    if(length<.1)return;
    if(action && (track==='body'||track==='movement') && actor){
      if(track==='movement' && (action==='walk'||action==='run')){
        const next:Clip={id:uid(),track:'movement',actor:actor.id,start,length,fromX:actor.x,fromY:actor.y,toX:Math.min(3000,actor.x+140),toY:actor.y,gait:action};
        apply({...scene,clips:[...scene.clips,next]},[next.id]);return;
      }
      if(track==='body'){
        const target=action==='sit'?compatibleObjects(scene,'sit')[0]?.id:undefined;
        if(action==='sit'&&!target)return;
        const next:Clip={id:uid(),track:'body',actor:actor.id,start,length,action:action as Extract<Clip,{track:'body'}>['action'],layer:(['idle','sit','stand','walk','run','jump','turn'].includes(action)?'body':'gesture'),...(target?{target}: {})};
        apply({...scene,clips:[...scene.clips,next]},[next.id]);return;
      }
    }
    if(sound && (track==='audio'||track==='music')){
      const base={id:uid(),name:sound,start,length,volume:0.6,muted:false,offset:0,asset:'builtin:'+sound};
      const next:Clip=track==='audio'?{...base,track:'audio'}:{...base,track:'music'};
      apply({...scene,clips:[...scene.clips,next]},[next.id]);
    }
  }
  function toggle(track:Track,key:'muted'|'locked'|'collapsed'|'solo'){
    const previous=scene.trackSettings?.[track]??{};
    apply({...scene,trackSettings:{...scene.trackSettings,[track]:{...previous,[key]:!previous[key]}}});
  }
  const markers=scene.markers??[];
  const divisions=scene.duration>90?12:scene.duration>45?10:6;
  const ticks=Array.from({length:divisions+1},(_,index)=>scene.duration*index/divisions);
  const lane=(track:Track)=>{
    const Icon=trackIcon[track];
    const settings=scene.trackSettings?.[track];
    const collapsed=!!settings?.collapsed,locked=!!settings?.locked;
    const source=byTrack[track];
    const endings:number[]=[];
    const rows=collapsed?[]:source.map(clip=>{
      let row=endings.findIndex(end=>end<=clip.start+0.0001);
      if(row<0)row=endings.length;
      endings[row]=clip.start+clip.length;return {clip,row};
    });
    return <div className={`timeline-row ${collapsed?'track-collapsed':''} ${locked?'track-locked':''} ${settings?.muted?'track-muted':''}`} data-timeline-track={track} key={track} style={{minHeight:collapsed?30:Math.max(37,endings.length*27+8)}}>
      <div className="track-name">
        <button type="button" title={collapsed?'Expand track':'Collapse track'} aria-label={(collapsed?'Expand ':'Collapse ')+trackNames[track]} onClick={()=>toggle(track,'collapsed')}>{collapsed?<ChevronRight size={13}/>:<ChevronDown size={13}/>}</button>
        <span className={`track-icon track-${track}`}><Icon size={14}/></span>
        <span className="timeline-track-title" title={trackNames[track]}>{trackNames[track]}<small>{source.length}</small></span>
        <button type="button" aria-label={(settings?.muted?'Unmute ':'Mute ')+trackNames[track]} title={settings?.muted?'Unmute track':'Mute track'} onClick={()=>toggle(track,'muted')}>{settings?.muted?<VolumeX size={13}/>:<Volume2 size={13}/>}</button>
        {(track==='dialogue'||track==='audio'||track==='music')&&<button type="button" className={settings?.solo?'track-solo-active':''}
          aria-label={(settings?.solo?'Unsolo ':'Solo ')+trackNames[track]} title={settings?.solo?'Stop solo':'Solo this audio track'} onClick={()=>toggle(track,'solo')}><Headphones size={13}/></button>}
        <button type="button" aria-label={(locked?'Unlock ':'Lock ')+trackNames[track]} title={locked?'Unlock track':'Lock track'} onClick={()=>toggle(track,'locked')}>{locked?<Lock size={13}/>:<Unlock size={13}/>}</button>
        <button type="button" title={'Add '+trackNames[track]+' clip'} aria-label={'Add '+trackNames[track]+' clip'} disabled={locked} onClick={()=>add(track)}><Plus size={13}/></button>
      </div>
      <div className={`lane ${dropTrack===track?'timeline-drop-target':''}`} data-timeline-track={track} tabIndex={0} aria-label={trackNames[track]+' timeline lane'}
        onPointerDown={event=>{if(event.target===event.currentTarget){selectClips([]);event.currentTarget.focus({preventScroll:true});}}}
        onDragOver={event=>{if(!locked){event.preventDefault();event.dataTransfer.dropEffect='copy';setDropTrack(track);}}}
        onDragLeave={()=>setDropTrack(null)}
        onDrop={event=>insertDropped(event,track)}>
        {rows.map(({clip,row})=>{
          const selected=chosen.has(clip.id);
          const tiny=clip.length*pixelsPerSecond<26;
          return <div role="button" tabIndex={0} key={clip.id} aria-label={`${trackNames[track]}: ${clipLabel(clip,names)}`}
            aria-pressed={selected} title={`${clipLabel(clip,names)} · ${clip.start.toFixed(2)}–${(clip.start+clip.length).toFixed(2)}s${clip.track==='camera'?' · '+clip.transition+' · '+(clip.focus?names[clip.focus]??clip.focus:'auto focus')+' · exclusive':''}`}
            className={`clip clip-${track} ${selected?'clip-selected':''} ${tiny?'clip-tiny':''} ${drag.current?.ids.includes(clip.id)?'clip-preview':''} ${clip.track==='camera'?'cinematic-shot':''}`}
            style={{left:clip.start/scene.duration*100+'%',width:clip.length/scene.duration*100+'%',top:4+row*27}}
            onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();selectionFor(clip.id,event);seek(clip.start);}}}
            onContextMenu={event=>{event.preventDefault();if(!selected)selectClips([clip.id]);setMenu({x:Math.min(event.clientX,window.innerWidth-204),y:Math.min(event.clientY,window.innerHeight-266),id:clip.id});}}
            onPointerDown={event=>pointerDown(event,clip)}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={()=>{drag.current=null;setPreview(null);}}
            onLostPointerCapture={()=>{drag.current=null;setPreview(null);}}>
            {!locked&&<span className="clip-handle" data-edge="in" title="Trim start"/>}
            {(clip.track==='dialogue'||((clip.track==='audio'||clip.track==='music')&&clip.asset.startsWith('asset:')))&&<AudioWaveform asset={clip.asset} offset={clip.offset} length={clip.length}/>}<Icon size={11}/><span className="clip-text">{clipLabel(clip,names)}{clip.track==='camera'&&<small className="camera-clip-mode"> {clip.transition === 'glide' ? '↝' : '│'}</small>}</span>
            {clip.track==='movement'&&clip.keyframes?.map((key,index)=><span key={index} role="button" tabIndex={0}
              className={`timeline-keyframe ${selectedKeyframe?.clipId===clip.id&&selectedKeyframe.index===index?'selected':''}`}
              style={{left:key.time*100+'%'}} title={`Keyframe ${index+1} · ${(clip.start+clip.length*key.time).toFixed(2)}s`}
              aria-label={`Select keyframe ${index+1} in ${clip.id}`}
              onPointerDown={event=>{event.stopPropagation();event.currentTarget.focus({preventScroll:true});selectKeyframe(clip.id,index);seek(clip.start+clip.length*key.time);}}
              onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.stopPropagation();event.preventDefault();selectKeyframe(clip.id,index);}}}/>)}
            {!locked&&<span className="clip-handle right" data-edge="out" title="Trim end"/>}
          </div>;
        })}
        {!collapsed&&!rows.length&&<span className="timeline-empty-track">{locked?'Locked': 'Drag an action here or use + to add a clip'}</span>}
      </div>
    </div>;
  };
  return <section className={`timeline-panel professional-timeline ${compact?'timeline-compact':''}`} aria-label="Timeline">
    <header>
      <div className="timeline-title">
        <button className="timeline-fold" onClick={onCompact} aria-label={compact?'Expand timeline':'Collapse timeline'}>{compact?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
        <h2>Timeline</h2><span className="timeline-duration">{scene.duration.toFixed(1)}s</span>
        <label className="timeline-duration-field" title="Change real scene duration in seconds">Duration <input type="number" aria-label="Scene duration in seconds" key={scene.duration} min={1} max={180} step={0.1} defaultValue={scene.duration} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}} onBlur={event=>{const value=Number(event.currentTarget.value);if(Number.isFinite(value)&&value!==scene.duration)onResizeScene(value);else event.currentTarget.value=String(scene.duration);}}/> s</label>
        <button className="quiet mini" title="Shorten the actual scene by five seconds; trim clips that cross the endpoint" onClick={()=>onResizeScene(Math.max(1,scene.duration-5))} disabled={scene.duration<=1}>−5s</button>
        <button className="quiet mini" title="Extend the actual scene by five seconds" onClick={()=>onResizeScene(Math.min(180,scene.duration+5))} disabled={scene.duration>=180}>+5s</button>
        {selectedClipIds.length>1&&<span className="timeline-selected-count">{selectedClipIds.length} selected</span>}
      </div>
      <div className="timeline-tools">
        <button className="quiet mini" onClick={()=>add()} title="Add clip"><Plus size={15}/><span>Add</span></button>
        <IconButton title="Split at playhead (S)" onClick={split} disabled={!selectedClipIds.length}><Scissors size={15}/></IconButton>
        <IconButton title="Duplicate selected (Ctrl/Cmd+D)" onClick={duplicate} disabled={!selectedClipIds.length}><CopyPlus size={15}/></IconButton>
        <IconButton title="Copy selected (Ctrl/Cmd+C)" onClick={copy} disabled={!selectedClipIds.length}><Copy size={15}/></IconButton>
        <IconButton title="Paste at playhead (Ctrl/Cmd+V)" onClick={paste}><ClipboardPaste size={15}/></IconButton>
        <IconButton title="Delete selected (Backspace/Delete)" onClick={remove} disabled={!selectedClipIds.length&&!selectedKeyframe}><Trash2 size={15}/></IconButton>
        <span className="divider"/>
        <IconButton title="Shortcut help" onClick={()=>setShortcuts(v=>!v)}><Keyboard size={16}/></IconButton>
        <span className="divider"/>
        <IconButton title={snap?'Disable snapping':'Enable snapping'} active={snap} onClick={()=>setSnap(v=>!v)}><Magnet size={16}/></IconButton>
        <IconButton title="Zoom out timeline (−)" onClick={()=>setZoomAround(zoom/1.4)} disabled={zoom<=1}><ZoomOut size={16}/></IconButton>
        <span className="zoom-label">{Math.round(zoom*100)}%</span>
        <IconButton title="Zoom in timeline (+)" onClick={()=>setZoomAround(zoom*1.4)} disabled={zoom>=9}><ZoomIn size={16}/></IconButton>
        <IconButton title="Fit entire scene to timeline width" onClick={()=>{setZoom(1);if(viewportRef.current)viewportRef.current.scrollLeft=0;}}><Maximize2 size={15}/></IconButton>
      </div>
    </header>
    {shortcuts&&<div className="timeline-shortcuts" role="region" aria-label="Timeline keyboard shortcuts">
      <strong>Keyboard shortcuts</strong><span>Space · Play/Pause</span><span>Ctrl/Cmd + Z · Undo</span>
      <span>Ctrl/Cmd + Shift + Z · Redo</span><span>Ctrl/Cmd + C/X/V · Copy/Cut/Paste</span>
      <span>Ctrl/Cmd + D · Duplicate</span><span>S · Split at playhead</span>
      <span>Backspace / Delete · Delete selected clips or keyframe</span><span>Ctrl/Cmd + A · Select all timeline clips</span>
      <span>+ / − · Timeline zoom</span><span>Escape · Clear selection</span>
      <span>Shift+Click · Select range</span><span>Ctrl/Cmd+Click · Toggle selection</span>
      <span>Drag edges · Trim</span><span>Right-click clip · Actions</span>
      <span>Double-click ruler · Add marker</span><span>Right-click marker · Remove marker</span>
      <button className="quiet" onClick={()=>setShortcuts(false)}>Close help</button>
    </div>}
    {!compact&&<div ref={viewportRef} className="timeline-scroll">
      <div className="timeline-sheet" style={{width:sheetWidth}}>
        <div className="ruler">
          <div className="ruler-label"><ListFilter size={12}/> TRACKS</div>
          <div ref={surface} className="ruler-points" onPointerDown={event=>{if(event.button!==0)return;scrub.current=true;event.currentTarget.setPointerCapture(event.pointerId);seekAt(event);}} onPointerMove={event=>{if(scrub.current)seekAt(event);}} onPointerUp={()=>{scrub.current=false;}} onPointerCancel={()=>{scrub.current=false;}}
            onDoubleClick={event=>{const box=surface.current?.getBoundingClientRect();if(!box)return;const at=Math.round(clamp((event.clientX-box.left)/box.width)*scene.duration*100)/100;apply({...scene,markers:[...markers,{id:uid(),name:'Marker '+(markers.length+1),time:at}]});}}>
            {ticks.map((value,index)=><span key={index} className={index===divisions?'last-tick':''} style={{left:index/divisions*100+'%'}}>{Number(value.toFixed(2))}s</span>)}
            {markers.map(marker=><button type="button" key={marker.id} className="timeline-ruler-marker" title={marker.name+' · '+marker.time+'s (right-click to remove)'} aria-label={marker.name} style={{left:marker.time/scene.duration*100+'%'}} onPointerDown={event=>event.stopPropagation()} onClick={()=>seek(marker.time)} onContextMenu={event=>{event.preventDefault();apply({...scene,markers:markers.filter(item=>item.id!==marker.id)});}}><span/></button>)}
          </div>
        </div>
        <div className="timeline-grid" aria-hidden="true"><div className="grid-lines">{ticks.slice(1).map((value,index)=><i key={index} style={{left:(index+1)/divisions*100+'%'}}/>)}</div><div className="playhead" ref={needle} style={{left:playhead/scene.duration*100+'%'}}><i/></div></div>
        {tracks.filter(track=>['actors','movement','body','face','dialogue','audio','music','camera'].includes(track)||byTrack[track].length).map(lane)}
      </div>
    </div>}
    {menu&&<div className="timeline-context-menu" role="menu" style={{left:menu.x,top:menu.y}}>
      <button role="menuitem" onClick={()=>{copy();setMenu(null);}}>Copy <small>Ctrl+C</small></button>
      <button role="menuitem" onClick={()=>{cut();setMenu(null);}}>Cut <small>Ctrl+X</small></button>
      <button role="menuitem" onClick={()=>{paste();setMenu(null);}}>Paste <small>Ctrl+V</small></button>
      <button role="menuitem" onClick={()=>{duplicate();setMenu(null);}}>Duplicate <small>Ctrl+D</small></button>
      <button role="menuitem" onClick={()=>{split();setMenu(null);}}>Split <small>S</small></button>
      <button role="menuitem" onClick={()=>{remove();setMenu(null);}}>Delete <small>⌫</small></button>
    </div>}
    {!scene.clips.length&&!compact&&<span className="timeline-first-tip">Start by adding an actor, action, dialogue or camera clip. You can also drag an action or sound from Assets.</span>}
  </section>;
}
