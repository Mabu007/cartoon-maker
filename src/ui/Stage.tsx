import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent } from 'react';
import { AlertCircle, Clapperboard, FlipHorizontal, Copy, Trash2, MousePointer2 } from 'lucide-react';
import { createRenderer, type Format, type Renderer } from '../engine/renderer.ts';
import { type Project, type Scene } from '../engine/schema.ts';
import { evaluate } from '../engine/evaluate.ts';
import { clamp } from '../engine/animation.ts';
import { prepareDialoguePreview, type Mixer } from '../services/audio.ts';
import type { Selection } from '../studio.ts';

type Position = { x: number; y: number };
type Drag = { sceneId: string; id: string; origin: Position; pointer: Position; current: Position; moved: boolean };
export type PreviewTime = { scene: Scene; local: number; movie: number };
export function Stage({ project, scene, time, playing, edit, format, selection, selected, move, subtitles, snap, mixer, quality, onFrame, onDestination, pathPoints, edgePlacement, flipEntity, duplicateEntity, removeEntity }: {
  project: Project; scene: Scene; time: MutableRefObject<PreviewTime>; playing: boolean; edit: boolean; format: Format; quality: boolean;
  selection: Selection; selected: (selection: Selection) => void; move: (id: string, position: Position) => void; subtitles: boolean; snap: boolean;
  onDestination?: (position: Position, waypoint?: boolean) => void; pathPoints?: Position[]; edgePlacement?: boolean; mixer: MutableRefObject<Mixer | null>; onFrame?: (label: string) => void;
  flipEntity?: (id: string) => void; duplicateEntity?: (id: string) => void; removeEntity?: (id: string) => void;
}) {
  const mount = useRef<HTMLDivElement>(null), engine = useRef<Renderer | null>(null), drag = useRef<Drag | null>(null), hover = useRef<string | undefined>(undefined), repaint = useRef<() => void>(() => {});
  const guide=useRef<SVGSVGElement>(null);
  const currentPath=useRef(pathPoints);
  currentPath.current=pathPoints;
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
        const overlay=guide.current;
        if(overlay && currentPath.current?.length){
          overlay.setAttribute('viewBox',`0 0 ${renderer.width} ${renderer.height}`);
          const points=currentPath.current.map(renderer.projectPoint);
          overlay.querySelector('polyline')?.setAttribute('points',points.map(({x,y})=>x+','+y).join(' '));
          overlay.querySelectorAll('circle').forEach((dot,index)=>{
            const point=points[index];
            if(point){dot.setAttribute('cx',String(point.x));dot.setAttribute('cy',String(point.y));}
          });
        }
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
  useEffect(() => { if (!playing) repaint.current(); }, [project, scene, playing, edit, selection, subtitles, pathPoints]);
  useEffect(() => { const refresh = () => repaint.current(); window.addEventListener('toonroom-seek', refresh); return () => window.removeEventListener('toonroom-seek', refresh); }, []);
  const selectedActor = selection?.kind === 'actor' ? scene.actors.find(item=>item.id===selection.id) : undefined;
  const selectedObject = selection?.kind === 'object' ? scene.objects.find(item=>item.id===selection.id) : undefined;
  const selectedName = selectedActor ? (project.characters.find(item=>item.id===selectedActor.characterId)?.name ?? 'Character') : selectedObject?.name;
  function pointer(event: PointerEvent) {
    const renderer = engine.current;
    if (!renderer) return;
    const box = renderer.canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    return renderer.pick((event.clientX - box.left) * renderer.width / box.width, (event.clientY - box.top) * renderer.height / box.height);
  }
  return <div className={`stage-format format-${format.replace(':', '-')}`}>
    <div className={`canvas-mount ${edit ? 'place-mode' : ''} ${onDestination?'stage-destination':''}`} ref={mount}
      onPointerDown={event => {
        if (playing || event.button !== 0) return;
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
      }} onPointerUp={() => { const item = drag.current; drag.current = null; if (item?.moved && item.sceneId === scene.id) { const source=scene.actors.find(a=>a.id===item.id)??scene.objects.find(o=>o.id===item.id);if(source)move(item.id,{x:source.x+item.current.x-item.origin.x,y:source.y+item.current.y-item.origin.y}); } repaint.current(); }}
      onPointerLeave={event => { if (!drag.current) { hover.current = undefined; event.currentTarget.dataset.hoverEntity = 'false'; repaint.current(); } }}
       onPointerCancel={() => { drag.current = null; repaint.current(); }}
      onLostPointerCapture={() => { drag.current = null; repaint.current(); }} />
    {!playing && !!pathPoints?.length && <svg className="stage-path-guide" ref={guide} aria-hidden="true">
      <polyline/><g>{pathPoints.map((_,index)=><circle key={index} r={index===0 || index===pathPoints.length-1?7:4}/>)}</g>
    </svg>}
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
       <button type="button" title="Duplicate selected item" aria-label={'Duplicate '+selectedName} onClick={()=>duplicateEntity?.(selection.id)}><Copy size={15}/></button>
       <button type="button" title="Remove selected item" aria-label={'Delete '+selectedName} onClick={()=>removeEntity?.(selection.id)}><Trash2 size={15}/></button>
     </div>}
     {status && <div className="stage-status">{status.startsWith('Loading') ? <Clapperboard size={22}/> : <AlertCircle size={22}/>}<span>{status}</span>{!status.startsWith('Loading') && <button type="button" className="quiet" onClick={() => setRestart(value => value + 1)}>Retry preview</button>}</div>}
  </div>;
}
