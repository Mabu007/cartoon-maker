import { moveEnvironmentHandle, type EnvironmentHandle } from '../engine/environmentEditing.ts';
import type { EnvironmentVisualData } from '../engine/environmentVisuals.ts';
import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent } from 'react';
import { AlertCircle, Clapperboard, FlipHorizontal, Copy, Trash2, MousePointer2, ArrowUpToLine, ArrowDownToLine, Eye } from 'lucide-react';
import { createRenderer, type Format, type Renderer } from '../engine/renderer.ts';
import { type Project, type Scene, type Prop } from '../engine/schema.ts';
import { pathNodes,smoothPath } from '../engine/stagePath.ts';
import { defaultStageViewport,zoomCanvasAt,boundStageViewport,moveStageViewport } from '../engine/stageViewport.ts';
import { evaluate } from '../engine/evaluate.ts';
import { clamp } from '../engine/animation.ts';
import { resizeScaleFromPointer } from '../engine/entityTransform.ts';
import { prepareDialoguePreview, type Mixer } from '../services/audio.ts';
import type { LayerMove } from '../engine/sceneLayers.ts';
import type { Selection } from '../studio.ts';

type Position = { x: number; y: number };
type Drag = { sceneId: string; id: string; origin: Position; pointer: Position; current: Position; moved: boolean };
type EntityScaleDrag = { sceneId:string; id:string; pointerId:number; center:Position; startPointer:Position; startScale:number; scale:number };
type ProjectedBounds = { left:number; right:number; top:number; bottom:number };
export type PreviewTime = { scene: Scene; local: number; movie: number };
export function Stage({ project, scene, time, playing, edit, format, selection, selected, move, subtitles, snap, mixer, quality, onFrame, onDestination, pathPoints, editPath, smoothGuide, movePathPoint, removePathPoint, edgePlacement, flipEntity, duplicateEntity, removeEntity, reorderEntity, dropProp, recoverActor, finishPathPoint, changeEnvironment, resizeEntity }: {
  project: Project; scene: Scene; time: MutableRefObject<PreviewTime>; playing: boolean; edit: boolean; format: Format; quality: boolean;
  selection: Selection; selected: (selection: Selection) => void; move: (id: string, position: Position) => void; subtitles: boolean; snap: boolean;
  onDestination?: (position: Position, waypoint?: boolean) => void; pathPoints?: Position[]; editPath?:boolean; smoothGuide?:boolean; movePathPoint?:(index:number,point:Position)=>void; removePathPoint?:(index:number)=>void; edgePlacement?: boolean; mixer: MutableRefObject<Mixer | null>; onFrame?: (label: string) => void;
  reorderEntity?:(id:string,move:LayerMove)=>void; changeEnvironment?:(visual:EnvironmentVisualData)=>void;
  dropProp?:(kind:Prop['kind'],position:Position)=>void;
  recoverActor?:(id:string,position:Position)=>void;
  finishPathPoint?:(index:number,position:Position)=>void;
  flipEntity?: (id: string) => void; duplicateEntity?: (id: string) => void; removeEntity?: (id: string) => void;
  resizeEntity?: (id:string,scale:number)=>void;
}) {
  const mount = useRef<HTMLDivElement>(null), engine = useRef<Renderer | null>(null), drag = useRef<Drag | null>(null), hover = useRef<string | undefined>(undefined), repaint = useRef<() => void>(() => {});
  const nodeDrag=useRef<{index:number;pointerId:number;offset:Position}|undefined>(undefined);
  const stage=useRef<HTMLDivElement>(null);
  const [viewport,setViewport]=useState(defaultStageViewport);
  const pan=useRef<{pointerId:number;x:number;y:number}|undefined>(undefined);
  const [draggedPath,setDraggedPath]=useState<{index:number;position:Position}|undefined>();
  const [selectedBounds,setSelectedBounds]=useState<ProjectedBounds|null>(null);
  const scaleDrag=useRef<EntityScaleDrag|undefined>(undefined);
  const screenTransform={transform:`translate(${viewport.panX}px,${viewport.panY}px) scale(${viewport.zoom})`,
    transformOrigin:'center center'} as const;
  const guide=useRef<SVGSVGElement>(null),environmentGuide=useRef<SVGSVGElement>(null);
  const [editingEnvironment,setEditingEnvironment]=useState(false);
  const environmentDrag=useRef<{scene:Scene;handle:EnvironmentHandle;preview:EnvironmentVisualData;time:number}|undefined>(undefined);
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
        const previewScene=environmentDrag.current?.scene===scene?{...scene,visual:environmentDrag.current.preview}:scene;
        const frame = renderer.draw(previewScene, p.project.characters, local, {
          selected: p.selection?.kind !== 'clip' && !p.playing ? p.selection?.id : undefined,
           hovered: !p.playing ? hover.current : undefined,
          ...(drag.current?.moved && drag.current.sceneId === scene.id ? { staged: { [drag.current.id]: drag.current.current } } : {}),
          ...(scaleDrag.current ? { stagedScale:{[scaleDrag.current.id]:scaleDrag.current.scale} } : {}),
          edit: false, subtitles: p.subtitles,
          amplitude: (id, t) => !p.playing && dialogue.current?.scene === scene
            ? dialogue.current.amplitude(id, t)
            : p.mixer.current?.amplitude(scene, id, t) ?? 0
        });
        renderedFrame.current=frame;
        const selectedId=!p.playing&&(p.selection?.kind==='actor'||p.selection?.kind==='object')?p.selection.id:undefined;
        const bounds=selectedId?renderer.projectedEntityBounds(selectedId):undefined;
        setSelectedBounds(previous=>{
          if(!bounds)return previous===null?previous:null;
          if(previous&&Math.abs(previous.left-bounds.left)<.1&&Math.abs(previous.right-bounds.right)<.1&&
            Math.abs(previous.top-bounds.top)<.1&&Math.abs(previous.bottom-bounds.bottom)<.1)return previous;
          return bounds;
        });
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
    const environment=environmentGuide.current,scene=props.current.scene,visual=environmentDrag.current?.scene===scene?environmentDrag.current.preview:scene.visual;
    if(environment&&visual){
      environment.setAttribute('viewBox',`0 0 ${renderer.width} ${renderer.height}`);
      for(const light of visual.lighting?.lights??[]){
        const keys=light.keys,t=props.current.time.current.local,i=keys?.findIndex(k=>k.time>t)??-1,a=keys?.[i<0?keys.length-1:Math.max(0,i-1)],b=keys?.[i<0?keys.length-1:i],w=a&&b&&a!==b?clamp((t-a.time)/(b.time-a.time)):0;
        const point=renderer.projectPoint(a&&b?{x:a.x+(b.x-a.x)*w,y:a.y+(b.y-a.y)*w}:light);
        const circle=environment.querySelector(`[data-light="${CSS.escape(light.id)}"]`);circle?.setAttribute('cx',String(point.x));circle?.setAttribute('cy',String(point.y));
      }
      const p=visual.perspective;
      if(p?.enabled){
        const from=renderer.projectPoint({x:0,y:p.horizon}),to=renderer.projectPoint({x:960,y:p.horizon});
        const line=environment.querySelector('line');line?.setAttribute('x1',String(from.x));line?.setAttribute('y1',String(from.y));line?.setAttribute('x2',String(to.x));line?.setAttribute('y2',String(to.y));
        for(const kind of ['horizon','nearY','farY'] as const){const point=renderer.projectPoint({x:kind==='horizon'?480:120,y:p[kind]});const dot=environment.querySelector(`[data-ground="${kind}"]`);dot?.setAttribute('cx',String(point.x));dot?.setAttribute('cy',String(point.y));}
      }
    }

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
  useEffect(()=>{if(engine.current)drawGuide(engine.current);},[pathPoints,editPath,smoothGuide,playing,draggedPath,editingEnvironment,scene.visual]);
  useEffect(()=>{setViewport(defaultStageViewport);setDraggedPath(undefined);},[scene.id,format]);
  useEffect(()=>{
    const element=stage.current;
    if(!element||typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(()=>{const rect=element.getBoundingClientRect();setViewport(value=>boundStageViewport(value,rect.width,rect.height));});
    observer.observe(element);return ()=>observer.disconnect();
  },[]);
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
  function beginEntityResize(event:PointerEvent<SVGCircleElement>) {
    if(event.button!==0||playing||!edit||onDestination||editPath||!resizeEntity)return;
    const entity=selectedActor??selectedObject;
    const hit=pointer(event);
    if(!entity||!hit)return;
    const frame=renderedFrame.current;
    const origin=(selection?.kind==='actor'?frame?.actors.find(item=>item.id===entity.id):
      selection?.kind==='object'?frame?.objects.find(item=>item.id===entity.id):undefined)??entity;
    const center={x:origin.x,y:origin.y};
    const distance=Math.hypot(hit.x-center.x,hit.y-center.y);
    if(!Number.isFinite(distance)||distance<1)return;
    event.preventDefault();event.stopPropagation();
    scaleDrag.current={sceneId:scene.id,id:entity.id,pointerId:event.pointerId,center,
      startPointer:{x:hit.x,y:hit.y},startScale:entity.scale,scale:entity.scale};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveEntityResize(event:PointerEvent<SVGCircleElement>) {
    const drag=scaleDrag.current;
    if(!drag||drag.pointerId!==event.pointerId||drag.sceneId!==scene.id)return;
    const hit=pointer(event);
    if(!hit)return;
    event.preventDefault();event.stopPropagation();
    const next=resizeScaleFromPointer(drag.startScale,drag.startPointer,hit,drag.center,snap);
    if(next===drag.scale)return;
    drag.scale=next;
    repaint.current();
  }
  function finishEntityResize(event:PointerEvent<SVGCircleElement>) {
    const drag=scaleDrag.current;
    if(!drag||drag.pointerId!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    scaleDrag.current=undefined;
    if(drag.sceneId===scene.id&&Math.abs(drag.scale-drag.startScale)>=.005)
      resizeEntity?.(drag.id,drag.scale);
    repaint.current();
  }
  function cancelEntityResize(event:PointerEvent<SVGCircleElement>) {
    if(scaleDrag.current?.pointerId!==event.pointerId)return;
    scaleDrag.current=undefined;
    repaint.current();
  }
  function keyboardResizeEntity(event:React.KeyboardEvent<SVGCircleElement>) {
    const entity=selectedActor??selectedObject;
    if(!entity||!resizeEntity)return;
    const direction=event.key==='ArrowRight'||event.key==='ArrowUp'?1:
      event.key==='ArrowLeft'||event.key==='ArrowDown'?-1:0;
    if(!direction&&event.key!=='Home'&&event.key!=='End')return;
    event.preventDefault();event.stopPropagation();
    const step=event.altKey?.01:event.shiftKey?.25:snap?.05:.01;
    const next=event.key==='Home'?.2:event.key==='End'?4:
      clamp(Math.round((entity.scale+direction*step)*100)/100,.2,4);
    if(next!==entity.scale)resizeEntity(entity.id,next);
  }
  useEffect(()=>{
    const handle=(event:Event)=>{
      if(playing||drag.current||nodeDrag.current)return;
      const direction=(event as CustomEvent<'in'|'out'|'reset'>).detail;
      if(direction==='reset'){setViewport(defaultStageViewport);return;}
      if(direction!=='in'&&direction!=='out')return;
      const box=stage.current?.getBoundingClientRect();
      if(!box)return;
      const center={x:box.left+box.width/2,y:box.top+box.height/2};
      setViewport(previous=>zoomCanvasAt(previous,previous.zoom*(direction==='in'?1.2:1/1.2),center,box));
    };
    window.addEventListener('sirvibe-stage-zoom',handle);
    return ()=>window.removeEventListener('sirvibe-stage-zoom',handle);
  },[playing]);
  useEffect(()=>{
    const element=stage.current;
    if(!element||playing)return;
    // Browser wheel listeners may be passive by default; a native
    // nonpassive handler keeps canvas zoom from scrolling the entire page.
    const onWheel=(event:WheelEvent)=>{
      if((event.target as Element)?.closest('button,details,.stage-context-toolbar'))return;
      event.preventDefault();
      if(drag.current||nodeDrag.current||pan.current)return;
      const rect=element.getBoundingClientRect();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.height:1);
      if(!delta)return;
      const factor=Math.exp(-Math.max(-180,Math.min(180,delta))*.0025);
      setViewport(previous=>zoomCanvasAt(previous,previous.zoom*factor,{x:event.clientX,y:event.clientY},rect));
    };
    element.addEventListener('wheel',onWheel,{passive:false});
    return ()=>element.removeEventListener('wheel',onWheel);
  },[playing]);
  const displayPath=pathPoints?.map((point,index)=>
    draggedPath&&draggedPath.index===index?draggedPath.position:point);
  const offstageActors=!playing?evaluate(scene,time.current.local).actors.filter(actor=>{
    if(!actor.visible||actor.x<0||actor.x>960||actor.y<0||actor.y>540)return true;
    // Actors outside an active camera shot are still selectable through this
    // list even though the renderer cannot create an on-canvas hit target.
    const renderer=engine.current;
    if(!renderer)return false;
    const point=renderer.projectPoint({x:actor.x,y:actor.y-115*actor.scale});
    return point.x< -45||point.x>renderer.width+45||
      point.y< -45||point.y>renderer.height+45;
  }):[];
  const hiddenSelected=selectedActor&&offstageActors.some(actor=>actor.id===selectedActor.id);
  const stageWidth=engine.current?.width??960,stageHeight=engine.current?.height??540;
  const scaleHandle=selectedBounds?{x:clamp(selectedBounds.right,10,stageWidth-10),y:clamp(selectedBounds.bottom,10,stageHeight-10)}:undefined;
  const transformEntity=selectedActor??selectedObject;
  return <div ref={stage} className={`stage-format format-${format.replace(':', '-')}`}
    onDoubleClick={event=>{
    if(!editPath||(event.target as Element).closest('.stage-path-handle,button'))return;
    const hit=pointer(event);
    if(hit)onDestination?.({x:hit.x,y:hit.y},true);
  }}>
    <div className="stage-zoom-world" style={screenTransform}>
    <div className={`canvas-mount ${edit ? 'place-mode' : ''} ${onDestination?'stage-destination':''}`}
      ref={mount}
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
          const rect=stage.current?.getBoundingClientRect();
          if(rect)setViewport(value=>boundStageViewport(moveStageViewport(value,dx,dy),rect.width,rect.height));return;
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
    {!playing&&edit&&!onDestination&&!editPath&&resizeEntity&&transformEntity&&scaleHandle&&<svg
      className="stage-transform-guide" viewBox={`0 0 ${stageWidth} ${stageHeight}`}
      aria-label="Selected character or object resize controls">
      <circle className="stage-scale-handle" cx={scaleHandle.x} cy={scaleHandle.y} r="9"
        role="slider" tabIndex={0} aria-orientation="horizontal"
        aria-label={`Resize ${selectedName??'selected item'} proportionally`}
        aria-valuemin={.2} aria-valuemax={4} aria-valuenow={transformEntity.scale}
        aria-valuetext={`Scale ${transformEntity.scale.toFixed(2)}. Drag to resize proportionally.`}
        title="Drag to resize proportionally. Arrow keys adjust scale; Shift for larger steps."
        onPointerDown={beginEntityResize} onPointerMove={moveEntityResize}
        onPointerUp={finishEntityResize} onPointerCancel={cancelEntityResize}
        onLostPointerCapture={cancelEntityResize} onKeyDown={keyboardResizeEntity}/>
    </svg>}
    {!playing&&edit&&!onDestination&&!editPath&&changeEnvironment&&<button type="button" className="stage-environment-toggle" aria-pressed={editingEnvironment} onClick={()=>setEditingEnvironment(value=>!value)}>Edit lights & ground</button>}
    {!playing&&editingEnvironment&&!onDestination&&!editPath&&scene.visual&&<svg className="stage-environment-guide" ref={environmentGuide} aria-label="Scene lighting and perspective handles"
      onPointerMove={event=>{const drag=environmentDrag.current,hit=pointer(event);if(!drag||!hit||drag.scene!==scene)return;try{drag.preview=moveEnvironmentHandle(drag.scene.visual!,drag.handle,hit,drag.time);repaint.current();}catch{/* Keep the last valid calibration. */}}}
      onPointerUp={()=>{const drag=environmentDrag.current;environmentDrag.current=undefined;if(drag&&drag.scene===scene)changeEnvironment?.(drag.preview);repaint.current();}}
      onPointerCancel={()=>{environmentDrag.current=undefined;repaint.current();}} onLostPointerCapture={()=>{if(environmentDrag.current){environmentDrag.current=undefined;repaint.current();}}}>
      <line stroke="#eed298" strokeWidth="2" strokeDasharray="7 5"/>
      {(scene.visual.lighting?.enabled?scene.visual.lighting.lights:[]).map(light=><circle key={light.id} data-light={light.id} r="11" fill={light.color} stroke="#ffffff" strokeWidth="2" role="button" tabIndex={0} aria-label="Move scene light"
        onPointerDown={event=>{event.preventDefault();event.stopPropagation();environmentDrag.current={scene,handle:{kind:'light',id:light.id},preview:scene.visual!,time:time.current.local};event.currentTarget.setPointerCapture(event.pointerId);}}
        onKeyDown={event=>{const delta=event.key==='ArrowLeft'?{x:-5,y:0}:event.key==='ArrowRight'?{x:5,y:0}:event.key==='ArrowUp'?{x:0,y:-5}:event.key==='ArrowDown'?{x:0,y:5}:undefined;if(!delta)return;event.preventDefault();changeEnvironment?.(moveEnvironmentHandle(scene.visual!,{kind:'light',id:light.id},(()=>{const box=event.currentTarget.getBoundingClientRect(),current=pointer({clientX:box.x+box.width/2,clientY:box.y+box.height/2})??light;return {x:current.x+delta.x,y:current.y+delta.y};})(),time.current.local));}}/>) }
      {scene.visual.perspective?.enabled&&(['horizon','nearY','farY'] as const).map(kind=><circle key={kind} data-ground={kind} r="10" fill={kind==='horizon'?'#eed298':kind==='nearY'?'#8bd1c3':'#ac9cf5'} stroke="#ffffff" strokeWidth="2" role="button" tabIndex={0} aria-label={`Move ${kind==='horizon'?'horizon':kind==='nearY'?'near ground reference':'far ground reference'}`}
        onPointerDown={event=>{event.preventDefault();event.stopPropagation();environmentDrag.current={scene,handle:{kind},preview:scene.visual!,time:time.current.local};event.currentTarget.setPointerCapture(event.pointerId);}}
        onKeyDown={event=>{if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;event.preventDefault();changeEnvironment?.(moveEnvironmentHandle(scene.visual!,{kind},{x:0,y:scene.visual!.perspective![kind]+(event.key==='ArrowUp'?-5:5)},time.current.local));}}/>)}
    </svg>}
    {!playing && !!displayPath?.length && <svg className="stage-path-guide" ref={guide} aria-hidden={editPath?undefined:true}>
      <polyline/><g>{displayPath!.map((point,index)=>{
        const removable=index>0&&index<displayPath!.length-1;
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
