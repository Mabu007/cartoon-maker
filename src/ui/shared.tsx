import { useEffect, useRef, type ReactNode } from 'react';
import { X, ChevronDown, Armchair, BookOpen, DoorOpen, LampFloor, Monitor, Coffee, Smartphone, Sprout, Mic, PanelTop, Table2, Store, Cable, Sofa, UserRound, MoveRight, Activity, Smile, AudioLines, Music2, Clapperboard, Blend, Image, Eye, Hand } from 'lucide-react';
import { label, shotLabel, type Character, type Clip } from '../engine/schema.ts';
import type { Format } from '../engine/renderer.ts';

export function IconButton({ title, children, onClick, disabled, active, className = '' }: { title: string; children: ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean; className?: string }) {
  return <button type="button" aria-label={title} title={title} className={`icon-button ${active ? 'active' : ''} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
export function Select<T extends string>({ value, onChange, options, aria, render = label }: { value: T; onChange: (value: T) => void; options: readonly T[]; aria: string; render?: (value: T) => string }) {
  return <span className="select-wrap"><select aria-label={aria} value={value} onChange={event => onChange(event.target.value as T)}>{options.map(item => <option key={item} value={item}>{render(item)}</option>)}</select><ChevronDown size={13} /></span>;
}
export function NumberField({ value, onChange, text, min, max, step = 1 }: { value: number; onChange: (value: number) => void; text: string; min: number; max: number; step?: number }) {
  return <label className="number-field"><span>{text}</span><input key={value} aria-label={text} type="number" step={step} min={min} max={max} defaultValue={Math.round(value * 100) / 100} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={e => { const next = Number(e.target.value); if (e.target.value.trim() && Number.isFinite(next)) { const valid = Math.min(max, Math.max(min, next)); if (valid !== value) onChange(valid); e.target.value = String(valid); } else e.target.value = String(value); }} /></label>;
}
export function Modal({ title, description, children, close, wide = false }: { title: string; description?: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const item = dialog.current; item?.showModal(); return () => { item?.close(); }; }, []);
  return <dialog ref={dialog} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="modal-content"><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div><IconButton title="Close dialog" onClick={close}><X size={19} /></IconButton></header>{children}</section>
  </dialog>;
}
export function Avatar({ character: c, large = false }: { character: Character; large?: boolean }) {
  return <span aria-hidden="true" className={`avatar avatar-${c.hair} ${large ? 'avatar-large' : ''}`} style={{ '--skin': c.skin, '--hair': c.hairColor, '--shirt': c.shirt, '--swatch': c.id === 'sbu' ? '#e9bd70' : c.id === 'zee' ? '#a49ad1' : c.id === 'milo' ? '#86bdac' : '#d49790' } as React.CSSProperties}>
    <i className="avatar-body"/><i className="avatar-ear"/><i className="avatar-head"><i className="avatar-hair"/><i className="avatar-eye"/><i className="avatar-eye avatar-eye-two"/><i className="avatar-mouth"/>{c.glasses && <i className="avatar-glasses"/>}{c.earrings && <i className="avatar-ring"/>}{c.hat !== 'none' && <i className="avatar-hat"/>}</i>
  </span>;
}
export const propIcon = { sofa: Sofa, chair: Armchair, table: Table2, desk: Table2, door: DoorOpen, window: PanelTop, television: Monitor, lamp: LampFloor, cup: Coffee, book: BookOpen, phone: Smartphone, plant: Sprout, microphone: Mic, streetlight: Cable, counter: Store, image: Image };
export const trackIcon = { actors: UserRound, movement: MoveRight, body: Activity, face: Smile, gaze: Eye, props: Hand, dialogue: AudioLines, audio: AudioLines, music: Music2, camera: Clapperboard, transition: Blend };
export const formats: Format[] = ['16:9', '9:16', '1:1'];
export const clipLabel = (clip: Clip, names: Record<string, string> = {}) => {
  switch (clip.track) {
    case 'actors': return names[clip.actor] ?? 'Actor';
    case 'movement': return `${names[clip.actor] ?? 'Actor'} ${clip.gait === 'run' ? 'runs' : clip.gait === 'walk' ? 'walks' : 'moves'}`;
    case 'gaze': return 'Look at ' + (names[clip.target] ?? clip.target);
    case 'props': return label(clip.interaction) + ' ' + clip.target;
    case 'body': return (names[clip.actor]?names[clip.actor]+' · ':'')+label(clip.action);
    case 'face': return (names[clip.actor]?names[clip.actor]+' · ':'')+label(clip.expression);
    case 'dialogue': return (names[clip.actor]?names[clip.actor]+' · ':'')+(clip.text || 'Voice');
    case 'audio': case 'music': return clip.name;
    case 'camera': return shotLabel(clip.shot);
    case 'transition': return label(clip.effect);
  }
};
export const clock = (time: number) => `${String(Math.floor(time / 60)).padStart(2, '0')}:${(time % 60).toFixed(2).padStart(5, '0')}`;
