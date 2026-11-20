import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent } from 'react';
import { AlertCircle, Clapperboard } from 'lucide-react';
import { createRenderer, type Format, type Renderer } from '../engine/renderer.ts';
import { type Project, type Scene } from '../engine/schema.ts';
import { clamp } from '../engine/animation.ts';
import { prepareDialoguePreview, type Mixer } from '../services/audio.ts';
import type { Selection } from '../studio.ts';

type Position = { x: number; y: number };
type Drag = { sceneId: string; id: string; origin: Position; pointer: Position; current: Position; moved: boolean };
export type PreviewTime = { scene: Scene; local: number };
export function Stage({ project, scene, time, playing, edit, format, selection, selected, move, subtitles, snap, mixer, quality, onFrame }: {
  project: Project; scene: Scene; time: MutableRefObject<PreviewTime>; playing: boolean; edit: boolean; format: Format; quality: boolean;
  selection: Selection; selected: (selection: Selection) => void; move: (id: string, position: Position) => void; subtitles: boolean; snap: boolean;
  mixer: MutableRefObject<Mixer | null>; onFrame?: (label: string) => void;
}) {
  const mount = useRef<HTMLDivElement>(null), engine = useRef<Renderer | null>(null), drag = useRef<Drag | null>(null), repaint = useRef<() => void>(() => {});
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
    let alive = true, handle = 0, lastShot = '', failed = false;
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
        const scene = p.playing ? live : p.scene;
        const frame = renderer.draw(scene, p.project.characters, local, {
          selected: p.selection?.kind !== 'clip' && !p.playing ? p.selection?.id : undefined,
          ...(drag.current?.moved && drag.current.sceneId === scene.id ? { staged: { [drag.current.id]: drag.current.current } } : {}),
          edit: p.edit && !p.playing, subtitles: p.subtitles,
          amplitude: (id, t) => !p.playing && dialogue.current?.scene === scene
            ? dialogue.current.amplitude(id, t)
            : p.mixer.current?.amplitude(scene, id, t) ?? 0
        });
        if (frame.shot !== lastShot) { lastShot = frame.shot; p.onFrame?.(frame.shot); }
        } catch (error) { fail(error); }
      };
      repaint.current = draw;
      draw();
      let previousTime: PreviewTime | undefined;
      const tick = () => {
        if (!alive || failed) return;
        const p = props.current;
        if (p.playing && !document.hidden && p.time.current !== previousTime) {
          previousTime = p.time.current;
          draw();
        }
        handle = requestAnimationFrame(tick);
      };
      handle = requestAnimationFrame(tick);
    }).catch(fail);
    return () => {
      alive = false;
      cancelAnimationFrame(handle);
      repaint.current = () => {};
      if (engine.current === activeRenderer) engine.current = null;
      if (activeRenderer) {
        if (contextLost) activeRenderer.canvas.removeEventListener('webglcontextlost', contextLost);
        try { activeRenderer.destroy(); } catch (error) { console.warn('Stage renderer cleanup:', error); }
      }
    };
  }, [format, quality, restart]);
  useEffect(() => { if (!playing) repaint.current(); }, [project, scene, playing, edit, selection, subtitles]);
  useEffect(() => { const refresh = () => repaint.current(); window.addEventListener('toonroom-seek', refresh); return () => window.removeEventListener('toonroom-seek', refresh); }, []);
  function pointer(event: PointerEvent) {
    const renderer = engine.current;
    if (!renderer) return;
    const box = renderer.canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    return renderer.pick((event.clientX - box.left) * renderer.width / box.width, (event.clientY - box.top) * renderer.height / box.height);
  }
  return <div className={`stage-format format-${format.replace(':', '-')}`}>
    <div className={`canvas-mount ${edit ? 'place-mode' : ''}`} ref={mount}
      onPointerDown={event => {
        if (playing || event.button !== 0) return;
        const hit = pointer(event);
        if (!hit?.id) { selected(null); return; }
        const actor = scene.actors.find(item => item.id === hit.id), object = scene.objects.find(item => item.id === hit.id);
        const entity = actor ?? object;
        if (!entity) return;
        const kind = actor ? 'actor' : 'object';
        selected({ kind, id: entity.id });
        if (!edit) return;
        drag.current = { sceneId: scene.id, id: entity.id, origin: entity, pointer: hit, current: entity, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => {
        const item = drag.current, hit = item && pointer(event);
        if (!item || !hit || item.sceneId !== scene.id) return;
        const dx = hit.x - item.pointer.x, dy = hit.y - item.pointer.y;
        if (Math.hypot(dx, dy) < 3 && !item.moved) return;
        const grid = snap ? 10 : 1;
        item.moved = true;
        item.current = { x: clamp(Math.round((item.origin.x + dx) / grid) * grid, -2000, 3000), y: clamp(Math.round((item.origin.y + dy) / grid) * grid, -2000, 3000) };
        repaint.current();
      }} onPointerUp={() => { const item = drag.current; drag.current = null; if (item?.moved && item.sceneId === scene.id) move(item.id, item.current); repaint.current(); }} onPointerCancel={() => { drag.current = null; repaint.current(); }} />
    {status && <div className="stage-status">{status.startsWith('Loading') ? <Clapperboard size={22}/> : <AlertCircle size={22}/>}<span>{status}</span>{!status.startsWith('Loading') && <button type="button" className="quiet" onClick={() => setRestart(value => value + 1)}>Retry preview</button>}</div>}
  </div>;
}
