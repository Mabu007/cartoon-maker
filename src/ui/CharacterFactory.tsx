import { useEffect, useRef, useState } from 'react';
import { Copy, Maximize2, Minus, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { createRenderer } from '../engine/renderer.ts';
import { fitCharacterPreview } from '../engine/previewLayout.ts';
import { NativeCharacterPreview } from './NativeCharacterPreview.tsx';
import { actions, expressions, label, uid, views, type Action, type Character, type Expression, type Scene, type View } from '../engine/schema.ts';
import { characters } from '../engine/presets.ts';
import { Avatar, IconButton, Modal, Select } from './shared.tsx';

const sliders = { height: 'Height', head: 'Head size', thickness: 'Build', torso: 'Torso length', arms: 'Arm length', legs: 'Leg length', eyeSpacing: 'Eye spacing' } as const;
const skinTones = ['#f2c49b', '#d89b70', '#b97550', '#925b40', '#76452f', '#503123'];
const colors = { skin: 'Skin tone', shirt: 'Top', pants: 'Trousers', hairColor: 'Hair color', shoes: 'Shoes' } as const;
const styles = {
  shape: ['round', 'oval', 'square'], eyes: ['round', 'relaxed', 'wide'], brows: ['arched', 'straight', 'bold'], nose: ['button', 'long', 'flat'], mouth: ['smile', 'line', 'full'], ears: ['round', 'small', 'wide'],
  hair: ['fade', 'puff', 'locs', 'buzz', 'bald', 'afro', 'braids', 'curls'], beard: ['none', 'goatee', 'full'], hat: ['none', 'cap', 'beanie'], outfit: ['tee', 'hoodie', 'jacket', 'sweater', 'uniform'], accessory: ['none', 'chain', 'scarf']
} as const;
const styleGroups = { Hair: ['hair', 'beard', 'hat'], Face: ['shape', 'eyes', 'brows', 'nose', 'mouth', 'ears'], Outfit: ['outfit', 'accessory'], Body: [] } as const;
const viewLabels: Record<View, string> = { front: 'Front', 'three-quarter': '¾ Front', side: 'Side', 'back-quarter': '¾ Back', back: 'Back' };
export function CharacterFactory({ source, save, close, remove }: { source?: Character; save: (value: Character) => void; close: () => void; remove: (id: string) => void }) {
  const [draft, setDraft] = useState<Character>(() => source ?? { ...characters[0], id: uid(), name: 'New character' });
  const [section, setSection] = useState<keyof typeof styleGroups>('Hair'), [view, setView] = useState<View>('three-quarter');
  const [action, setAction] = useState<Action>('idle'), [expression, setExpression] = useState<Expression>('neutral');
  const [look, setLook] = useState<'auto'|'camera'|'left'|'right'|'up'>('auto');
  const [flip, setFlip] = useState(false), [scale, setScale] = useState(1.4), [fallback, setFallback] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const frame = useRef({ draft, action, expression, view, flip, scale, look });
  frame.current = { draft, action, expression, view, flip, scale, look };
  useEffect(() => {
    let alive = true, handle = 0;
    let dispose = () => {};
    const useNativePreview = (cause: unknown) => {
      if (!alive) return;
      console.warn('Accelerated character preview unavailable; switching to browser SVG.', cause);
      cancelAnimationFrame(handle);
      try { dispose(); } catch (error) { console.warn('Preview renderer cleanup failed.', error); }
      canvas.current?.replaceChildren();
      setFallback(true);
    };
    createRenderer('1:1', .8).then(renderer => {
      if (!alive) { renderer.destroy(); return; }
      const onContextLost = (event: Event) => { event.preventDefault(); useNativePreview(new Error('Graphics context lost')); };
      renderer.canvas.addEventListener('webglcontextlost', onContextLost);
      dispose = () => {
        renderer.canvas.removeEventListener('webglcontextlost', onContextLost);
        renderer.destroy();
      };
      canvas.current?.replaceChildren(renderer.canvas);
      const scene: Scene = {
        id: 'character-preview', name: 'Character', environment: 'Podcast studio', duration: 8,
        actors: [{ id: 'preview', characterId: frame.current.draft.id, x: 480, y: 443, scale: 1, rotation: 0, depth: 0, view: 'three-quarter', flip: false, expression: 'neutral' }],
        objects: [],
        clips: [{ id: 'pose', track: 'body', layer: 'body', actor: 'preview', action: 'idle', start: 0, length: 8 },
          { id: 'expression', track: 'face', expression: 'neutral', actor: 'preview', start: 0, length: 8 }]
      };
      let reset = performance.now(), lastAction = '', previous = -1;
      const animate = (now: number) => {
        const { draft, action, expression, view, flip, scale, look } = frame.current;
        if (lastAction !== action) { lastAction = action; reset = now; }
        const time = ((now - reset) / 1000) % 8;
        if (!document.hidden && Math.floor(time * 24) !== previous) {
          previous = Math.floor(time * 24);
          const layout = fitCharacterPreview(draft, scale, action);
          const actor = scene.actors[0];
          actor.characterId = draft.id; actor.x = layout.x; actor.y = layout.y; actor.scale = layout.scale;
          actor.view = view; actor.flip = flip; actor.expression = expression;
          const body = scene.clips[0], face = scene.clips[1];
          if (body.track === 'body') body.action = action;
          if (face.track === 'face') face.expression = expression;
          if (action === 'talk') {
            scene.clips[2] = { id: 'example-speech', track: 'dialogue', actor: 'preview', text: 'Hello there! Let us create a cartoon. Watch my mouth moving!', asset: 'builtin:sbu-food',
              start: 0, length: 8, muted: false, volume: 1, offset: 0 };
          } else scene.clips.length = 2;
          const gaze = look === 'auto' ? undefined : look === 'camera' ? { x: 0, y: 0 } :
            look === 'left' ? { x: -.95, y: 0 } : look === 'right' ? { x: .95, y: 0 } : { x: 0, y: -.95 };
          try {
            renderer.draw(scene, [draft], time, { characterPreview: true, previewFocus: gaze });
          } catch (cause) {
            useNativePreview(cause);
            return;
          }
        }
        handle = requestAnimationFrame(animate);
      };
      handle = requestAnimationFrame(animate);
    }).catch(useNativePreview);
    return () => { alive = false; cancelAnimationFrame(handle); try { dispose(); } catch { /* fallback already disposed the renderer */ } };
  }, []);
  const update = <K extends keyof Character>(key: K, value: Character[K]) => setDraft(item => ({ ...item, [key]: value }));
  return <Modal wide title={source ? 'Edit character' : 'Create character'} description="Pick a look, make it yours, and direct it from any angle." close={close}>
    <div className="factory-grid"><div className="factory-preview"><div className="factory-canvas">{fallback ? <NativeCharacterPreview character={draft} view={view} action={action} expression={expression} flip={flip} scale={fitCharacterPreview(draft, scale, action).scale} focus={look === 'auto' ? undefined : look === 'camera' ? { x: 0, y: 0 } : look === 'left' ? { x: -.95, y: 0 } : look === 'right' ? { x: .95, y: 0 } : { x: 0, y: -.95 }}/> : <div className="factory-renderer-mount" ref={canvas}/>}</div><div className="factory-zoom"><IconButton title="Fit entire character" onClick={() => setScale(1.4)}><Maximize2 size={15}/></IconButton><IconButton title="Mirror character" active={flip} onClick={() => setFlip(value => !value)}><RotateCcw size={15}/></IconButton><IconButton title="Zoom out character" onClick={() => setScale(n => Math.max(.75, n - .12))}><Minus size={15}/></IconButton><IconButton title="Zoom in character" onClick={() => setScale(n => Math.min(1.7, n + .12))}><Plus size={15}/></IconButton></div>
      <div className="segmented view-choice" aria-label="Character view">{views.map(item => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{viewLabels[item]}</button>)}</div>
      <div className="field-row"><label>Preview action<Select aria="Preview action" value={action} onChange={setAction} options={actions}/></label><label>Expression<Select aria="Preview expression" value={expression} onChange={setExpression} options={expressions}/></label></div>
      <label className="field preview-eye-focus">Eye focus<Select aria="Preview eye focus" value={look} onChange={setLook} options={['auto','camera','left','right','up'] as const}
        render={value => value === 'auto' ? 'Natural · moving eyes' : value === 'camera' ? 'Eye contact · camera' : 'Look ' + value}/></label>
    </div><div className="factory-edit"><label className="field">Name<input aria-label="Character name" maxLength={60} value={draft.name} onChange={e => update('name', e.target.value)}/></label>
      <div className="factory-voice-config" aria-label="Persistent character voice configuration">
        <strong>Character voice · used in every scene</strong>
        <label className="field">Voice preset
          <select aria-label="Character voice preset" value={draft.voicePreset ?? 'warm'}
            onChange={e => update('voicePreset',e.target.value as 'warm'|'bright'|'deep')}>
            <option value="warm">Warm</option><option value="bright">Bright</option><option value="deep">Deep</option>
          </select>
        </label>
        <label className="field">Hosted voice ID (optional)
          <input aria-label="Custom hosted voice ID" maxLength={120} spellCheck={false}
            placeholder="Your provider reference voice ID" value={draft.hostedVoiceId??''}
            onChange={event => {
              const hostedVoiceId=event.target.value.trim();
              setDraft(current => {
                const { hostedVoiceId: _old, ...rest }=current;
                return hostedVoiceId?{...rest,hostedVoiceId}:rest;
              });
            }}/>
        </label>
        <p className="small-text">Leave the hosted ID empty to use the configured voice preset. Local speech is always available.</p>
      </div>
      <div className="factory-section-heading"><span>Start with a character</span><button type="button" className="surprise-button" onClick={() => {
        const item = characters[Math.floor(Math.random() * characters.length)];
        setDraft(current => ({ ...item, id: current.id, name: current.name }));
      }}>Surprise me ✨</button></div>
      <div className="preset-row" aria-label="Character presets">{characters.map(item => <button key={item.id} type="button" title={item.name} aria-label={`Use ${item.name} preset`} onClick={() => setDraft({ ...item, id: draft.id, name: draft.name })}><Avatar character={item}/><span>{item.name}</span></button>)}</div>
      <div className="segmented factory-categories">{(['Hair', 'Face', 'Outfit', 'Body'] as const).map(item => <button key={item} type="button" onClick={() => setSection(item)} className={item === section ? 'active' : ''}>{item}</button>)}</div>
      <div className="factory-fields">
        {styleGroups[section].map(key => <label className="field" key={key}>{label(key)}
          {key === 'hair' || key === 'outfit' || key === 'shape'
            ? <div className="choice-pills">{styles[key].map(value => <button type="button" className={draft[key] === value ? 'selected' : ''} key={value} onClick={() => update(key, value)}>{label(value)}</button>)}</div>
            : <Select aria={label(key)} value={draft[key]} onChange={v => update(key, v)} options={styles[key]}/>}
        </label>)}
        {section === 'Body' && <><p className="factory-helper">Start with three simple proportions. Your character stays rigged at every size.</p>{(['height', 'head', 'thickness'] as const).map(id => <label className="field slider" key={id}>{sliders[id]}<input type="range" min={id === 'thickness' ? .65 : .75} max={id === 'head' ? 1.35 : id === 'thickness' ? 1.45 : 1.3} step={.01} value={draft[id]} onChange={e => update(id, Number(e.target.value))}/></label>)}</>}
        {section === 'Face' && <div className="factory-teeth-editor">
          <span>Teeth · tap a tooth to make it gold</span>
          <div className="factory-teeth-row" role="group" aria-label="Choose gold teeth">
            {Array.from({ length: 6 }, (_, index) => <button type="button" key={index}
              className={(draft.goldTeeth ?? []).includes(index) ? 'gold' : ''}
              aria-label={'Tooth ' + (index + 1)} aria-pressed={(draft.goldTeeth ?? []).includes(index)}
              onClick={() => update('goldTeeth', (draft.goldTeeth ?? []).includes(index)
                ? (draft.goldTeeth ?? []).filter(value => value !== index)
                : [...(draft.goldTeeth ?? []), index].sort((a,b) => a-b))}>{index + 1}</button>)}
          </div>
        </div>}
        {section === 'Face' && <div className="factory-toggle-row"><label className="check"><input type="checkbox" checked={draft.glasses} onChange={e => update('glasses', e.target.checked)}/> Glasses</label><label className="check"><input type="checkbox" checked={draft.earrings} onChange={e => update('earrings', e.target.checked)}/> Earrings</label></div>}
        {section === 'Outfit' && <div className="color-row">{Object.entries(colors).filter(([key]) => key !== 'skin').map(([key, title]) => <label key={key} title={title}><input type="color" aria-label={title} value={draft[key as keyof typeof colors]} onChange={e => update(key as keyof typeof colors, e.target.value)}/><span>{title}</span></label>)}</div>}
        <div className="factory-skin"><span>Skin tone</span><div className="tone-swatches">{skinTones.map(tone => <button key={tone} type="button" className={draft.skin.toLowerCase() === tone ? 'selected' : ''} style={{ backgroundColor: tone }} title={tone} aria-label={`Skin tone ${tone}`} onClick={() => update('skin', tone)}/>)}</div><label className="custom-tone">Custom <input type="color" aria-label="Custom skin tone" value={draft.skin} onChange={e => update('skin', e.target.value)}/></label></div>
        {(section === 'Face' || section === 'Body') && <><button type="button" className="advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>{advanced ? '− Hide advanced proportions' : '+ Advanced proportions'}</button>
        {advanced && <div className="factory-advanced">{(section === 'Face' ? ['eyeSpacing'] : ['torso', 'arms', 'legs']).map(key => { const id = key as keyof typeof sliders; return <label className="field slider" key={key}>{sliders[id]}<input type="range" min={.65} max={id === 'eyeSpacing' ? 1.4 : 1.3} step={.01} value={draft[id]} onChange={event => update(id, Number(event.target.value))}/></label>; })}</div>}</>}
      </div>
    </div></div>
    <footer className="modal-footer">{source && <><IconButton title="Delete character" onClick={() => remove(source.id)}><Trash2 size={17}/></IconButton><button className="quiet" disabled={!draft.name.trim()} onClick={() => save({ ...draft, id: uid(), name: `${draft.name.trim().slice(0, 54)} copy` })}><Copy size={16}/> Duplicate</button></>}<span className="spacer"/><button className="quiet" onClick={close}>Cancel</button><button className="primary" disabled={!draft.name.trim()} onClick={() => save({ ...draft, name: draft.name.trim() })}><Save size={16}/> Save character</button></footer>
  </Modal>;
}
