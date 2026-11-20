import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ChevronDown, ChevronUp, ClipboardCopy, Code2, Copy, Keyboard, Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { clamp } from '../engine/animation.ts';
import { tracks, trackNames, type Clip, type Scene, type Track } from '../engine/schema.ts';
import { changeClipTiming, type Selection } from '../studio.ts';
import { clipLabel, IconButton, trackIcon } from './shared.tsx';

export function Timeline({ scene, names, selection, select, seek, change, add, remove, duplicate, compact, onCompact, onCode, onContext, onResizeScene }: {
  scene: Scene; names: Record<string, string>; selection: Selection; select: (value: Selection) => void; seek: (t: number) => void;
  change: (clip: Clip, original: Clip) => void; add: (track?: Track) => void; remove: () => void; duplicate: () => void; compact: boolean; onCompact: () => void; onCode: () => void; onContext: () => void; onResizeScene: (duration: number) => void;
}) {
  const [zoom, setZoom] = useState(1), [draft, setDraft] = useState<{ sceneId: string; clip: Clip } | null>(null), [shortcuts, setShortcuts] = useState(false);
  const drag = useRef<{ sceneId: string; clip: Clip; x: number; units: number; edge: 'move' | 'in' | 'out'; draft: Clip; moved: boolean } | null>(null);
  const needle = useRef<HTMLDivElement>(null), surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timeChange = (event: Event) => { if (needle.current) needle.current.style.left = `${clamp((event as CustomEvent<number>).detail / scene.duration) * 100}%`; };
    window.addEventListener('toonroom-time', timeChange);
    return () => window.removeEventListener('toonroom-time', timeChange);
  }, [scene.duration]);
  const decimals = scene.duration < 12 || zoom > 1.6 ? 1 : 0;
  const divisions = scene.duration > 60 ? 10 : 6;
  const positions = Array.from({ length: divisions + 1 }, (_, index) => scene.duration * index / divisions);
  const lane = (track: Track) => {
    const icons = trackIcon[track];
    const Icon = icons;
    const laneClips = scene.clips.filter(clip => clip.track === track).map(original => ({
      original, clip: draft?.sceneId === scene.id && draft.clip.id === original.id ? draft.clip : original
    })).sort((a, b) => a.clip.start - b.clip.start);
    const endings: number[] = [];
    const stacked = laneClips.map(({ original, clip }) => {
      let row = endings.findIndex(end => end <= clip.start + .001);
      if (row === -1) row = endings.length;
      endings[row] = clip.start + clip.length;
      return { original, clip, row };
    });
    return <div className="timeline-row" key={track} style={{ minHeight: Math.max(34, endings.length * 26 + 7) }}>
      <div className="track-name"><span className={`track-icon track-${track}`}><Icon size={15}/></span><span>{trackNames[track]}</span><button type="button" title={`Add ${trackNames[track].toLowerCase()} clip`} aria-label={`Add ${trackNames[track].toLowerCase()} clip`} onClick={() => add(track)}><Plus size={13}/></button></div>
      <div className="lane" onPointerDown={event => { if (event.target === event.currentTarget) seekAt(event); }}>
        {stacked.map(({ original, clip, row }) => <div key={clip.id} role="button" tabIndex={0} aria-label={`${trackNames[track]}: ${clipLabel(clip, names)}`} title={clipLabel(clip, names)}
          className={`clip clip-${track} ${selection?.id === clip.id ? 'clip-selected' : ''}`} style={{ left: `${clip.start / scene.duration * 100}%`, width: `${clip.length / scene.duration * 100}%`, top: 4 + row * 26 }}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select({ kind: 'clip', id: clip.id }); seek(clip.start); } }}
          onPointerDown={event => {
            if (event.button !== 0) return;
            const target = event.target as HTMLElement, edge = target.dataset.edge as 'in' | 'out' | undefined;
            if (!surface.current) return;
            drag.current = { sceneId: scene.id, clip: original, draft: original, x: event.clientX, units: scene.duration / surface.current.getBoundingClientRect().width, edge: edge ?? 'move', moved: false };
            select({ kind: 'clip', id: original.id }); event.currentTarget.setPointerCapture(event.pointerId);
            event.stopPropagation();
          }} onPointerMove={event => {
            const item = drag.current;
            if (!item || item.sceneId !== scene.id) return;
            if (!item.moved && Math.abs(event.clientX - item.x) < 4) return;
            item.moved = true;
            const delta = (event.clientX - item.x) * item.units;
            let start = item.clip.start, length = item.clip.length;
            if (item.edge === 'move') start = clamp(start + delta, 0, Math.max(0, scene.duration - length));
            else if (item.edge === 'in') { const end = start + length; start = clamp(start + delta, 0, end - .1); length = end - start; }
            else length += delta;
            item.draft = changeClipTiming(item.clip, start, length, scene.duration, item.edge === 'in');
            setDraft({ sceneId: item.sceneId, clip: item.draft });
          }} onPointerUp={() => {
            const item = drag.current; drag.current = null;
            if (item?.sceneId === scene.id) { if (item.moved) change(item.draft, item.clip); else seek(original.start); }
            setDraft(null);
          }} onLostPointerCapture={() => { drag.current = null; setDraft(null); }}>
          <span className="clip-handle" data-edge="in"/><Icon size={11}/><span>{clipLabel(clip, names)}</span><span className="clip-handle right" data-edge="out"/>
        </div>)}
      </div>
    </div>;
  };
  function seekAt(event: PointerEvent) {
    const bounds = surface.current?.getBoundingClientRect();
    if (bounds) seek(clamp((event.clientX - bounds.left) / bounds.width) * scene.duration);
  }
  return <section className={`timeline-panel ${compact ? 'timeline-compact' : ''}`} aria-label="Timeline">
    <header><div className="timeline-title"><button className="timeline-fold" onClick={onCompact} aria-label={compact ? 'Expand timeline' : 'Collapse timeline'}>{compact ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button><h2>Timeline</h2><span className="timeline-duration">{scene.duration}s scene</span><button className="quiet mini" title="Shorten this scene by five seconds" disabled={scene.duration <= 5 || scene.clips.some(c => c.start + c.length > scene.duration - 5 + .001)} onClick={() => onResizeScene(Math.max(1, scene.duration - 5))}>−5s</button><button className="quiet mini" title="Extend this scene by five seconds" disabled={scene.duration >= 180} onClick={() => onResizeScene(Math.min(180, scene.duration + 5))}>+5s</button></div><div className="timeline-tools">
      <button className="quiet mini" onClick={() => add()}><Plus size={15}/> <span>Add clip</span></button>
      <IconButton title="Duplicate selected clip" onClick={duplicate} disabled={selection?.kind !== 'clip'}><Copy size={15}/></IconButton><IconButton title="Delete selected clip" onClick={remove} disabled={selection?.kind !== 'clip'}><Trash2 size={15}/></IconButton>
      <span className="divider"/><IconButton title="Edit timeline JSON" onClick={onCode}><Code2 size={16}/></IconButton><IconButton title="Copy AI scene context" onClick={onContext}><ClipboardCopy size={16}/></IconButton><IconButton title="Timeline keyboard shortcuts" onClick={() => setShortcuts(value => !value)}><Keyboard size={16}/></IconButton><span className="divider"/><IconButton title="Zoom out timeline" disabled={zoom <= 1} onClick={() => setZoom(n => Math.max(1, n - .35))}><ZoomOut size={16}/></IconButton><span className="zoom-label">{Math.round(zoom * 100)}%</span><IconButton title="Zoom in timeline" disabled={zoom >= 3} onClick={() => setZoom(n => Math.min(3, n + .35))}><ZoomIn size={16}/></IconButton>
    </div></header>
    {shortcuts && <div className="timeline-shortcuts" role="region" aria-label="Timeline keyboard shortcuts"><strong>Timeline shortcuts</strong><span>Space · Play/Pause</span><span>Backspace / Delete · Remove selection</span><span>Ctrl/Cmd + D · Duplicate</span><span>Ctrl/Cmd + Z · Undo</span><span>Ctrl/Cmd + Shift + Z · Redo</span><span>Escape · Clear selection</span><span>Drag clip edges · Trim</span><span>Code icon · Edit scene JSON</span></div>}
    {!compact && <div className="timeline-scroll"><div className="timeline-sheet" style={{ width: `${zoom * 100}%` }}>
      <div className="ruler"><div className="ruler-label">TRACKS</div><div ref={surface} className="ruler-points" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); seekAt(e); }} onPointerMove={e => { if (e.buttons === 1) seekAt(e); }}>
        {positions.map((value, index) => <span key={value} className={index === divisions ? 'last-tick' : ''} style={{ left: `${index / divisions * 100}%` }}>{value.toFixed(decimals)}s</span>)}
      </div></div>
      <div className="timeline-grid" aria-hidden="true"><div className="grid-lines">{positions.slice(1).map((value, index) => <i key={value} style={{ left: `${(index + 1) / divisions * 100}%` }}/>)}</div><div className="playhead" ref={needle}><i/></div></div>
      {tracks.map(lane)}
    </div></div>}
  </section>;
}
