import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent } from 'react';
import { AlertCircle, Clapperboard, FlipHorizontal, Copy, Trash2, MousePointer2, ArrowUpToLine, ArrowDownToLine, ZoomIn, ZoomOut, Scan, Eye } from 'lucide-react';
import { createRenderer, type Format, type Renderer } from '../engine/renderer.ts';
import { type Project, type Scene, type Prop } from '../engine/schema.ts';
import { pathNodes,smoothPath } from '../engine/stagePath.ts';
import { defaultStageViewport,zoomStageAt,moveStageViewport } from '../engine/stageViewport.ts';
import { evaluate } from '../engine/evaluate.ts';
import { clamp } from '../engine/animation.ts';
import { prepareDialoguePreview, type Mixer } from '../services/audio.ts';
import type { LayerMove } from '../engine/sceneLayers.ts';
import type { Selection } from '../studio.ts';

type Position = { x: number; y: number };
type Drag = { sceneId: string; id: string; origin: Position; pointer: Position; current: Position; moved: boolean };
export type PreviewTime = { scene: Scene; local: number; movie: number };
export function Stage({ project, scene, time, playing, edit, format, selection, selected, move, subtitles, snap, mixer, quality, onFrame, onDestination, pathPoints, editPath, smoothGuide, movePathPoint, removePathPoint, edgePlacement, flipEntity, duplicateEntity, removeEntity, reorderEntity, dropProp, recoverActor, finishPathPoint }: {
  project: Project; scene: Scene; time: MutableRefObject<PreviewTime>; playing: boolean; edit: boolean; format: Format; quality: boolean;
  selection: Selection; selected: (selection: Selection) => void; move: (id: string, position: Position) => void; subtitles: boolean; snap: boolean;
  onDestination?: (position: Position, waypoint?: boolean) => void; pathPoints?: Position[]; editPath?:boolean; smoothGuide?:boolean; movePathPoint?:(index:number,point:Position)=>void; removePathPoint?:(index:number)=>void; edgePlacement?: boolean; mixer: MutableRefObject<Mixer | null>; onFrame?: (label: string) => void;
  reorderEntity?:(id:string,move:LayerMove)=>void;
  dropProp?:(kind:Prop['kind'],position:Position)=>void;
  recoverActor?:(id:string,position:Position)=>void;
  finishPathPoint?:(index:number,position:Position)=>void;
  flipEntity?: (id: string) => void; duplicateEntity?: (id: string) => void; removeEntity?: (id: string) => void;
}) {
  const mount = useRef<HTMLDivElement>(null), engine = useRef<Renderer | null>(null), drag = useRef<Drag | null>(null), hover = useRef<string | undefined>(undefined), repaint = useRef<() => void>(() => {});
  const nodeDrag=useRef<{index:number;pointerId:number;offset:Position}|undefined>(undefined);
  const stage=useRef<HTMLDivElement>(null);
  const [viewport,setViewport]=useState(defaultStageViewport);
  const pan=useRef<{pointerId:number;x:number;y:number}|undefined>(undefined);
  const [draggedPath,setDraggedPath]=useState<{index:number;position:Position}|undefined>();
  const screenTransform={transform:`translate(${viewport.panX}px,${viewport.panY}px) scale(${viewport.zoom})`,
    transformOrigin:'center center'} as const;
  const guide=useRef<SVGSVGElement>(null);
  const currentPath=useRef({points:pathPoints,smooth:smoothGuide});
  currentPath.current={points:pathPoints,smooth:smoothGuide};
  const renderedFrame=useRef<ReturnType<typeof evaluate> | undefined>(undefined);
  const dialogue = useRef<{ scene: Scene; amplitude: Awaited<ReturnType<typeof prepareDialoguePreview>> } | null>(null);
  useEffect(() => {
    let active = true;
    void prepareDialoguePreview(scene).then(amplitude => {
      if (!active) return;
      dialogue.current = { scene, amplitude };
      if (!props.current.playing) repaint.current();
    });
    return () => { active = false; };
  }, [scene]);
  const [status, setStatus] = useState('Loading preview…');
  const [restart, setRestart] = useState(0);
  const props = useRef({ project, scene, time, playing, edit, selection, subtitles, mixer, onFrame });
  props.current = { project, scene, time, playing, edit, selection, subtitles, mixer, onFrame };
  useEffect(() => {
    let alive = true, lastShot = '', failed = false;
    let lastSceneId = '', lastScenes: Scene[] | undefined;
    let timeListener: (() => void) | undefined;
    let visibilityListener: (() => void) | undefined;
    let activeRenderer: Renderer | null = null;
    let contextLost: ((event: Event) => void) | undefined;
    const fail = (error: unknown) => {
      if (!alive || failed) return;
      failed = true;
      console.warn('Stage renderer failed; a retry is available inside the studio.', error);
      setStatus('Preview interrupted. Retry here without changing browser settings.');
    };
    setStatus('Loading preview…');
    createRenderer(format, quality ? 1 : .75).then(renderer => {
      if (!alive) { renderer.destroy(); return; }
      activeRenderer = renderer;
      engine.current = renderer;
      const onContextLost = (event: Event) => {
        event.preventDefault();
        fail(new Error('Graphics context lost'));
        if (restart < 2) setRestart(value => value + 1);
      };
      contextLost = onContextLost;
      renderer.canvas.addEventListener('webglcontextlost', onContextLost);
      mount.current?.replaceChildren(renderer.canvas);
      setStatus('');
      const draw = () => {
        if (failed || !alive) return;
        try {
        const p = props.current;
        const { scene: live, local } = p.time.current;
        const scene = live;
        if (lastSceneId !== scene.id || lastScenes !== p.project.scenes) {
          lastSceneId = scene.id;
          lastScenes = p.project.scenes;
          const index = lastScenes.findIndex(item => item.id === scene.id);
          renderer.preloadBackground(lastScenes[index + 1]?.backgroundImage);
        }
        const frame = renderer.draw(scene, p.project.characters, local, {
          selected: p.selection?.kind !== 'clip' && !p.playing ? p.selection?.id : undefined,
           hovered: !p.playing ? hover.current : undefined,
          ...(drag.current?.moved && drag.current.sceneId === scene.id ? { staged: { [drag.current.id]: drag.current.current } } : {}),
          edit: false, subtitles: p.subtitles,
          amplitude: (id, t) => !p.playing && dialogue.current?.scene === scene
            ? dialogue.current.amplitude(id, t)
            : p.mixer.current?.amplitude(scene, id, t) ?? 0
        });
        renderedFrame.current=frame;
        drawGuide(renderer);
        if (frame.shot !== lastShot) { lastShot = frame.shot; p.onFrame?.(frame.shot); }
        } catch (error) { fail(error); }
      };
      repaint.current = draw;
      draw();
      // The transport emits exact playback clock changes already. Drawing on
      // those events prevents a second always-running RAF loop when paused,
      // and keeps camera/visemes aligned to the actual audio clock.
      timeListener=()=>{
        if(props.current.playing&&!document.hidden)draw();
      };
      visibilityListener=()=>{
        if(!document.hidden)draw();
      };
      window.addEventListener('toonroom-time',timeListener);
      document.addEventListener('visibilitychange',visibilityListener);
    }).catch(fail);
    return () => {
      alive = false;
      if(timeListener)window.removeEventListener('toonroom-time',timeListener);
      if(visibilityListener)document.removeEventListener('visibilitychange',visibilityListener);
      repaint.current = () => {};
      if (engine.current === activeRenderer) engine.current = null;
      if (activeRenderer) {
        if (contextLost) activeRenderer.canvas.removeEventListener('webglcontextlost', contextLost);
        try { activeRenderer.destroy(); } catch (error) { console.warn('Stage renderer cleanup:', error); }
      }
    };
  }, [format, quality, restart]);
  function drawGuide(renderer:Renderer){
    const overlay=guide.current, {points:original,smooth}=currentPath.current;
    const path=original?.map((point,index)=>draggedPath&&draggedPath.index===index?draggedPath.position:point);
    if(!overlay||!path?.length)return;
    overlay.setAttribute('viewBox',`0 0 ${renderer.width} ${renderer.height}`);
    const points=path.map(renderer.projectPoint);
    const keys=pathNodes(path);
    const line=smooth&&keys.length>2?Array.from({length:65},(_,index)=>renderer.projectPoint(smoothPath(keys,index/64))):points;
    overlay.querySelector('polyline')?.setAttribute('points',line.map(({x,y})=>x+','+y).join(' '));
    overlay.querySelectorAll('circle').forEach((dot,index)=>{
      if(points[index]){
        dot.setAttribute('cx',String(points[index].x));
        dot.setAttribute('cy',String(points[index].y));
      }
    });
  }
  useEffect(()=>{if(engine.current)drawGuide(engine.current);},[pathPoints,editPath,smoothGuide,playing,draggedPath]);
  useEffect(()=>{setViewport(defaultStageViewport);setDraggedPath(undefined);},[scene.id]);
  useEffect(() => { if (!playing) repaint.current(); }, [project, scene, playing, edit, selection, subtitles]);
  useEffect(() => { const refresh = () => repaint.current(); window.addEventListener('toonroom-seek', refresh); return () => window.removeEventListener('toonroom-seek', refresh); }, []);
  const selectedActor = selection?.kind === 'actor' ? scene.actors.find(item=>item.id===selection.id) : undefined;
  const selectedObject = selection?.kind === 'object' ? scene.objects.find(item=>item.id===selection.id) : undefined;
  const selectedName = selectedActor ? (project.characters.find(item=>item.id===selectedActor.characterId)?.name ?? 'Character') : selectedObject?.name;
  function pointer(event: Pick<PointerEvent,'clientX'|'clientY'>) {
    const renderer = engine.current;
    if (!renderer) return;
    const box = renderer.canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    return renderer.pick((event.clientX - box.left) * renderer.width / box.width, (event.clientY - box.top) * renderer.height / box.height);
  }
  const zoom=(factor:number,x?:number,y?:number)=>{
    const box=stage.current?.getBoundingClientRect();
    if(!box)return;
    setViewport(previous=>zoomStageAt(previous,previous.zoom*factor,
      {x:x??box.left+box.width/2,y:y??box.top+box.height/2},
      {x:box.left+box.width/2,y:box.top+box.height/2}));
  };
  const displayPath=pathPoints?.map((point,index)=>
    draggedPath&&draggedPath.index===index?draggedPath.position:point);
  const offstageActors=!playing?evaluate(scene,time.current.local).actors.filter(actor=>
    !actor.visible||actor.x<0||actor.x>960||actor.y<0||actor.y>540):[];
  const hiddenSelected=selectedActor&&offstageActors.some(actor=>actor.id===selectedActor.id);
  return <div ref={stage} className={`stage-format format-${format.replace(':', '-')}`}
    onWheel={event=>{if(!playing){event.preventDefault();zoom(event.deltaY<0?1.14:1/1.14,event.clientX,event.clientY);}}}
    onDoubleClick={event=>{
    if(!editPath||(event.target as Element).closest('.stage-path-handle,button'))return;
    const hit=pointer(event);
    if(hit)onDestination?.({x:hit.x,y:hit.y},true);
  }}>
    <div className={`canvas-mount ${edit ? 'place-mode' : ''} ${onDestination?'stage-destination':''}`}
      style={screenTransform} ref={mount}
      onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-toonroom-prop'))event.preventDefault();}}
      onDrop={event=>{
        const kind=event.dataTransfer.getData('application/x-toonroom-prop');
        if(!kind)return;
        event.preventDefault();event.stopPropagation();
        const point=pointer(event);
        if(point)dropProp?.(kind as Prop['kind'],{x:point.x,y:point.y});
      }}
      onPointerDown={event => {
        if (playing) return;
        if(event.button===1||event.altKey){
          event.preventDefault();
          pan.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY};
          event.currentTarget.setPointerCapture(event.pointerId);return;
        }
        if (event.button !== 0) return;
        const hit = pointer(event);
        if(hit && onDestination){onDestination({x:hit.x,y:hit.y},event.shiftKey);return;}
        if (!hit?.id) { selected(null); return; }
        const actor = scene.actors.find(item => item.id === hit.id), object = scene.objects.find(item => item.id === hit.id);
        const entity = actor ?? object;
        if (!entity) return;
        const kind = actor ? 'actor' : 'object';
        selected({ kind, id: entity.id });
        if (!edit) return;
        const frame=renderedFrame.current;
        const origin=frame?.actors.find(a=>a.id===entity.id)??frame?.objects.find(o=>o.id===entity.id)??entity;
        drag.current = { sceneId: scene.id, id: entity.id, origin, pointer: hit, current: origin, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => {
        if(pan.current?.pointerId===event.pointerId){
          const dx=event.clientX-pan.current.x,dy=event.clientY-pan.current.y;
          pan.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY};
          setViewport(value=>moveStageViewport(value,dx,dy));return;
        }
        const item = drag.current, hit = pointer(event);
         if(onDestination)return;
         if (!item) {
           event.currentTarget.dataset.hoverEntity = hit?.id ? 'true' : 'false';
           if (hover.current !== hit?.id) { hover.current = hit?.id; repaint.current(); }
           return;
         }
         if (!hit || item.sceneId !== scene.id) return;
        const dx = hit.x - item.pointer.x, dy = hit.y - item.pointer.y;
        if (Math.hypot(dx, dy) < 3 && !item.moved) return;
        const grid = snap ? 10 : 1;
        item.moved = true;
        item.current = { x: clamp(Math.round((item.origin.x + dx) / grid) * grid, -2000, 3000), y: clamp(Math.round((item.origin.y + dy) / grid) * grid, -2000, 3000) };
        repaint.current();
      }} onPointerUp={() => {if(pan.current){pan.current=undefined;return;} const item = drag.current; drag.current = null; if (item?.moved && item.sceneId === scene.id) { const source=scene.actors.find(a=>a.id===item.id)??scene.objects.find(o=>o.id===item.id);if(source)move(item.id,{x:source.x+item.current.x-item.origin.x,y:source.y+item.current.y-item.origin.y}); } repaint.current(); }}
      onPointerLeave={event => { if (!drag.current) { hover.current = undefined; event.currentTarget.dataset.hoverEntity = 'false'; repaint.current(); } }}
       onPointerCancel={() => { drag.current = null;pan.current=undefined; repaint.current(); }}
      onLostPointerCapture={() => { drag.current = null;pan.current=undefined; repaint.current(); }} />
    {!playing && !!displayPath?.length && <svg className="stage-path-guide" style={screenTransform} ref={guide} aria-hidden={editPath?undefined:true}>
      <polyline/><g>{displayPath!.map((point,index)=>{
        const removable=index>0&&index<pathPoints.length-1;
        const label=index===0?'Start of path':removable?'Waypoint '+index:'End of path';
        return <circle key={index} r={editPath?17:removable?4:7}
          className={editPath?'stage-path-handle':undefined} role={editPath?'button':undefined} tabIndex={editPath?0:undefined}
          aria-label={editPath?label:undefined}
          onPointerDown={editPath?event=>{
            if(event.button!==0)return;
            event.preventDefault();
            const hit=pointer(event);
            if(!hit)return;
            nodeDrag.current={index,pointerId:event.pointerId,offset:{x:point.x-hit.x,y:point.y-hit.y}};
            event.currentTarget.setPointerCapture(event.pointerId);
          }:undefined}
          onPointerMove={editPath?event=>{
            const drag=nodeDrag.current;
            if(drag?.pointerId!==event.pointerId||drag.index!==index)return;
            const hit=pointer(event);
            if(hit){
              const next={x:hit.x+drag.offset.x,y:hit.y+drag.offset.y};
              setDraggedPath({index,position:next});
              if(movePathPoint)movePathPoint(index,next);
            }
          }:undefined}
          onPointerUp={editPath?event=>{
            const held=nodeDrag.current;
            if(held?.pointerId!==event.pointerId||held.index!==index)return;
            const hit=pointer(event);
            const next=hit?{x:hit.x+held.offset.x,y:hit.y+held.offset.y}:draggedPath?.position??point;
            finishPathPoint?.(index,next);
            setDraggedPath(undefined);
            nodeDrag.current=undefined;
          }:undefined}
          onLostPointerCapture={()=>{nodeDrag.current=undefined;setDraggedPath(undefined);}}
          onContextMenu={editPath&&removable?event=>{event.preventDefault();removePathPoint?.(index);}:undefined}
          onKeyDown={editPath?event=>{
            if(removable&&(event.key==='Delete'||event.key==='Backspace')){
              event.preventDefault();event.stopPropagation();removePathPoint?.(index);return;
            }
            const delta=event.shiftKey?15:3;
            const directions:Record<string,Position>={ArrowLeft:{x:-delta,y:0},ArrowRight:{x:delta,y:0},ArrowUp:{x:0,y:-delta},ArrowDown:{x:0,y:delta}};
            const offset=directions[event.key];
            if(!offset)return;
            event.preventDefault();event.stopPropagation();movePathPoint?.(index,{x:point.x+offset.x,y:point.y+offset.y});
          }:undefined}>{editPath&&<title>{label}{removable?' · Right-click to remove':''}</title>}</circle>;
      })}</g>
    </svg>}
    <div className="stage-zoom-tools" role="group" aria-label="Canvas zoom and pan">
      <button type="button" title="Zoom out" aria-label="Zoom canvas out" onClick={()=>zoom(1/1.25)}><ZoomOut size={16}/></button>
      <span aria-live="polite">{Math.round(viewport.zoom*100)}%</span>
      <button type="button" title="Zoom in" aria-label="Zoom canvas in" onClick={()=>zoom(1.25)}><ZoomIn size={16}/></button>
      <button type="button" title="Reset stage zoom and pan" aria-label="Reset stage zoom" onClick={()=>setViewport(defaultStageViewport)}><Scan size={16}/></button>
      <small>Wheel: zoom · Alt-drag: pan</small>
    </div>
    {!playing&&offstageActors.length>0&&<details className="stage-hidden-actors">
      <summary><Eye size={14}/> Offstage actors · {offstageActors.length}</summary>
      <div>{offstageActors.map(actor=>{
        const name=project.characters.find(character=>character.id===actor.characterId)?.name??'Actor';
        return <button type="button" key={actor.id} onClick={()=>{
          selected({kind:'actor',id:actor.id});
          recoverActor?.(actor.id,{x:480,y:450});
        }}>Show {name} on canvas</button>;
      })}</div>
    </details>}
    {hiddenSelected && selectedActor && !playing && <button type="button" className="stage-recover-actor"
      onClick={()=>recoverActor?.(selectedActor.id,{x:480,y:450})}><Eye size={15}/> Show {selectedName} in view</button>}
    {edgePlacement&&!status&&<div className="stage-edge-tools" role="group" aria-label="Place offstage">
      {(['left','right'] as const).map(side=><button key={side} className="quiet" type="button" onClick={()=>{
        const renderer=engine.current;
        if(!renderer)return;
        const {x,y}=renderer.pick(side==='left'?-72:renderer.width+72,renderer.height*.82);
        onDestination?.({x,y});
      }}>Off {side}</button>)}
    </div>}
    {selectedName && !playing && !onDestination && selection && <div className="stage-context-toolbar" role="toolbar" aria-label={selectedName+' scene tools'}>
       <span className="stage-context-selection"><MousePointer2 size={15}/><strong>{selectedName}</strong><small>Drag to move</small></span>
       <button type="button" title="Flip horizontally" aria-label={'Flip '+selectedName+' horizontally'} onClick={()=>flipEntity?.(selection.id)}><FlipHorizontal size={16}/><span>Flip</span></button>
       <button type="button" title="Bring selected item to front" aria-label={'Bring '+selectedName+' to front'} onClick={()=>reorderEntity?.(selection.id,'front')}><ArrowUpToLine size={16}/></button>
       <button type="button" title="Send selected item to back" aria-label={'Send '+selectedName+' to back'} onClick={()=>reorderEntity?.(selection.id,'back')}><ArrowDownToLine size={16}/></button>
       <button type="button" title="Duplicate selected item" aria-label={'Duplicate '+selectedName} onClick={()=>duplicateEntity?.(selection.id)}><Copy size={15}/></button>
       <button type="button" title="Remove selected item" aria-label={'Delete '+selectedName} onClick={()=>removeEntity?.(selection.id)}><Trash2 size={15}/></button>
     </div>}
     {status && <div className="stage-status">{status.startsWith('Loading') ? <Clapperboard size={22}/> : <AlertCircle size={22}/>}<span>{status}</span>{!status.startsWith('Loading') && <button type="button" className="quiet" onClick={() => setRestart(value => value + 1)}>Retry preview</button>}</div>}
  </div>;
}
