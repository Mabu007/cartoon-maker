import { MediaImage } from './MediaImage.tsx';
import { AudioLines, Clapperboard, Copy, Layers3, Plus, Settings2, SlidersHorizontal, Trash2, UserRound, ArrowLeft, ArrowRight, FlipHorizontal, Footprints, Zap, Eye, EyeOff } from 'lucide-react';
import { actions, expressions, label, shots, views, type ActorData, type Character, type Clip, type Prop, type Scene } from '../engine/schema.ts';
import { anchorFor, compatibleObjects, objectDependencies } from '../engine/interactions.ts';
import { anchors } from '../engine/presets.ts';
import { Avatar, clipLabel, IconButton, NumberField, propIcon, Select, trackIcon } from './shared.tsx';
import { changeClipTiming, type Selection } from '../studio.ts';
import { resizeSceneTimeline } from '../engine/timelineEditing.ts';
import { VoiceClipControls } from './VoiceClipControls.tsx';

export function Inspector({ onPresence, scene, actors, characters, selection, select, patchActor, patchObject, patchClip, patchScene, editCharacter, addDialogue, addAction, scenes, sceneIndex, openScenes, remove, duplicate, snap, setSnap, subtitles, setSubtitles, quality, setQuality, setDestination, precision, rerecord, regenerateVoice, restoreVoiceVersion, alignVoiceClip }: {
  onPresence:(id:string,action:'walk-in'|'run-in'|'walk-out'|'run-out'|'show'|'hide')=>void;
  scene: Scene; actors: Record<string, string>; characters: Character[]; selection: Selection; select: (value: Selection) => void;
  patchActor: (actor: ActorData) => void; patchObject: (object: Prop) => void; patchClip: (clip: Clip) => void; patchScene: (patch: Partial<Scene>) => void;
  editCharacter: (character: Character) => void; addDialogue: () => void; addAction: () => void; scenes: number; sceneIndex: number; openScenes: () => void; remove: () => void; duplicate: () => void;
  snap: boolean; setSnap: (value: boolean) => void; subtitles: boolean; setSubtitles: (value: boolean) => void; quality: boolean; setQuality: (value: boolean) => void; setDestination?: () => void; precision?: () => void; rerecord?: () => void; regenerateVoice?: (clip: Extract<Clip, {track: 'dialogue'}>, text: string, voice: string, force?:boolean) => Promise<string>;
  restoreVoiceVersion?: (clip: Extract<Clip, {track:'dialogue'}>, index:number)=>Promise<string>;
  alignVoiceClip: (clip: Extract<Clip,{track:'dialogue'}>, recognizer:'pocketSphinx'|'phonetic')=>Promise<string>;
}) {
  const actor = scene.actors.find(item => item.id === selection?.id);
  const character = actor && characters.find(item => item.id === actor.characterId);
  const object = scene.objects.find(item => item.id === selection?.id);
  const clip = scene.clips.find(item => item.id === selection?.id);
  const Icon = clip ? trackIcon[clip.track] : object ? propIcon[object.kind] : actor ? UserRound : Clapperboard;
  const selected = actor ?? object ?? clip;
  return <aside className="inspector" aria-label="Inspector">
    <div className="inspector-top"><SlidersHorizontal size={16}/><h2>Inspector</h2>{selected && <button className="inspector-back" onClick={() => select(null)}>Scene</button>}</div>
    <div className="inspector-scroll">
    {selected ? <>
      <div className="inspector-card"><div className="inspector-emblem">{character ? <Avatar character={character}/> : <Icon size={20}/>}</div><div><strong>{object?.name ?? character?.name ?? (clip && clipLabel(clip, actors))}</strong><small>{clip ? `${label(clip.track)} clip` : actor ? 'Selected actor' : 'Selected prop'}</small></div></div>
      {(actor || object) && <details open><summary>Transform</summary><div className="field-row"><NumberField text="X" value={(actor ?? object)!.x} min={-2000} max={3000} onChange={x => actor ? patchActor({ ...actor, x }) : patchObject({ ...object!, x })}/><NumberField text="Y" value={(actor ?? object)!.y} min={-2000} max={3000} onChange={y => actor ? patchActor({ ...actor, y }) : patchObject({ ...object!, y })}/></div>
      <div className="field-row"><NumberField text="Scale" value={(actor ?? object)!.scale} min={.2} max={4} step={.05} onChange={scale => actor ? patchActor({ ...actor, scale }) : patchObject({ ...object!, scale })}/><NumberField text="Rotation" value={(actor ?? object)!.rotation} min={-360} max={360} onChange={rotation => actor ? patchActor({ ...actor, rotation }) : patchObject({ ...object!, rotation })}/></div><NumberField text="Layer depth" value={(actor ?? object)!.depth} min={-1000} max={1000} onChange={depth => actor ? patchActor({ ...actor, depth }) : patchObject({ ...object!, depth })}/></details>}
      {actor && <details open><summary>Performance</summary><label className="field">Facing<Select aria="Facing" value={actor.view} onChange={view => patchActor({ ...actor, view })} options={views}/></label><label className="field">Expression<Select aria="Actor expression" value={actor.expression} onChange={expression => patchActor({ ...actor, expression })} options={expressions}/></label><label className="field">Eye focus<Select aria="Eye focus" value={actor.gazeTarget ?? ''}
  onChange={value => { const { gazeTarget: _old, ...base } = actor; patchActor(value ? { ...base, gazeTarget: value } : base); }}
  options={['', 'camera', ...scene.actors.filter(item => item.id !== actor.id).map(item => item.id), ...scene.objects.map(item => item.id)]}
  render={id => id === '' ? 'Automatic · follow conversation' : id === 'camera' ? 'Look into camera' :
    scene.actors.find(item => item.id === id) ? 'Look at ' + (actors[id] ?? 'character') :
    'Look at ' + (scene.objects.find(item => item.id === id)?.name ?? 'prop')}/></label>
    <p className="small-text">Eye contact follows speakers. Set a target above when you want to direct a look.</p>
     <div className="facing-controls" role="group" aria-label="Actor facing direction">
       <button type="button" className={actor.view==='side'&&actor.flip?'active':''} aria-pressed={actor.view==='side'&&actor.flip} onClick={()=>patchActor({...actor,view:'side',flip:true})}><ArrowLeft size={15}/> Face left</button>
       <button type="button" className={actor.view==='side'&&!actor.flip?'active':''} aria-pressed={actor.view==='side'&&!actor.flip} onClick={()=>patchActor({...actor,view:'side',flip:false})}><ArrowRight size={15}/> Face right</button>
       <button type="button" aria-label="Flip actor horizontally" title="Flip selected actor" onClick={()=>patchActor({...actor,flip:!actor.flip})}><FlipHorizontal size={16}/> Flip</button>
     </div>
     <div className="actor-entrance-section">
       <strong>On-screen timing</strong>
       <p className="small-text">Position the playhead first. Entrance and exit clips are editable on the timeline.</p>
       <div className="actor-entrance-grid">
         <button type="button" onClick={()=>onPresence(actor.id,'walk-in')}><Footprints size={15}/> Walk in</button>
         <button type="button" onClick={()=>onPresence(actor.id,'run-in')}><Zap size={15}/> Run in</button>
         <button type="button" onClick={()=>onPresence(actor.id,'walk-out')}><Footprints size={15}/> Walk out</button>
         <button type="button" onClick={()=>onPresence(actor.id,'run-out')}><Zap size={15}/> Run out</button>
         <button type="button" onClick={()=>onPresence(actor.id,'show')}><Eye size={15}/> Show now</button>
         <button type="button" onClick={()=>onPresence(actor.id,'hide')}><EyeOff size={15}/> Hide now</button>
       </div>
     </div><p className="small-text">Movement clips automatically orient actors in their travel direction.</p><button className="quiet full" onClick={addAction}><Clapperboard size={15}/> Choose action</button><button className="quiet full" onClick={addDialogue}><AudioLines size={15}/> Add dialogue</button>{character && <button className="quiet full" onClick={() => editCharacter(character)}>Edit character</button>}</details>}
      {object && <details open><summary>Appearance</summary>
         <button type="button" className="flip-prop-button" aria-pressed={!!object.flip} onClick={()=>patchObject({...object,flip:!object.flip})}><FlipHorizontal size={16}/> Flip object horizontally</button>
        {object.imageData ? <>
          <MediaImage source={object.imageData} alt={object.name} className="inspector-image-preview"/>
          <label className="field">Interaction type<Select aria="Image prop interaction" value={object.interaction ?? 'none'}
            onChange={interaction => patchObject({ ...object, interaction })} options={['none', 'hold', 'sit'] as const}
            render={kind => kind === 'none' ? 'Decoration' : kind === 'sit' ? 'Seat · character can sit' : 'Holdable · character can carry'}/></label>
          <div className="field-row"><NumberField text="Width" min={10} max={800} value={object.imageWidth ?? 140} onChange={imageWidth => patchObject({ ...object, imageWidth })}/>
          <NumberField text="Height" min={10} max={800} value={object.imageHeight ?? 140} onChange={imageHeight => patchObject({ ...object, imageHeight })}/></div>
          <p className="small-text">Transparent edges stay transparent; props can be moved, scaled, and rotated.</p>
        </> : <label className="color-field">Prop color<input type="color" value={object.color} onChange={e => patchObject({ ...object, color: e.target.value })}/></label>}
        {anchors[object.kind] && <p className="small-text">Interaction anchor available for {anchors[object.kind]!.action === 'hold' ? 'holding' : `${anchors[object.kind]!.action} actions`}.</p>}
      </details>}
      {clip && <><details open><summary>Timing</summary><div className="field-row"><NumberField text="Start" value={clip.start} min={0} max={scene.duration - .1} step={.01} onChange={start => patchClip(changeClipTiming(clip, start, clip.length, scene.duration))}/><NumberField text="Length" value={clip.length} min={.1} max={scene.duration - clip.start} step={.01} onChange={length => patchClip(changeClipTiming(clip, clip.start, length, scene.duration))}/></div></details><details open><summary>{label(clip.track)} settings</summary>
        {'actor' in clip && <label className="field">Actor<Select aria="Clip actor" value={clip.actor} onChange={actor => patchClip({ ...clip, actor })} options={Object.keys(actors)} render={id => actors[id]}/></label>}
        {clip.track === 'movement' && <><button className="primary full" onClick={setDestination}>Set destination on stage</button><div className="field-row"><NumberField text="From X" value={clip.fromX} min={-2000} max={3000} onChange={fromX => patchClip({ ...clip, fromX })}/><NumberField text="From Y" value={clip.fromY} min={-2000} max={3000} onChange={fromY => patchClip({ ...clip, fromY })}/></div><div className="field-row"><NumberField text="To X" value={clip.toX} min={-2000} max={3000} onChange={toX => patchClip({ ...clip, toX })}/><NumberField text="To Y" value={clip.toY} min={-2000} max={3000} onChange={toY => patchClip({ ...clip, toY })}/></div></>}
        {clip.track === 'actors' && clip.visible !== undefined && <label className="check"><input type="checkbox" checked={clip.visible} onChange={event => patchClip({ ...clip, visible: event.target.checked })}/>Visible from this cue</label>}
        {clip.track === 'gaze' && <label className="field">Look at<Select aria="Timeline gaze target" value={clip.target} options={['camera', ...Object.keys(actors).filter(id => id !== clip.actor), ...scene.objects.map(item => item.id)]}
          onChange={target => patchClip({ ...clip, target })} render={id => actors[id] ?? scene.objects.find(item => item.id === id)?.name ?? label(id)}/></label>}
        {clip.track === 'props' && <>
          <label className="field">Prop<Select aria="Timeline prop" value={clip.target} options={scene.objects.filter(item => ['hold','open'].includes(anchorFor(item)?.action??'')).map(item => item.id)}
            onChange={target => patchClip({ ...clip, target })} render={id => scene.objects.find(item => item.id === id)?.name ?? label(id)}/></label>
          <label className="field">Interaction<Select aria="Timeline prop interaction" value={clip.interaction} options={scene.objects.find(item=>item.id===clip.target)?.kind==='door'?['open','close']:['equip', 'release']} onChange={interaction => patchClip({ ...clip, interaction })}/></label>
        </>}
        {clip.track === 'body' && <><label className="field">Action<Select aria="Clip action" value={clip.action} onChange={action => patchClip({ ...clip, action })} options={actions}/></label><label className="field">Layer<Select aria="Action layer" value={clip.action === 'sit' ? 'body' : clip.layer} onChange={layer => patchClip({ ...clip, layer })} options={clip.action === 'sit' ? ['body'] as const : ['body', 'gesture'] as const}/></label>
          {clip.action === 'sit' && !compatibleObjects(scene, 'sit').length && <p className="form-error">Add a chair or sofa before using the Sit action.</p>}
          <label className="field">{clip.action === 'sit' ? 'Seat' : 'Interact with'}<Select aria="Interaction target" value={clip.target ?? ''} onChange={value => { const { target: _, ...rest } = clip; patchClip(value ? { ...rest, target: value } : rest); }}
          options={clip.action === 'sit' ? compatibleObjects(scene, clip.action).map(item => item.id) : ['', ...compatibleObjects(scene, clip.action).map(item => item.id)]}
          render={id => scene.objects.find(item => item.id === id)?.name ?? 'Empty hands'}/></label></>}
        {clip.track === 'face' && <label className="field">Expression<Select aria="Clip expression" value={clip.expression} onChange={expression => patchClip({ ...clip, expression })} options={expressions}/></label>}
        {(clip.track === 'dialogue' || clip.track === 'audio' || clip.track === 'music') && <><NumberField text="Volume" value={clip.volume} min={0} max={2} step={.05} onChange={volume => patchClip({ ...clip, volume })}/>
        <NumberField text="Audio offset" value={clip.offset} min={0} max={180} step={.01} onChange={offset => patchClip({ ...clip, offset })}/>
        <div className="field-row"><NumberField text="Fade in (s)" value={clip.fadeIn??0} min={0} max={clip.length} step={.05} onChange={fadeIn=>patchClip({...clip,fadeIn})}/>
          <NumberField text="Fade out (s)" value={clip.fadeOut??0} min={0} max={clip.length} step={.05} onChange={fadeOut=>patchClip({...clip,fadeOut})}/></div>
        {clip.track!=='dialogue'&&<label className="check"><input type="checkbox" checked={!!clip.loop} onChange={event=>patchClip({...clip,loop:event.target.checked})}/> Loop audio throughout this clip</label>}
        <label className="check"><input type="checkbox" checked={clip.muted} onChange={e => patchClip({ ...clip, muted: e.target.checked })}/> Mute clip</label>
        {clip.track==='dialogue' && <VoiceClipControls key={clip.id} clip={clip} character={characters.find(character=>character.id===scene.actors.find(actor=>actor.id===clip.actor)?.characterId)} precision={precision} rerecord={rerecord} align={alignVoiceClip}/>}</>}
        {clip.track === 'camera' && <>
          <p className="small-text camera-inspector-hint">One active camera at a time. Extending or moving this shot trims and splits covered shots without affecting dialogue, movement or music.</p>
          <label className="field">Shot<Select aria="Camera shot" value={clip.shot} onChange={shot => patchClip({ ...clip, shot })} options={shots}/></label>
          <label className="field">Focus<Select aria="Camera focus" value={clip.focus ?? ''} onChange={value => { const { focus: _, ...rest } = clip; patchClip(value ? { ...rest, focus: value } : rest); }} options={['', ...Object.keys(actors)]} render={id => actors[id] ?? 'Automatic'}/></label>
          <label className="field">Transition<Select aria="Camera transition" value={clip.transition} onChange={transition => patchClip({ ...clip, transition })} options={['cut', 'glide']}/></label>
          <p className="small-text">Camera: {clip.start.toFixed(2)}s – {(clip.start + clip.length).toFixed(2)}s ({clip.length.toFixed(2)}s). {clip.transition === 'glide' ? 'Smooth glide from previous framing.' : 'Instant cut to this framing.'}</p>
        </>}
        {clip.track === 'transition' && <label className="field">Transition<Select aria="Scene transition" value={clip.effect} onChange={effect => patchClip({ ...clip, effect })} options={['fade-in', 'fade-out']}/></label>}
      </details></>}
      {object && objectDependencies(scene, object.id, actors).length > 0 && <p className="small-text" role="status">This object supports {objectDependencies(scene, object.id, actors).length} timeline action(s). Deleting it will let you choose replacements.</p>}
      <div className="inspector-actions"><button className="quiet" onClick={duplicate}><Copy size={14}/> Duplicate</button><IconButton title="Delete selection" onClick={remove}><Trash2 size={16}/></IconButton></div>
    </> : <>
      <div className="inspector-card"><div className="inspector-emblem"><Clapperboard size={21}/></div><div><strong>{scene.environment}</strong><small>Scene {String(sceneIndex + 1).padStart(2, '0')} of {String(scenes).padStart(2, '0')}</small></div></div>
      <details open><summary>Scene settings</summary><label className="field">Scene name<input aria-label="Scene name" key={scene.name} defaultValue={scene.name} maxLength={70} onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== scene.name) patchScene({ name: e.target.value.trim() }); }}/></label><NumberField text="Duration (s)" value={scene.duration} min={1} max={180} step={.1} onChange={duration => patchScene(resizeSceneTimeline(scene, duration))}/></details>
      {scene.backgroundImage&&<details><summary>Background framing</summary><NumberField text="Background X" min={-2000} max={3000} value={scene.backgroundTransform?.x??0} onChange={x=>patchScene({backgroundTransform:{x,y:scene.backgroundTransform?.y??0,scale:scene.backgroundTransform?.scale??1}})}/><NumberField text="Background Y" min={-2000} max={3000} value={scene.backgroundTransform?.y??0} onChange={y=>patchScene({backgroundTransform:{y,x:scene.backgroundTransform?.x??0,scale:scene.backgroundTransform?.scale??1}})}/><NumberField text="Background scale" min={.2} max={4} step={.05} value={scene.backgroundTransform?.scale??1} onChange={scale=>patchScene({backgroundTransform:{scale,x:scene.backgroundTransform?.x??0,y:scene.backgroundTransform?.y??0}})}/></details>}
      <details open><summary>Scene layers <span className="inspector-count">{scene.actors.length + scene.objects.length}</span></summary><div className="layer-list">{scene.actors.map(item => <button key={item.id} onClick={() => select({ kind: 'actor', id: item.id })}><UserRound size={14}/>{actors[item.id]}<span>Actor</span></button>)}{scene.objects.map(item => { const Item = propIcon[item.kind]; return <button key={item.id} onClick={() => select({ kind: 'object', id: item.id })}><Item size={14}/>{item.name}<span>Prop</span></button>; })}{!scene.actors.length && !scene.objects.length && <p className="empty-small">Add actors and props from the library.</p>}</div></details>
      <details><summary>Preview settings <Settings2 size={13}/></summary><label className="check"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)}/> Snap to grid</label><label className="check"><input type="checkbox" checked={subtitles} onChange={e => setSubtitles(e.target.checked)}/> Subtitles</label><label className="check"><input type="checkbox" checked={quality} onChange={e => setQuality(e.target.checked)}/> Full preview resolution</label></details>
      <button className="quiet full manage-scenes" onClick={openScenes}><Layers3 size={15}/> Manage scenes<Plus size={14}/></button>
    </>}
    </div>
  </aside>;
}
