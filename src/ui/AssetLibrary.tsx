import { ArrowUpRight, AudioLines, Boxes, Clapperboard, Image, Mic, Music2, Plus, Search, Sparkles, UserRound } from 'lucide-react';
import { useState } from 'react';
import { actions, environments, label, props, type Action, type Character, type Prop, type Scene } from '../engine/schema.ts';
import { scenePalettes, soundNames } from '../engine/presets.ts';
import type { Library } from '../studio.ts';
import { Avatar, IconButton, propIcon } from './shared.tsx';

const tabs = { Cast: UserRound, Worlds: Image, Props: Boxes, Actions: Clapperboard, Audio: Music2 };
export function AssetLibrary({ active, change, characters, scene, newCharacter, editCharacter, addActor, setWorld, addProp, addAction, addSound, dialogue, audio }: {
  active: Library; change: (panel: Library) => void; characters: Character[]; scene: Scene;
  newCharacter: () => void; editCharacter: (character: Character) => void; addActor: (character: Character) => void;
  setWorld: (world: Scene['environment']) => void; addProp: (kind: Prop['kind']) => void; addAction: (action: Action) => void;
  addSound: (sound: typeof soundNames[number]) => void; dialogue: () => void; audio: () => void;
}) {
  const [filter, setFilter] = useState('');
  const match = (value: string) => value.toLowerCase().includes(filter.trim().toLowerCase());
  return <aside className="asset-panel" aria-label="Asset library">
    <nav className="asset-rail" aria-label="Asset types">{(Object.keys(tabs) as Library[]).map(tab => { const Icon = tabs[tab]; return <button key={tab} className={active === tab ? 'active' : ''} aria-pressed={active === tab} onClick={() => { setFilter(''); change(tab); }}><Icon size={19}/><span>{tab}</span></button>; })}</nav>
    <div className="asset-content"><div className="asset-heading"><div><h2>{active === 'Cast' ? 'Characters' : active}</h2><p>{active === 'Cast' ? `${characters.length} in your cast` : active === 'Worlds' ? 'Furnished environments' : active === 'Props' ? 'Set the scene' : active === 'Actions' ? 'Give your actors direction' : 'Voices and sound effects'}</p></div>{active === 'Cast' && <IconButton title="Create character" className="square-add" onClick={newCharacter}><Plus size={17}/></IconButton>}</div>
    <label className="search-field"><Search size={15}/><input aria-label={`Search ${active.toLowerCase()}`} placeholder={`Search ${active === 'Cast' ? 'characters' : active.toLowerCase()}…`} value={filter} onChange={e => setFilter(e.target.value)}/></label>
    <div className="asset-list">
      {active === 'Cast' && <>{characters.filter(item => match(item.name)).map(character => <div className="character-card" key={character.id}>
        <button className="character-main" onClick={() => editCharacter(character)} aria-label={`Edit ${character.name}`}><Avatar character={character}/><span><strong>{character.name}</strong><small>{scene.actors.some(actor => actor.characterId === character.id) ? 'In this scene' : 'Available'}</small></span></button><IconButton title={`Add ${character.name} to scene`} onClick={() => addActor(character)}><Plus size={15}/></IconButton>
      </div>)}{characters.filter(item => match(item.name)).length === 0 && <p className="empty-small">No matching characters.</p>}<button className="asset-create" onClick={newCharacter}><Plus size={16}/> Create character</button></>}
      {active === 'Worlds' && environments.filter(match).map(world => <button key={world} className={`world-card ${scene.environment === world ? 'current' : ''}`} onClick={() => setWorld(world)}><span className="world-thumb" style={{ '--wall': scenePalettes[world][0], '--floor': scenePalettes[world][2], '--detail': scenePalettes[world][3] } as React.CSSProperties}><i/><i/><i/></span><strong>{world}</strong><ArrowUpRight size={14}/></button>)}
      {active === 'Props' && <div className="asset-grid">{props.filter(match).map(kind => { const Icon = propIcon[kind]; return <button className="prop-card" key={kind} onClick={() => addProp(kind)}><Icon size={23}/><span>{label(kind)}</span></button>; })}</div>}
      {active === 'Actions' && actions.filter(match).map(action => <button className="asset-row" key={action} onClick={() => addAction(action)}><Clapperboard size={16}/><span>{label(action)}</span><Plus size={14}/></button>)}
      {active === 'Audio' && <><button className="asset-row" onClick={dialogue}><Mic size={16}/><span>Add dialogue</span><Plus size={14}/></button><button className="asset-row" onClick={audio}><AudioLines size={16}/><span>Upload audio</span><Plus size={14}/></button><div className="small-label audio-heading">Sound effects</div>{soundNames.filter(match).map(sound => <button className="asset-row" key={sound} onClick={() => addSound(sound)}><Sparkles size={15}/><span>{label(sound)}</span><Plus size={14}/></button>)}</>}
    </div></div>
  </aside>;
}
