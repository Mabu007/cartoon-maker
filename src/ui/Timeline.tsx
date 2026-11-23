import { useEffect, useMemo, useRef, useState, type PointerEvent, type DragEvent } from 'react';
import { ChevronDown, ChevronUp, Copy, Keyboard, Plus, Trash2, ZoomIn, ZoomOut, Maximize2, Scissors, Magnet, Lock, Unlock, Volume2, VolumeX, Headphones, ChevronRight, ListFilter, Clapperboard, Image, CopyPlus, Camera, ClipboardPaste, PanelBottom } from 'lucide-react';
import { AudioWaveform } from './AudioWaveform.tsx';
import { animations, clamp } from '../engine/animation.ts';
import { movieTicks, type MovieTiming, type MovieCursor } from '../engine/movieTime.ts';
import { TimelineResize } from './TimelineResize.tsx';
import { actionLayer, actionUsesProp, soundDurations, type SoundName } from '../engine/performanceCatalog.ts';
import { actions, tracks, trackNames, uid, type Action, type Character, type Clip, type Scene, type Track } from '../engine/schema.ts';
import { selectClipRange, snapGuides, snapTime, snapMoveDelta, moveTimelineClips, splitTimelineClips, trimTimelineClip, trackIsLocked } from '../engine/timelineEditing.ts';
import { type Selection } from '../studio.ts';
import { clipLabel, clock, IconButton, trackIcon } from './shared.tsx';

type Keyframe = { clipId: string; index: number } | null;
type DragSession = {
  sceneId: string; ids: string[]; clip: Clip; startX: number; edge: 'move'|'in'|'out';
  moved: boolean; preview: Scene; base: Scene; collapseOnClick: boolean; guides: number[]; lastDelta: number;
};
type ContextMenu = {x:number;y:number;id:string;at:number}|null;

const standardTracks = new Set<Track>(['actors','movement','body','performance','face','dialogue','audio','music','camera','transition','vfx','text']);
function sceneTracks(scene: Scene) {
  const groups = new Map(tracks.map(track => [track, [] as Clip[]]));
  for (const clip of scene.clips) groups.get(clip.track)!.push(clip);
  const actorRows = new Map(scene.actors.map((actor, index) => [actor.id, index]));
  return new Map(tracks.map(track => {
    const settings = scene.trackSettings?.[track];
    const source = groups.get(track)!;
    const endings:number[] = [];
    const rows = settings?.collapsed ? [] : [...source].sort((a,b)=>a.start-b.start).map(clip => {
      if (clip.track === 'actors') return { clip, row: actorRows.get(clip.actor) ?? 0 };
      let row = endings.findIndex(end => end <= clip.start + .0001);
      if (row < 0) row = endings.length;
      endings[row] = clip.start + clip.length;
      return { clip, row };
    });
    const count = track === 'actors' ? actorRows.size : endings.length;
    return [track, { rows, settings, source, height: settings?.collapsed ? 30 : Math.max(37, count * 27 + 8) }] as const;
  }));
}
const groupedTracks = new WeakMap<Scene, ReturnType<typeof sceneTracks>>();
function packedTracks(scene: Scene) {
  const cached = groupedTracks.get(scene);
  if (cached) return cached;
  const groups = sceneTracks(scene);
  groupedTracks.set(scene, groups);
  return groups;
}

