import type { ActorEntrance } from '../engine/actorPresence.ts';
import { MediaImage } from './MediaImage.tsx';
import { ArrowUpRight, AudioLines, Boxes, Clapperboard, Image, Mic, Music2, Plus, Search,
  Sparkles, UserRound, Copy, Trash2, Pencil, Save, X, Check, Settings2, Play, FileAudio, Footprints, Zap, Type, Blend } from 'lucide-react';
import { useRef, useState } from 'react';
import { environments, label, props, type Action, type Character, type Prop,
  type Scene, type Clip, type Project } from '../engine/schema.ts';
import { seatingNames } from '../engine/characterCatalog.ts';
import { isSeating } from '../engine/seatingCatalog.ts';
import { characterUsage, propUsage } from '../engine/assetSafety.ts';
import { scenePalettes, soundNames } from '../engine/presets.ts';
import { actionGroups, soundGroups, vfxNames, transitionPresets, type SoundName } from '../engine/performanceCatalog.ts';
import { previewSound } from '../services/audio.ts';
import type { Library } from '../studio.ts';
import { Avatar, IconButton, propIcon } from './shared.tsx';

const tabs = { Cast: UserRound, Worlds: Image, Props: Boxes, Actions: Clapperboard, Effects: Sparkles, Audio: Music2 };
export type SavedWorld = {name:string;environment:Scene['environment'];objects:Prop[];backgroundImage?:string};
type AudioClip=Extract<Clip,{track:'dialogue'|'audio'|'music'}>;
function audioName(clip:AudioClip,characters:Record<string,string>){
  if(clip.track==='dialogue')return (characters[clip.actor]??'Character')+': '+(clip.text||'Untitled dialogue');
  return clip.name;
}
export function AssetLibrary({ active, change, project, characters, scene, newCharacter, editCharacter,
  duplicateCharacter,removeCharacter,addActor,setWorld,uploadWorld,savedWorlds,applySavedWorld,
  saveCurrentWorld,renameSavedWorld,duplicateSavedWorld,deleteSavedWorld,clearWorldImage,
  addProp,uploadProp,inspectProp,duplicateProp,deleteProp,addAction,selectActor,addVfx,addTransition,addText,holdObject,addSound,dialogue,audio,music,
  inspectAudio,duplicateAudio,deleteAudio
}:{
  active:Library;change:(panel:Library)=>void;project:Project;characters:Character[];scene:Scene;
  newCharacter:()=>void;editCharacter:(character:Character)=>void;
  duplicateCharacter:(character:Character)=>void;removeCharacter:(character:Character)=>void;
  addActor:(character:Character,mode?:ActorEntrance)=>void;
  setWorld:(world:Scene['environment'])=>void;uploadWorld:(file:File)=>void;
  savedWorlds:SavedWorld[];applySavedWorld:(world:SavedWorld)=>void;
  saveCurrentWorld:()=>void;renameSavedWorld:(oldName:string,newName:string)=>void;
  duplicateSavedWorld:(name:string)=>void;deleteSavedWorld:(name:string)=>void;
  clearWorldImage:()=>void;
  addProp:(kind:Prop['kind'])=>void;uploadProp:(file:File)=>void;
  inspectProp:(id:string)=>void;duplicateProp:(id:string)=>void;deleteProp:(id:string)=>void;
  addAction:(action:Action)=>void;holdObject?:()=>void;addSound:(sound:typeof soundNames[number])=>void;
  selectActor:(id:string)=>void;addVfx:(effect:typeof vfxNames[number])=>void;
  addTransition:(effect:typeof transitionPresets[number])=>void;addText:()=>void;
  dialogue:()=>void;audio:()=>void;music:()=>void;
  inspectAudio:(id:string)=>void;duplicateAudio:(id:string)=>void;deleteAudio:(id:string)=>void;
}){
  const [filter,setFilter]=useState('');
  const [soundError,setSoundError]=useState('');
  const [editingWorld,setEditingWorld]=useState<string>();
  const [worldName,setWorldName]=useState('');
  const [renameError,setRenameError]=useState('');
  const worldFile=useRef<HTMLInputElement>(null),propFile=useRef<HTMLInputElement>(null);
  const match=(value:string)=>value.toLowerCase().includes(filter.trim().toLowerCase());
  const names=Object.fromEntries(scene.actors.map(actor=>
    [actor.id,characters.find(character=>character.id===actor.characterId)?.name??'Character']));
  const audioClips=scene.clips.filter((clip):clip is AudioClip=>
    clip.track==='dialogue'||clip.track==='audio'||clip.track==='music')
    .sort((a,b)=>a.start-b.start);
  function startWorldRename(name:string){setEditingWorld(name);setWorldName(name);setRenameError('');}
  function finishWorldRename(){
    const title=worldName.trim();
    if(!editingWorld||!title||title.length>70){setRenameError('Choose a world name (1–70 characters).');return;}
    try{renameSavedWorld(editingWorld,title);setEditingWorld(undefined);setRenameError('');}
    catch(e){setRenameError(e instanceof Error?e.message:'Could not rename world.');}
  }
  return <aside className="asset-panel" aria-label="Creative assets">
    <nav className="asset-rail" aria-label="Asset types">
      {(Object.keys(tabs) as Library[]).map(tab=>{
        const Icon=tabs[tab];
        return <button key={tab} className={active===tab?'active':''} aria-pressed={active===tab}
          onClick={()=>{setFilter('');change(tab);}}>
          <Icon size={19}/><span>{tab==='Cast'?'Characters':tab==='Props'?'Objects':tab}</span></button>;
      })}
    </nav>
    <div className="asset-content">
      <div className="asset-heading"><div>
        <h2>{active==='Cast'?'Characters':active==='Worlds'?'Your worlds':active}</h2>
        <p>{active==='Cast'?`${characters.length} character${characters.length!==1?'s':''} · Edit or place`:
          active==='Worlds'?'Build and save your movie sets':
          active==='Props'?'Add, arrange and customize objects':
          active==='Actions'?'Movement, acting, cartoon fights and dance':active==='Effects'?'Effects, transitions and on-screen text':'Dialogue, music and sound'}</p>
      </div>
      {active==='Cast'&&<IconButton title="Create a new character" className="square-add"
        onClick={newCharacter}><Plus size={17}/></IconButton>}
      </div>
      <label className="search-field"><Search size={15}/>
        <input aria-label={`Search ${active.toLowerCase()}`} placeholder={`Find ${active.toLowerCase()}…`}
          value={filter} onChange={e=>setFilter(e.target.value)}/></label>
      <div className="asset-list">
        {active==='Cast'&&<>
          {scene.actors.some(item=>match(names[item.id]))&&<div className="small-label">In this scene</div>}
          {scene.actors.filter(item=>match(names[item.id])).map(item=><button key={item.id} className="asset-row" onClick={()=>selectActor(item.id)} aria-label={`Select ${names[item.id]} in scene`}><UserRound size={16}/><span>{names[item.id]}</span><Settings2 size={14}/></button>)}
          {characters.filter(item=>match(item.name)).map(character=>{
            const usage=characterUsage(project,character.id),current=scene.actors.filter(a=>a.characterId===character.id).length;
            return <article className="asset-manage-row" key={character.id} draggable onDragStart={e=>{e.dataTransfer.setData('application/x-toonroom-character',character.id);e.dataTransfer.effectAllowed='copy';}}>
              <button className="asset-resource-main character-main" onClick={()=>editCharacter(character)}
                aria-label={`Edit ${character.name}`}>
                <Avatar character={character}/>
                <span><strong>{character.name}</strong>
                  <small>{current?'In this scene · ':''}{usage.sceneActors} appearance{usage.sceneActors!==1?'s':''} across movie</small></span>
              </button>
              <div className="asset-resource-actions">
                <IconButton title={`Place ${character.name} at the playhead`} onClick={()=>addActor(character,'place')}><Plus size={15}/></IconButton>
                <IconButton title={`Walk ${character.name} into the scene at the playhead`} onClick={()=>addActor(character,'walk')}><Footprints size={15}/></IconButton>
                <IconButton title={`Run ${character.name} into the scene at the playhead`} onClick={()=>addActor(character,'run')}><Zap size={15}/></IconButton>
                <IconButton title={`Duplicate ${character.name}`} onClick={()=>duplicateCharacter(character)}><Copy size={15}/></IconButton>
                <IconButton title={`Remove ${character.name} from cast`} onClick={()=>removeCharacter(character)}><Trash2 size={15}/></IconButton>
              </div>
            </article>;
          })}
          {!characters.some(item=>match(item.name))&&<p className="empty-small">No matching characters.</p>}
          <button className="asset-create" onClick={newCharacter}><Plus size={16}/> Create character</button>
        </>}
        {active==='Worlds'&&<>
          <button className="asset-create" onClick={()=>worldFile.current?.click()}>
            <Plus size={16}/> Upload a world image</button>
          <input ref={worldFile} className="asset-file-input" type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
            aria-label="Upload world image"
            onChange={event=>{const file=event.target.files?.[0];if(file)uploadWorld(file);event.target.value='';}}/>
          {scene.backgroundImage&&<div className="image-world-card">
            <MediaImage source={scene.backgroundImage} alt="Current custom world"/>
            <span>Custom image · This scene only</span>
            <button className="quiet" onClick={clearWorldImage}><X size={14}/> Remove image</button>
          </div>}
          <div className="small-label">Built-in locations</div>
          {environments.filter(match).map(world=><button key={world}
            className={`world-card ${scene.environment===world&&!scene.backgroundImage?'current':''}`}
            onClick={()=>setWorld(world)}>
            <span className="world-thumb" style={{
              '--wall':scenePalettes[world][0],'--floor':scenePalettes[world][2],
              '--detail':scenePalettes[world][3]
            } as React.CSSProperties}><i/><i/><i/></span>
            <strong>{world}</strong><ArrowUpRight size={14}/>
          </button>)}
          <div className="asset-heading asset-section-heading"><div><h3>Saved worlds</h3>
            <p>Reusable set dressing and backgrounds</p></div></div>
          <button className="asset-create" onClick={saveCurrentWorld}><Save size={15}/> Save current world</button>
          {savedWorlds.filter(world=>match(world.name)).map(world=>
            <article className="asset-manage-row asset-saved-world" key={world.name}>
              {editingWorld===world.name?<form className="asset-world-rename"
                onSubmit={event=>{event.preventDefault();finishWorldRename();}}>
                <input aria-label="Rename saved world" autoFocus maxLength={70} value={worldName}
                  onChange={event=>setWorldName(event.target.value)}/>
                <button className="quiet" type="submit" title="Save world name"><Check size={15}/></button>
                <button className="quiet" type="button" title="Cancel renaming" onClick={()=>setEditingWorld(undefined)}><X size={15}/></button>
                {!!renameError&&<small role="alert">{renameError}</small>}
              </form>:<>
                <button className="asset-resource-main" onClick={()=>applySavedWorld(world)}>
                  {world.backgroundImage?<MediaImage className="asset-image-preview" source={world.backgroundImage} alt=""/>:
                    <span className="world-thumb" style={{
                      '--wall':scenePalettes[world.environment][0],
                      '--floor':scenePalettes[world.environment][2],
                      '--detail':scenePalettes[world.environment][3]
                    } as React.CSSProperties}><i/><i/><i/></span>}
                  <span><strong>{world.name}</strong><small>{world.objects.length} props · Apply to scene</small></span>
                </button>
                <div className="asset-resource-actions">
                  <IconButton title={`Rename ${world.name}`} onClick={()=>startWorldRename(world.name)}><Pencil size={15}/></IconButton>
                  <IconButton title={`Duplicate ${world.name}`} onClick={()=>duplicateSavedWorld(world.name)}><Copy size={15}/></IconButton>
                  <IconButton title={`Delete ${world.name}`} onClick={()=>deleteSavedWorld(world.name)}><Trash2 size={15}/></IconButton>
                </div>
              </>}
            </article>)}
          {!savedWorlds.length&&<p className="empty-small">Save this scene's furnished world to reuse it later.</p>}
        </>}
        {active==='Props'&&<>
          <button className="asset-create" onClick={()=>propFile.current?.click()}><Plus size={16}/> Upload PNG / SVG prop</button>
          <input ref={propFile} className="asset-file-input" type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
            aria-label="Upload image prop"
            onChange={event=>{const file=event.target.files?.[0];if(file)uploadProp(file);event.target.value='';}}/>
          <div className="small-label">Add from collection</div>
          <div className="asset-grid">{props.filter(kind=>kind!=='image'&&match(isSeating(kind)?seatingNames[kind]:kind)).map(kind=>{
            const Icon=propIcon[kind];
            return <button className="prop-card" key={kind} draggable onDragStart={event=>{event.dataTransfer.setData('application/x-toonroom-prop',kind);event.dataTransfer.effectAllowed='copy';}} onClick={()=>addProp(kind)}>
              <Icon size={23}/><span>{isSeating(kind)?seatingNames[kind]:label(kind)}</span></button>;
          })}</div>
          <div className="asset-heading asset-section-heading"><div><h3>Props in this scene</h3>
            <p>Select to edit, move or customize</p></div></div>
          {scene.objects.filter(item=>match(item.name)).map(prop=>{
            const usage=propUsage(scene,prop.id);
            return <article className="asset-manage-row" key={prop.id}>
              <button className="asset-resource-main" onClick={()=>inspectProp(prop.id)}>
                {prop.imageData?<MediaImage className="asset-image-preview" source={prop.imageData} alt=""/>:
                  <span className="asset-object-preview" style={{'--object-color':prop.color} as React.CSSProperties}>
                    <Boxes size={18}/></span>}
                <span><strong>{prop.name}</strong><small>{label(prop.kind)} · {usage.total?usage.total+' cue reference(s)':'Ready to arrange'}</small></span>
              </button>
              <div className="asset-resource-actions">
                <IconButton title={`Edit ${prop.name}`} onClick={()=>inspectProp(prop.id)}><Settings2 size={15}/></IconButton>
                <IconButton title={`Duplicate ${prop.name}`} onClick={()=>duplicateProp(prop.id)}><Copy size={15}/></IconButton>
                <IconButton title={`Delete ${prop.name}`} onClick={()=>deleteProp(prop.id)}><Trash2 size={15}/></IconButton>
              </div>
            </article>;
          })}
          {!scene.objects.length&&<p className="empty-small">No props yet. Add one above to dress the scene.</p>}
        </>}
        {active==='Actions'&&<button className="asset-row" onClick={holdObject}><Boxes size={16}/><span>Hold object</span><Plus size={14}/></button>}
        {active==='Actions'&&Object.entries(actionGroups).map(([group,entries])=>{
          const matches=entries.filter(action=>match(label(action))||match(group));
          return matches.length>0&&<section className="asset-library-group" key={group}><h3 className="small-label">{group}</h3>{matches.map(action=>
          <button className="asset-row" key={action} draggable
            title="Click to configure, or drag to Actions / Movement"
            onDragStart={event=>{event.dataTransfer.setData('application/x-toonroom-action',action);
              event.dataTransfer.effectAllowed='copy';}}
            onClick={()=>addAction(action)}><Clapperboard size={16}/><span>{label(action)}</span><Plus size={14}/></button>)}</section>;
        })}
        {active==='Effects'&&<>
          {match('text')&&<button className="asset-create" onClick={addText}><Type size={16}/> Add text</button>}
          {vfxNames.some(effect=>match(label(effect)))&&<div className="small-label">Visual effects</div>}
          {vfxNames.filter(effect=>match(label(effect))).map(effect=><button key={effect} className="asset-row" onClick={()=>addVfx(effect)}><Sparkles size={16}/><span>{label(effect)}</span><Plus size={14}/></button>)}
          {transitionPresets.some(effect=>match(label(effect)))&&<div className="small-label">Transitions</div>}
          {transitionPresets.filter(effect=>match(label(effect))).map(effect=><button key={effect} className="asset-row" onClick={()=>addTransition(effect)}><Blend size={16}/><span>{label(effect)}</span><Plus size={14}/></button>)}
        </>}
        {active==='Audio'&&<>
          <button className="asset-row" onClick={dialogue}><Mic size={16}/><span>Add or record dialogue</span><Plus size={14}/></button>
          <div className="asset-media-actions">
            <button className="asset-media-tile" type="button" onClick={audio} title="Import an MP3, WAV, M4A or WebM sound effect">
              <span className="asset-media-icon"><AudioLines size={21}/></span><strong>Sound effect</strong>
              <small>Upload audio</small><Plus size={15} className="asset-media-plus"/>
            </button>
            <button className="asset-media-tile" type="button" onClick={music} title="Upload an MP3, WAV, M4A or WebM soundtrack">
              <span className="asset-media-icon music"><Music2 size={21}/></span><strong>Music</strong>
              <small>Upload a soundtrack</small><Plus size={15} className="asset-media-plus"/>
            </button>
          </div>
          <div className="small-label">Built-in sound effects</div>
          {soundError&&<p role="status" className="small-text">{soundError}</p>}
          {Object.entries(soundGroups).map(([group,entries])=>{
            const sounds=entries.filter(sound=>match(label(sound))||match(group));
            return sounds.length>0&&<section className="asset-library-group" key={group}><h3 className="small-label">{group}</h3>{sounds.map((sound:SoundName)=>
              <div className="sound-library-row" key={sound}>
                <button className="asset-row" draggable title="Click to add, or drag to the SFX or Music track"
                  onDragStart={event=>{event.dataTransfer.setData('application/x-toonroom-sound',sound);event.dataTransfer.effectAllowed='copy';}}
                  onClick={()=>addSound(sound)}><AudioLines size={15}/><span>{label(sound)}</span><Plus size={14}/></button>
                <IconButton title={'Preview '+label(sound)} onClick={()=>{setSoundError('');void previewSound(sound).catch(()=>setSoundError('Sound preview is unavailable.'));}}><Play size={14}/></IconButton>
              </div>)}</section>;
          })}
          <div className="asset-heading asset-section-heading"><div>
            <h3>Recorded & imported clips</h3><p>Choose a clip to edit audio, lip sync or timing</p></div></div>
          {audioClips.filter(clip=>match(audioName(clip,names))||match(clip.track)).map(clip=>
            <article className="asset-manage-row" key={clip.id}>
              <button className="asset-resource-main" onClick={()=>inspectAudio(clip.id)}
                aria-label={`Edit ${audioName(clip,names)}`}>
                <span className={`asset-audio-icon type-${clip.track}`}>
                  {clip.track==='dialogue'?<Mic size={17}/>:clip.track==='music'?<Music2 size={17}/>:<FileAudio size={17}/>}
                </span>
                <span><strong>{audioName(clip,names)}</strong>
                  <small>{label(clip.track)} · {clip.start.toFixed(1)}s · {clip.length.toFixed(1)}s
                  {clip.track==='dialogue'&&clip.lipSync?.source==='rhubarb'?' · Lip-synced':''}</small></span>
              </button>
              <div className="asset-resource-actions">
                <IconButton title="Edit audio clip" onClick={()=>inspectAudio(clip.id)}><Settings2 size={15}/></IconButton>
                <IconButton title="Duplicate audio clip" onClick={()=>duplicateAudio(clip.id)}><Copy size={15}/></IconButton>
                <IconButton title="Delete audio clip" onClick={()=>deleteAudio(clip.id)}><Trash2 size={15}/></IconButton>
              </div>
            </article>)}
          {!audioClips.length&&<p className="empty-small">No audio in this scene. Add dialogue, effects or music above.</p>}
          <p className="empty-small">Removing a timeline clip never deletes a recording used by another scene or voice version.</p>
        </>}
      </div>
    </div>
  </aside>;
}
