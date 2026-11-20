import { useEffect, useRef, useState } from 'react';
import { Copy, Minus, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { createRenderer } from '../engine/renderer.ts';
import { actions, expressions, label, uid, views, type Action, type Character, type Expression, type Scene, type View } from '../engine/schema.ts';
import { characters } from '../engine/presets.ts';
import { Avatar, IconButton, Modal, Select } from './shared.tsx';

const sliders = { height: 'Height', head: 'Head size', torso: 'Torso length', arms: 'Arm length', legs: 'Leg length', thickness: 'Limb width', eyeSpacing: 'Eye spacing' } as const;
const colors = { skin: 'Skin tone', shirt: 'Top', pants: 'Trousers', hairColor: 'Hair color', shoes: 'Shoes' } as const;
const styles = {
  shape: ['round', 'oval', 'square'], eyes: ['round', 'relaxed', 'wide'], brows: ['arched', 'straight', 'bold'], nose: ['button', 'long', 'flat'], mouth: ['smile', 'line', 'full'], ears: ['round', 'small', 'wide'],
  hair: ['fade', 'puff', 'locs', 'buzz', 'bald'], beard: ['none', 'goatee', 'full'], hat: ['none', 'cap', 'beanie'], outfit: ['tee', 'hoodie', 'jacket'], accessory: ['none', 'chain', 'scarf']
} as const;
const styleGroups = { Body: ['shape'], Face: ['eyes', 'brows', 'nose', 'mouth', 'ears'], Style: ['hair', 'beard', 'hat', 'outfit', 'accessory'] } as const;
const viewLabels: Record<View, string> = { front: 'Front', 'three-quarter': '¾ Front', side: 'Side', 'back-quarter': '¾ Back', back: 'Back' };
export function CharacterFactory({ source, save, close, remove }: { source?: Character; save: (value: Character) => void; close: () => void; remove: (id: string) => void }) {
  const [draft, setDraft] = useState<Character>(() => source ?? { ...characters[0], id: uid(), name: 'New character' });
  const [section, setSection] = useState<keyof typeof styleGroups>('Style'), [view, setView] = useState<View>('three-quarter');
  const [action, setAction] = useState<Action>('idle'), [expression, setExpression] = useState<Expression>('neutral');
  const [flip, setFlip] = useState(false), [scale, setScale] = useState(1.42), [error, setError] = useState('');
  const canvas = useRef<HTMLDivElement>(null);
  const frame = useRef({ draft, action, expression, view, flip, scale });
  frame.current = { draft, action, expression, view, flip, scale };
  useEffect(() => {
    let alive = true, handle = 0;
    let dispose = () => {};
    createRenderer('1:1', .8).then(renderer => {
      if (!alive) { renderer.destroy(); return; }
      dispose = renderer.destroy;
      canvas.current?.replaceChildren(renderer.canvas);
      let reset = performance.now(), lastAction = '', previous = -1;
      const animate = (now: number) => {
        const { draft, action, expression, view, flip, scale } = frame.current;
        if (lastAction !== action) { lastAction = action; reset = now; }
        const time = ((now - reset) / 1000) % 8;
        if (Math.floor(time * 24) !== previous) {
          previous = Math.floor(time * 24);
          const scene: Scene = { id: 'character-preview', name: 'Character', environment: 'Podcast studio', duration: 8, actors: [{ id: 'preview', characterId: draft.id, x: 480, y: 450, scale, rotation: 0, depth: 0, view, flip, expression }], objects: [], clips: [{ id: 'pose', track: 'body', layer: 'body', actor: 'preview', action, start: 0, length: 8 }, { id: 'expression', track: 'face', expression, actor: 'preview', start: 0, length: 8 }] };
          renderer.draw(scene, [draft], time);
        }
        handle = requestAnimationFrame(animate);
      };
      handle = requestAnimationFrame(animate);
    }).catch(() => { if (alive) setError('The character preview needs WebGL.'); });
    return () => { alive = false; cancelAnimationFrame(handle); dispose(); };
  }, []);
  const update = <K extends keyof Character>(key: K, value: Character[K]) => setDraft(item => ({ ...item, [key]: value }));
  return <Modal wide title={source ? 'Edit character' : 'Create character'} description="Design once. Direct from any angle." close={close}>
    <div className="factory-grid"><div className="factory-preview"><div className="factory-canvas" ref={canvas}/><div className="factory-zoom"><IconButton title="Mirror character" active={flip} onClick={() => setFlip(value => !value)}><RotateCcw size={15}/></IconButton><IconButton title="Zoom out character" onClick={() => setScale(n => Math.max(.8, n - .15))}><Minus size={15}/></IconButton><IconButton title="Zoom in character" onClick={() => setScale(n => Math.min(1.8, n + .15))}><Plus size={15}/></IconButton></div>
      <div className="segmented view-choice" aria-label="Character view">{views.map(item => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{viewLabels[item]}</button>)}</div>
      <div className="field-row"><label>Preview action<Select aria="Preview action" value={action} onChange={setAction} options={actions}/></label><label>Expression<Select aria="Preview expression" value={expression} onChange={setExpression} options={expressions}/></label></div>
    </div><div className="factory-edit"><label className="field">Name<input aria-label="Character name" maxLength={60} value={draft.name} onChange={e => update('name', e.target.value)}/></label>
      <div className="preset-row" aria-label="Character presets">{characters.map(item => <button key={item.id} title={item.name} aria-label={`Use ${item.name} preset`} onClick={() => setDraft({ ...item, id: draft.id, name: draft.name })}><Avatar character={item}/></button>)}</div>
      <div className="segmented">{(['Style', 'Body', 'Face'] as const).map(item => <button key={item} onClick={() => setSection(item)} className={item === section ? 'active' : ''}>{item}</button>)}</div>
      <div className="factory-fields">{styleGroups[section].map(key => <label className="field" key={key}>{label(key)}<Select aria={label(key)} value={draft[key]} onChange={v => update(key, v)} options={styles[key]}/></label>)}
      {section === 'Body' && Object.entries(sliders).filter(([key]) => key !== 'eyeSpacing').map(([key, title]) => { const id = key as keyof typeof sliders; return <label className="field slider" key={key}>{title}<input type="range" min={id === 'thickness' ? .65 : .75} max={id === 'head' ? 1.35 : id === 'thickness' ? 1.45 : 1.3} step={.01} value={draft[id]} onChange={event => update(id, Number(event.target.value))}/></label>; })}
      {section === 'Face' && <><label className="field slider">Eye spacing<input type="range" min={.65} max={1.4} step={.01} value={draft.eyeSpacing} onChange={e => update('eyeSpacing', Number(e.target.value))}/></label><label className="check"><input type="checkbox" checked={draft.glasses} onChange={e => update('glasses', e.target.checked)}/> Glasses</label><label className="check"><input type="checkbox" checked={draft.earrings} onChange={e => update('earrings', e.target.checked)}/> Earring</label></>}
      {section === 'Style' && <div className="color-row">{Object.entries(colors).map(([key, title]) => <label key={key} title={title}><input type="color" aria-label={title} value={draft[key as keyof typeof colors]} onChange={e => update(key as keyof typeof colors, e.target.value)}/><span>{title}</span></label>)}</div>}</div>
    </div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="modal-footer">{source && <><IconButton title="Delete character" onClick={() => remove(source.id)}><Trash2 size={17}/></IconButton><button className="quiet" disabled={!draft.name.trim()} onClick={() => save({ ...draft, id: uid(), name: `${draft.name.trim().slice(0, 54)} copy` })}><Copy size={16}/> Duplicate</button></>}<span className="spacer"/><button className="quiet" onClick={close}>Cancel</button><button className="primary" disabled={!draft.name.trim()} onClick={() => save({ ...draft, name: draft.name.trim() })}><Save size={16}/> Save character</button></footer>
  </Modal>;
}