export function Timeline({
  scene, movie, characters, selection, selectedClipIds, selectedKeyframe, selectClips, selectKeyframe,
  seek, seekMovie, seekScene, addScene, deleteScene, manageScenes, tall, onTall, onPath, onPoint, onPropAction, add, remove, duplicate, copy, cut, paste, split,
  apply, compact, playing, onCompact, onResizeScene, playhead, onPerformance
}: {
  scene: Scene; movie: MovieTiming; characters: Character[]; selection: Selection;
  selectedClipIds: string[]; selectedKeyframe: Keyframe;
  selectClips: (ids: string[]) => void; selectKeyframe: (clipId:string,index:number) => void;
  seek: (t:number) => void; seekMovie:(time:number)=>void; seekScene:(id:string,time:number)=>void;
  tall:boolean;onTall:()=>void;
  onPath:(actor:string,gait:'walk'|'run',start:number)=>void;
  onPropAction:(actor:string,action:Action,start:number)=>void;
  onPoint:(actor:string,action:'point'|'reach',start:number)=>void;
  addScene:()=>void; deleteScene:(scene:Scene)=>void; manageScenes:()=>void; add: (track?:Track) => void;
  remove: () => void; duplicate: () => void; copy: () => void; cut: () => void; paste: () => void; split: () => void;
  apply: (next:Scene, ids?:string[]) => void; compact:boolean; playing:boolean; onCompact:()=>void;
  onResizeScene:(duration:number)=>void; playhead:number; onPerformance:()=>void;
}) {
  const [zoom,setZoom]=useState(1), [viewport,setViewport]=useState(900), [scrollLeft,setScrollLeft]=useState(0);
  const [snap,setSnap]=useState(true),[shortcuts,setShortcuts]=useState(false);
  const [menu,setMenu]=useState<ContextMenu|null>(null),[preview,setPreview]=useState<Scene|null>(null);
  const [drop,setDrop]=useState<{track:Track;sceneId:string}|null>(null);
  const viewportRef=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),needle=useRef<HTMLDivElement>(null);
  const playheadRef=useRef(playhead),drag=useRef<DragSession|null>(null),scrub=useRef(false);
  const anchor=useRef<{sceneId:string;clipId:string}|null>(null);
  const [labelWidth,setLabelWidth]=useState(200);
  const fitWidth=Math.max(viewport-labelWidth, 120);
  const sheetWidth=labelWidth+fitWidth*zoom;
  const unitsPerPixel=movie.duration/(sheetWidth-labelWidth);
  const pixelsPerSecond=1/unitsPerPixel;
  const maxZoom=Math.max(9, movie.duration * 95 / fitWidth);
  const chosen=new Set(selectedClipIds);
  const cast=useMemo(()=>new Map(characters.map(character=>[character.id,character.name])),[characters]);
  const models=useMemo(()=>movie.spans.map(span=>({
    ...span, packs:packedTracks(span.scene),
    names:Object.fromEntries(span.scene.actors.map(actor=>[actor.id,cast.get(actor.characterId)??'Character']))
  })),[movie.spans,cast]);
  const visibleStart=scrollLeft*unitsPerPixel;
  const visibleEnd=(scrollLeft+viewport-labelWidth)*unitsPerPixel;
  const visible=models.filter(span=>span.scene.id===scene.id ||
    (span.end>=visibleStart-80*unitsPerPixel && span.start<=visibleEnd+80*unitsPerPixel));
  const activePacks=packedTracks(scene);
  const previewPacks=preview && preview.id===scene.id ? packedTracks(preview) : undefined;
  useEffect(()=>{
    const element=viewportRef.current;
    if(!element)return;
    const size=()=>{
      setViewport(element.clientWidth);
      setLabelWidth(parseFloat(getComputedStyle(element).getPropertyValue('--track-label')) || 200);
    };
    size();
    const observer=new ResizeObserver(size);observer.observe(element);return()=>observer.disconnect();
  },[compact]);
  useEffect(()=>{
    const time=(event:Event)=>{
      const {at,reveal}=(event as CustomEvent<MovieCursor>).detail;
      playheadRef.current=clamp(at,0,movie.duration);
      if(needle.current)needle.current.style.left=(playheadRef.current/movie.duration*100)+'%';
      const el=viewportRef.current;
      if(!el || (!playing&&!reveal) || scrub.current || drag.current) return;
      const x=labelWidth+playheadRef.current*pixelsPerSecond;
      if(x < el.scrollLeft+labelWidth-1 || x > el.scrollLeft+el.clientWidth-12)
        el.scrollLeft=Math.max(0,x-labelWidth-20);
    };
    window.addEventListener('sirvibe-movie-time',time);
    return()=>window.removeEventListener('sirvibe-movie-time',time);
  },[movie.duration, labelWidth, pixelsPerSecond, playing]);
  useEffect(()=>{
    playheadRef.current=playhead;
    if(needle.current)needle.current.style.left=(playhead/movie.duration*100)+'%';
  },[playhead,movie.duration,compact]);
  useEffect(()=>{
    if(!menu)return;
    const dismiss=(event:globalThis.PointerEvent)=>{
      if(!(event.target as HTMLElement)?.closest('.timeline-context-menu'))setMenu(null);
    };
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(null);};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',key);};
  },[menu]);
  useEffect(()=>{
    if(drag.current?.sceneId!==scene.id){drag.current=null;setPreview(null);}
    const el=viewportRef.current;
    if (!el || drag.current || scrub.current) return;
    const x=playheadRef.current*pixelsPerSecond;
    if(x<el.scrollLeft || x>el.scrollLeft+el.clientWidth-labelWidth-18)
      el.scrollLeft=Math.max(0,x-16);
  },[scene.id,compact]);
  const setZoomAround=(next:number)=>{
    const value=clamp(next,1,maxZoom), el=viewportRef.current;
    if(!el){setZoom(value);return;}
    const at=playheadRef.current/movie.duration;
    const viewportPosition=labelWidth+at*fitWidth*zoom-el.scrollLeft;
    setZoom(value);
    requestAnimationFrame(()=>{el.scrollLeft=Math.max(0,labelWidth+at*fitWidth*value-viewportPosition);});
  };
  useEffect(()=>{
    const element=viewportRef.current;
    if(!element || compact)return;
    const wheel=(event:WheelEvent)=>{
      if(event.ctrlKey||event.metaKey){event.preventDefault();setZoomAround(zoom*(event.deltaY>0?.85:1.15));}
    };
    element.addEventListener('wheel',wheel,{passive:false});
    return()=>element.removeEventListener('wheel',wheel);
  },[zoom,fitWidth,labelWidth,compact,movie.duration,maxZoom]);
  useEffect(()=>{
    const onZoom=(event:Event)=>setZoomAround(zoom*((event as CustomEvent<'in'|'out'>).detail==='in'?1.4:1/1.4));
    window.addEventListener('toonroom-zoom',onZoom);
    return()=>window.removeEventListener('toonroom-zoom',onZoom);
  },[zoom,fitWidth,labelWidth,movie.duration,maxZoom]);
  const timeAt=(event:{clientX:number})=>{
    const box=surface.current?.getBoundingClientRect();
    return box ? Math.round(clamp((event.clientX-box.left)/box.width)*movie.duration*100)/100 : 0;
  };
  const selectionFor=(source:Scene,id:string,event:{shiftKey:boolean;metaKey:boolean;ctrlKey:boolean})=>{
    const active=source.id===scene.id;
    const from=anchor.current?.sceneId===source.id?anchor.current.clipId:active?selection?.id:undefined;
    const ids=selectClipRange(source,active?selectedClipIds:[],from,id,event.shiftKey,event.metaKey||event.ctrlKey);
    if(!event.shiftKey)anchor.current={sceneId:source.id,clipId:id};
    selectClips(ids);
    return ids;
  };
  function pointerDown(event:PointerEvent<HTMLDivElement>, source:Scene, clip:Clip) {
    if(event.button!==0)return;
    const hit=event.target as HTMLElement;
    if(hit.closest('.timeline-keyframe'))return;
    const active=source.id===scene.id;
    if(!active) seekScene(source.id,clip.start);
    const collapseOnClick = active && !event.shiftKey && !event.ctrlKey && !event.metaKey && chosen.has(clip.id) && chosen.size > 1;
    const ids = collapseOnClick ? selectedClipIds : selectionFor(source,clip.id,event);
    event.currentTarget.focus({preventScroll:true});
    if(!ids.includes(clip.id))return;
    if(trackIsLocked(source,clip.track)){seekScene(source.id,clip.start);return;}
    const edge=hit.closest('[data-edge]')?.getAttribute('data-edge') as 'in'|'out'|null;
    const moving = edge ? [clip.id] : ids;
    drag.current={base:source,collapseOnClick,guides:snapGuides(source,playheadRef.current-(movie.byId.get(source.id)?.start??0),moving),sceneId:source.id,ids:moving,clip,startX:event.clientX,edge:edge??'move',moved:false,preview:source,lastDelta:0};
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
        const hit=document.elementFromPoint(event.clientX,event.clientY);
        const over=hit?.closest<HTMLElement>('[data-timeline-track]');
        const destination=hit?.closest<HTMLElement>('.movie-track-segment')?.dataset.sceneId===data.sceneId
          ? over?.dataset.timelineTrack as Track|undefined : undefined;
        if(destination && destination!==data.clip.track)
          next=moveTimelineClips(scene,data.ids,data.lastDelta,destination);
      }
      if(next!==scene)apply(next,data.ids);
    }catch{ /* App edit boundary reports validation errors. */ }
  }
  function insertDropped(event:DragEvent<HTMLDivElement>,track:Track,source:Scene){
    event.preventDefault();setDrop(null);
    if(trackIsLocked(source,track))return;
    const box=event.currentTarget.getBoundingClientRect();
    const start=Math.max(0,Math.min(source.duration-.1,Math.round(clamp((event.clientX-box.left)/box.width)*source.duration*100)/100));
    const action=actions.find(value=>value===event.dataTransfer.getData('application/x-toonroom-action'));
    const sound=event.dataTransfer.getData('application/x-toonroom-sound');
    const actor=(source.id===scene.id?source.actors.find(a=>a.id===selection?.id):undefined)??source.actors[0];
    const insert=(clip:Clip)=>{seekScene(source.id,start);apply({...source,clips:[...source.clips,clip]},[clip.id]);};
    if(actor&&action&&(track==='body'||track==='movement')){
      if(action==='walk'||action==='run'){
        if(trackIsLocked(source,'movement'))return;
        seekScene(source.id,start);
        onPath(actor.id,action,start);
      } else if(track==='body'){
        if(action==='point'||action==='reach'){
          seekScene(source.id,start);
          onPoint(actor.id,action,start);
          return;
        }
        if(actionUsesProp(action)||action==='sleep-seated'){
          seekScene(source.id,start);
          onPropAction(actor.id,action,start);
          return;
        }
        const animation=animations[action];
        const length=Math.min(animation.loop?Math.max(1.5,animation.duration):animation.duration,source.duration-start);
        const layer=actionLayer(action);
        insert({id:uid(),track:'body',actor:actor.id,start,length,action,layer});
      }
    }
    if((track==='audio'||track==='music')&&Object.hasOwn(soundDurations,sound)){
      const length=Math.min(soundDurations[sound as SoundName],source.duration-start);
      insert({id:uid(),track,name:sound,start,length,volume:.6,muted:false,offset:0,asset:'builtin:'+sound});
    }
  }
  function toggle(track:Track,key:'muted'|'locked'|'collapsed'|'solo'){
    const previous=scene.trackSettings?.[track]??{};
    apply({...scene,trackSettings:{...scene.trackSettings,[track]:{...previous,[key]:!previous[key]}}});
  }
  const percent=(time:number)=>time/movie.duration*100+'%';
  const ticks=movieTicks(movie.duration,pixelsPerSecond,visibleStart,visibleEnd);
  const lane=(track:Track)=>{
    const Icon=trackIcon[track];
    const {settings,source}=activePacks.get(track)!;
    const collapsed=Boolean(settings?.collapsed),locked=Boolean(settings?.locked);
    const height=Math.max(...models.map(model=>
      ((model.scene.id===scene.id && previewPacks) || model.packs).get(track)!.height));
    return <div className="timeline-row" data-timeline-track={track} key={track} style={{minHeight:height}}>
      <div className="track-name">
        <button type="button" title={collapsed?'Expand track':'Collapse track'} aria-label={(collapsed?'Expand ':'Collapse ')+trackNames[track]} onClick={()=>toggle(track,'collapsed')}>{collapsed?<ChevronRight size={13}/>:<ChevronDown size={13}/>}</button>
        <span className={`track-icon track-${track}`}><Icon size={14}/></span>
        <span className="timeline-track-title" title={trackNames[track]+' · '+scene.name}>{trackNames[track]}<small>{source.length}</small></span>
        <button type="button" aria-label={(settings?.muted?'Unmute ':'Mute ')+trackNames[track]} title={settings?.muted?'Unmute track':'Mute track'} onClick={()=>toggle(track,'muted')}>{settings?.muted?<VolumeX size={13}/>:<Volume2 size={13}/>}</button>
        {(track==='dialogue'||track==='audio'||track==='music')&&<button type="button" className={settings?.solo?'track-solo-active':''}
          aria-label={(settings?.solo?'Unsolo ':'Solo ')+trackNames[track]} title={settings?.solo?'Stop solo':'Solo this audio track'} onClick={()=>toggle(track,'solo')}><Headphones size={13}/></button>}
        <button type="button" aria-label={(locked?'Unlock ':'Lock ')+trackNames[track]} title={locked?'Unlock track':'Lock track'} onClick={()=>toggle(track,'locked')}>{locked?<Lock size={13}/>:<Unlock size={13}/>}</button>
        {track==='performance'
          ? <button type="button" className="quiet mini track-record" title="Record a new performance with your webcam" aria-label="Record a new webcam performance" disabled={locked} onClick={onPerformance}><Camera size={14}/></button>
          : <button type="button" title={'Add '+trackNames[track]+' clip'} aria-label={'Add '+trackNames[track]+' clip'} disabled={locked} onClick={()=>add(track)}><Plus size={13}/></button>}
      </div>
      <div className="lane" data-timeline-track={track} aria-label={trackNames[track]+' timeline lane'}>
        {visible.map(span=>{
          const source=span.scene;
          const active=source.id===scene.id;
          const { rows, settings }=((active&&previewPacks)||span.packs).get(track)!;
          const locked=Boolean(settings?.locked);
          const names=span.names;
          const draggingHere=drop?.track===track&&drop.sceneId===source.id;
          return <div key={source.id} data-scene-id={source.id} className={`movie-track-segment ${active?'active-scene':''} ${settings?.muted?'track-muted':''} ${locked?'track-locked':''} ${draggingHere?'timeline-drop-target':''}`}
            style={{left:percent(span.start),width:percent(source.duration)}} tabIndex={active?0:-1}
            aria-label={source.name+' · '+trackNames[track]}
            onClick={event=>{
              if(event.target!==event.currentTarget)return;
              seekScene(source.id,clamp(timeAt(event)-span.start,0,source.duration));
              selectClips([]);event.currentTarget.focus({preventScroll:true});
            }}
            onDragOver={event=>{if(!locked){event.preventDefault();event.dataTransfer.dropEffect='copy';setDrop({track,sceneId:source.id});}}}
            onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDrop(null);}}
            onDrop={event=>insertDropped(event,track,source)}>
          {track==='actors'&&!settings?.collapsed&&source.actors.map((actor,index)=>
            <span key={actor.id} className="actor-lane-name" style={{top:8+index*27}}
              title={names[actor.id]}>{names[actor.id]}</span>)}
        {rows.map(({clip,row})=>{
          const selected=active&&chosen.has(clip.id);
          const start=span.start+clip.start;
          if(!selected && (start+clip.length<visibleStart-80*unitsPerPixel || start>visibleEnd+80*unitsPerPixel))return null;
          const tiny=clip.length*pixelsPerSecond<26;
          return <div role="button" tabIndex={0} key={clip.id} aria-label={`${trackNames[track]}: ${clipLabel(clip,names)}`}
            aria-pressed={selected} title={`${clipLabel(clip,names)} · ${(span.start+clip.start).toFixed(2)}–${(span.start+clip.start+clip.length).toFixed(2)}s${clip.track==='camera'?' · '+clip.transition+' · '+(clip.focus?names[clip.focus]??clip.focus:'auto focus')+' · exclusive':''}`}
            className={`clip clip-${track} ${selected?'clip-selected':''} ${tiny?'clip-tiny':''} ${drag.current?.sceneId===source.id&&drag.current.ids.includes(clip.id)?'clip-preview':''} ${clip.track==='camera'?'cinematic-shot':''}`}
            style={{left:clip.start/source.duration*100+'%',width:clip.length/source.duration*100+'%',top:4+row*27}}
            onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();seekScene(source.id,clip.start);selectionFor(source,clip.id,event);}}}
            onContextMenu={event=>{
              event.preventDefault();
              const at=clamp(timeAt(event)-span.start,clip.start,clip.start+clip.length);
              if(!active)seekScene(source.id,at);
              if(!selected)selectClips([clip.id]);
              const maxHeight='offset' in clip?360:266;
              setMenu({x:Math.max(6,Math.min(event.clientX,window.innerWidth-204)),y:Math.max(6,Math.min(event.clientY,window.innerHeight-maxHeight)),id:clip.id,at});
            }}
            onPointerDown={event=>pointerDown(event,source,clip)}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={()=>{drag.current=null;setPreview(null);}}
            onLostPointerCapture={()=>{drag.current=null;setPreview(null);}}>
            {!tiny&&'offset' in clip&&<span aria-hidden="true" className="clip-fade-zones">
              {clip.fadeIn? <i className="fade-in" style={{width:Math.min(100,clip.fadeIn/clip.length*100)+'%'}}/>:null}
              {clip.fadeOut? <i className="fade-out" style={{width:Math.min(100,clip.fadeOut/clip.length*100)+'%'}}/>:null}
            </span>}
            {!locked&&<span className="clip-handle" data-edge="in" title="Trim start"/>}
            {!tiny&&(clip.track==='dialogue'||((clip.track==='audio'||clip.track==='music')&&clip.asset.startsWith('asset:')))&&<AudioWaveform asset={clip.asset} offset={clip.offset} length={clip.length}/>}<Icon size={11}/><span className="clip-label-text">{clipLabel(clip,names)}{clip.track==='camera'&&<small className="camera-clip-mode"> {clip.transition === 'glide' ? '↝' : '│'}</small>}</span>
            {clip.track==='performance'&&clip.performance.map((key,index)=><i key={index} className="performance-keyframe" style={{left:key.time*100+'%'}} title={`Captured pose ${index+1} · ${(span.start+clip.start+clip.length*key.time).toFixed(2)}s`}/>)}
            {clip.track==='movement'&&clip.keyframes?.map((key,index)=><span key={index} role="button" tabIndex={0}
              className={`timeline-keyframe ${active&&selectedKeyframe?.clipId===clip.id&&selectedKeyframe.index===index?'selected':''}`}
              style={{left:key.time*100+'%'}} title={`Keyframe ${index+1} · ${(span.start+clip.start+clip.length*key.time).toFixed(2)}s`}
              aria-label={`Select keyframe ${index+1} in ${clip.id}`}
              onPointerDown={event=>{event.stopPropagation();event.currentTarget.focus({preventScroll:true});seekScene(source.id,clip.start+clip.length*key.time);selectKeyframe(clip.id,index);}}
              onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.stopPropagation();event.preventDefault();seekScene(source.id,clip.start+clip.length*key.time);selectKeyframe(clip.id,index);}}}/>)}
            {!locked&&<span className="clip-handle right" data-edge="out" title="Trim end"/>}
          </div>;
        })}
        {track==='performance'&&!settings?.collapsed&&!rows.length&&active&&!locked&&<button type="button" className="performance-track-empty" onClick={onPerformance}><Camera size={14}/> Record a webcam performance to create your first take</button>}
        {locked&&!settings?.collapsed&&!rows.length&&track!=='actors'&&active&&<span className="timeline-empty-track">Locked</span>}
          </div>;
        })}
      </div>
    </div>;
  };
  const menuClip=scene.clips.find(clip=>clip.id===menu?.id);
  const menuAudio=menuClip&&'offset' in menuClip?menuClip:undefined;
  const canEditAudio=menuAudio&&!trackIsLocked(scene,menuAudio.track);
  return <section className={`timeline-panel professional-timeline ${compact?'timeline-compact':''}`} aria-label="Timeline">
    {!compact&&<TimelineResize/>}
    <header>
      <div className="timeline-title">
        <button className="timeline-fold" onClick={onCompact} aria-label={compact?'Expand timeline':'Collapse timeline'}>{compact?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
        <h2>Movie timeline</h2><span className="timeline-duration" title="Total movie duration">{clock(movie.duration)}</span>
        <label className="timeline-duration-field" title="Change real scene duration in seconds">Scene duration <input type="number" aria-label="Scene duration in seconds" key={scene.id+'/'+scene.duration} min={1} max={180} step={0.1} defaultValue={scene.duration} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}} onBlur={event=>{const value=Number(event.currentTarget.value);if(Number.isFinite(value)&&value!==scene.duration)onResizeScene(value);else event.currentTarget.value=String(scene.duration);}}/> s</label>
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
        <IconButton title="Zoom in timeline (+)" onClick={()=>setZoomAround(zoom*1.4)} disabled={zoom>=maxZoom}><ZoomIn size={16}/></IconButton>
        <IconButton title={tall?'Restore timeline height (T)':'Expand timeline height (T)'} active={tall} onClick={onTall}><PanelBottom size={16}/></IconButton>
        <IconButton title="Fit entire movie to timeline width" onClick={()=>{setZoom(1);if(viewportRef.current)viewportRef.current.scrollLeft=0;}}><Maximize2 size={15}/></IconButton>
      </div>
      <button type="button" className="timeline-scene-delete" onClick={()=>deleteScene(scene)}
        aria-label={movie.spans.length===1?'Delete current scene and start with a blank scene':`Delete current scene: ${scene.name}`}
        title={movie.spans.length===1?'Clear this scene and replace it with a blank one (undo available)':`Delete "${scene.name}" (undo available)`}>
        <Trash2 size={15} aria-hidden="true"/><span>Delete scene</span>
      </button>
    </header>
    {shortcuts&&<div className="timeline-shortcuts" role="region" aria-label="Timeline keyboard shortcuts">
      <strong>Keyboard shortcuts</strong><span>Space · Play/Pause</span><span>Ctrl/Cmd + Z · Undo</span>
      <span>Ctrl/Cmd + Shift + Z · Redo</span><span>Ctrl/Cmd + C/X/V · Copy/Cut/Paste</span>
      <span>Ctrl/Cmd + D · Duplicate</span><span>S · Split at playhead</span>
      <span>Backspace / Delete · Delete selected clips or keyframe</span><span>Ctrl/Cmd + A · Select all clips in this scene</span>
      <span>T · Expand or restore timeline height</span>
      <span>↑ / ↓ · Previous or next clip edge</span><span>← / → · Step one frame. Hold to accelerate</span>
      <span>Shift + ← / → · Step half a second</span><span>+ / − · Timeline zoom</span><span>Escape · Clear selection</span>
      <span>Shift+Click · Select range</span><span>Ctrl/Cmd+Click · Toggle selection</span>
      <span>Drag edges · Trim</span><span>Right-click clip · Actions</span>
      <span>Double-click ruler · Add marker</span><span>Right-click marker · Remove marker</span>
      <button className="quiet" onClick={()=>setShortcuts(false)}>Close help</button>
    </div>}
    {!compact&&<div ref={viewportRef} className="timeline-scroll" onScroll={event=>setScrollLeft(event.currentTarget.scrollLeft)}>
      <div className="timeline-sheet" style={{width:sheetWidth}}>
        <div className="movie-timeline-header">
          <div className="movie-scenes-row">
            <div className="ruler-label movie-scenes-label">
              <button type="button" className="quiet" aria-label="Manage movie scenes" onClick={manageScenes}><Clapperboard size={13}/> Scenes</button>
              <IconButton title="Add scene at end of movie" onClick={addScene}><Plus size={15}/></IconButton>
            </div>
            <div className="movie-scenes-strip" aria-label="Movie scenes">
              {visible.map(span=><button type="button" key={span.scene.id} className="movie-scene-block"
                aria-current={span.scene.id===scene.id?'step':undefined} data-scene-id={span.scene.id}
                aria-label={`Scene ${span.index+1}: ${span.scene.name}`}
                title={`${span.scene.name} · ${span.scene.backgroundImage?'Custom background':span.scene.environment} · ${clock(span.start)}–${clock(span.end)}`}
                style={{left:percent(span.start),width:percent(span.scene.duration)}}
                onClick={()=>seekScene(span.scene.id,0)}>
                <span className="movie-scene-name">{span.index+1} · {span.scene.name.replace(/^Scene\s+\d+\s*·\s*/i,'').replace(/^Scene\s+\d+$/i,'Scene')}</span>
                {span.scene.backgroundImage&&<Image className="movie-scene-image" size={13} aria-label="Custom background"/>}
              </button>)}
            </div>
          </div>
          <div className="ruler">
            <div className="ruler-label"><ListFilter size={12}/> TRACKS</div>
            <div ref={surface} className="ruler-points" aria-label="Movie time ruler"
              onPointerDown={event=>{if(event.button!==0)return;scrub.current=true;event.currentTarget.setPointerCapture(event.pointerId);seekMovie(timeAt(event));}}
              onPointerMove={event=>{if(scrub.current)seekMovie(timeAt(event));}}
              onPointerUp={()=>{scrub.current=false;}} onPointerCancel={()=>{scrub.current=false;}} onLostPointerCapture={()=>{scrub.current=false;}}
              onDoubleClick={event=>{
                const at=timeAt(event);
                const span=movie.spans.find(entry=>at<entry.end)??movie.spans.at(-1)!;
                const target=span.scene,markers=target.markers??[];
                const local=clamp(at-span.start,0,target.duration);
                seekScene(target.id,local);
                apply({...target,markers:[...markers,{id:uid(),name:'Marker '+(markers.length+1),time:local}]});
              }}>
              {ticks.map(value=><span key={value} className={value===movie.duration?'last-tick':''} style={{left:percent(value)}}>{value<60?`${value}s`:clock(value).split('.')[0]}</span>)}
              {visible.flatMap(span=>(span.scene.markers??[]).map(marker=><button type="button" key={span.scene.id+'/'+marker.id}
                className="timeline-ruler-marker" title={marker.name+' · '+clock(span.start+marker.time)+' (right-click to remove)'}
                aria-label={marker.name} style={{left:percent(span.start+marker.time)}} onPointerDown={event=>event.stopPropagation()}
                onClick={()=>seekScene(span.scene.id,marker.time)}
                onContextMenu={event=>{event.preventDefault();seekScene(span.scene.id,marker.time);apply({...span.scene,markers:span.scene.markers!.filter(item=>item.id!==marker.id)});}}><span/></button>))}
            </div>
          </div>
        </div>
        <div className="timeline-grid" aria-hidden="true"><div className="grid-lines">
          {ticks.filter(value=>value>0).map(value=><i key={value} style={{left:percent(value)}}/>)}
          {visible.filter(span=>span.start>0).map(span=><i key={span.scene.id} className="movie-scene-cut" style={{left:percent(span.start)}}/>)}
        </div><div className="playhead" ref={needle} style={{left:percent(playhead)}}><i/></div></div>
        {tracks.filter(track=>standardTracks.has(track)||models.some(model=>model.packs.get(track)!.source.length)).map(lane)}
      </div>
    </div>}
    {menu&&<div className="timeline-context-menu" role="menu" style={{left:menu.x,top:menu.y}}>
      {menuAudio&&<>
        <button role="menuitem" disabled={!canEditAudio||menu.at<menuAudio.start+.1||menu.at>menuAudio.start+menuAudio.length-.1}
          onClick={()=>{const result=splitTimelineClips(scene,[menuAudio.id],menu.at);apply(result.scene,result.added);setMenu(null);}}>Split audio here</button>
        {(['fadeIn','fadeOut'] as const).map(edge=><button key={edge} role="menuitem" disabled={!canEditAudio} onClick={()=>{
          const length=menuAudio[edge]?0:Math.min(menuAudio.track==='music'?1:.25,menuAudio.length/2);
          apply({...scene,clips:scene.clips.map(clip=>clip.id===menuAudio.id?{...menuAudio,[edge]:length}:clip)},[menuAudio.id]);setMenu(null);
        }}>{menuAudio[edge]?'Remove':'Add'} fade {edge==='fadeIn'?'in':'out'}</button>)}
      </>}
      <button role="menuitem" onClick={()=>{copy();setMenu(null);}}>Copy <small>Ctrl+C</small></button>
      <button role="menuitem" onClick={()=>{cut();setMenu(null);}}>Cut <small>Ctrl+X</small></button>
      <button role="menuitem" onClick={()=>{paste();setMenu(null);}}>Paste <small>Ctrl+V</small></button>
      <button role="menuitem" onClick={()=>{duplicate();setMenu(null);}}>Duplicate <small>Ctrl+D</small></button>
      <button role="menuitem" onClick={()=>{split();setMenu(null);}}>Split <small>S</small></button>
      <button role="menuitem" onClick={()=>{remove();setMenu(null);}}>Delete <small>⌫</small></button>
    </div>}
  </section>;
}
