import { useEffect, useState } from 'react';
import { evaluate } from '../engine/evaluate.ts';
import { type LayerMove } from '../engine/sceneLayers.ts';
import { SceneLayers } from './SceneLayers.tsx';
import { usesSeat, gaitStyles, gaitStyleNames, transitionNames, vfxNames } from '../engine/performanceCatalog.ts';
import { MediaImage } from './MediaImage.tsx';
import { AudioLines, Clapperboard, Copy, Layers3, Plus, Settings2, SlidersHorizontal, Trash2, UserRound, ArrowLeft, ArrowRight, FlipHorizontal, Footprints, Zap, Eye, EyeOff } from 'lucide-react';
import { actingIntents, actions, expressions, label, shotCompositions, shotLabel, cameraAngles, cameraMovements, views, type ActorData, type Character, type Clip, type Prop, type Scene } from '../engine/schema.ts';
import { anchorFor, compatibleObjects, objectDependencies } from '../engine/interactions.ts';
import { anchors } from '../engine/presets.ts';
import { Avatar, clipLabel, IconButton, NumberField, propIcon, Select, trackIcon } from './shared.tsx';
import { CameraShotSelect, cameraDirectionHint } from './CameraShotSelect.tsx';
import { changeClipTiming, type Selection } from '../studio.ts';
import { resizeSceneTimeline } from '../engine/timelineEditing.ts';
import { SoundClipEditor } from './SoundClipEditor.tsx';
import { VoiceClipControls } from './VoiceClipControls.tsx';

export function Inspector({ onPresence, scene, actors, characters, selection, select, patchActor, patchObject, patchClip, patchScene, editCharacter, addDialogue, addAction, scenes, sceneIndex, openScenes, remove, duplicate, snap, setSnap, subtitles, setSubtitles, quality, setQuality, setDestination, previewPath, onWalk, onRecover, onOverlay, onLanding, onLayer, onUseProp, getPlayhead, precision, rerecord, regenerateVoice, restoreVoiceVersion, alignVoiceClip }: {
  onPresence:(id:string,action:'walk-in'|'run-in'|'walk-out'|'run-out'|'show'|'hide')=>void;
  onLayer:(id:string,move:LayerMove)=>void; onUseProp:(id:string)=>void; onLanding:(clip:Extract<Clip,{track:'body'}>)=>void;
  previewPath:()=>void;onWalk:(id:string)=>void;onRecover:(id:string)=>void;onOverlay:(id:string)=>void;getPlayhead:()=>number;
  scene: Scene; actors: Record<string, string>; characters: Character[]; selection: Selection; select: (value: Selection) => void;
  patchActor: (actor: ActorData) => void; patchObject: (object: Prop) => void; patchClip: (clip: Clip) => void; patchScene: (patch: Partial<Scene>) => void;
  editCharacter: (character: Character) => void; addDialogue: () => void; addAction: () => void; scenes: number; sceneIndex: number; openScenes: () => void; remove: () => void; duplicate: () => void;
  snap: boolean; setSnap: (value: boolean) => void; subtitles: boolean; setSubtitles: (value: boolean) => void; quality: boolean; setQuality: (value: boolean) => void; setDestination?: () => void; precision?: () => void; rerecord?: () => void; regenerateVoice?: (clip: Extract<Clip, {track: 'dialogue'}>, text: string, voice: string, force?:boolean) => Promise<string>;
  restoreVoiceVersion?: (clip: Extract<Clip, {track:'dialogue'}>, index:number)=>Promise<string>;
  alignVoiceClip: (clip: Extract<Clip,{track:'dialogue'}>, recognizer:'pocketSphinx'|'phonetic')=>Promise<string>;
}) {
  const actor = scene.actors.find(item => item.id === selection?.id);
  const [actorStatus,setActorStatus]=useState('');
  useEffect(()=>{
    if(!actor)return;
    const update=()=>{
      const frame=evaluate(scene,getPlayhead()).actors.find(item=>item.id===actor.id);
      setActorStatus(!frame?.visible?'Hidden at the playhead':frame.x<0||frame.x>960||frame.y<0||frame.y>540?'Offstage at the playhead':'');
    };
    update();
    window.addEventListener('toonroom-seek',update);
    return ()=>window.removeEventListener('toonroom-seek',update);
  },[actor,scene,getPlayhead]);
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
      {object&&anchorFor(object)?.action==='hold'&&<button type="button" className="primary full" onClick={()=>onUseProp(object.id)}>Use prop in an action</button>}
      <SceneLayers scene={scene} names={actors} select={select} selection={selection} move={onLayer} open={!clip}/>
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
       {actorStatus&&<p className="small-text" role="status">{actorStatus}</p>}
       <div className="actor-entrance-grid">
         <button type="button" onClick={()=>onWalk(actor.id)}><Footprints size={15}/> Draw walk path</button>
         <button type="button" onClick={()=>onRecover(actor.id)}><Eye size={15}/> Bring on stage</button>
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
        {((clip.track==='props'&&['equip','release'].includes(clip.interaction))||
          (clip.track==='body'&&['pick-up','put-down','throw-prop','eat','drink','write','read','phone-call'].includes(clip.action)))&&
          <label className="field">Holding hand
            <Select aria="Holding hand" value={clip.hand??'right'} options={['right','left'] as const}
              render={hand=>hand==='right'?'Right hand':'Left hand'}
              onChange={hand=>patchClip({...clip,hand})}/>
          </label>}
        {clip.track === 'movement' && <>
          <button className="primary full" onClick={setDestination}>Edit path on stage</button>
          <button className="quiet full" onClick={previewPath}>Preview path</button>
          <label className="field">Pace<Select aria="Path pace" value={clip.gait??'walk'} options={['walk','run']} onChange={gait=>patchClip({...clip,gait})}/></label>
          <label className="field">Style<Select aria="Path style" value={clip.style??'natural'} options={gaitStyles} render={style=>gaitStyleNames[style]} onChange={style=>patchClip({...clip,style})}/></label>
        </>}
        {clip.track==='vfx'&&<>
          <label className="field">Effect<Select aria="Visual effect" value={clip.effect} options={vfxNames} onChange={effect=>patchClip({...clip,effect})}/></label>
          <NumberField text="Strength" value={clip.strength} min={.1} max={2} step={.05} onChange={strength=>patchClip({...clip,strength})}/>
          {clip.effect!=='camera-shake'&&<button className="primary full" onClick={()=>onOverlay(clip.id)}>Place effect on stage</button>}
        </>}
        {clip.track==='text'&&<>
          <label className="field">Text<textarea key={clip.id+'/'+clip.text} defaultValue={clip.text} aria-label="Edit on-screen text" rows={3} maxLength={180}
            onBlur={event=>{const text=event.currentTarget.value.trim();if(text&&text!==clip.text)patchClip({...clip,text});else event.currentTarget.value=clip.text;}}/></label>
          <label className="field">Text style<Select aria="Text style" value={clip.style} options={['title','caption','comic']} onChange={style=>patchClip({...clip,style})}/></label>
          <label className="field">Color<input aria-label="Text color" type="color" value={clip.color} onChange={event=>patchClip({...clip,color:event.currentTarget.value})}/></label>
          <NumberField text="Size" value={clip.size} min={12} max={120} step={1} onChange={size=>patchClip({...clip,size})}/>
          <button className="primary full" onClick={()=>onOverlay(clip.id)}>Place text on stage</button>
        </>}
        {clip.track === 'actors' && clip.visible !== undefined && <label className="check"><input type="checkbox" checked={clip.visible} onChange={event => patchClip({ ...clip, visible: event.target.checked })}/>Visible from this cue</label>}
        {clip.track === 'gaze' && <label className="field">Look at<Select aria="Timeline gaze target" value={clip.target} options={['camera', ...Object.keys(actors).filter(id => id !== clip.actor), ...scene.objects.map(item => item.id)]}
          onChange={target => patchClip({ ...clip, target })} render={id => actors[id] ?? scene.objects.find(item => item.id === id)?.name ?? label(id)}/></label>}
        {clip.track === 'props' && <>
          <label className="field">Prop<Select aria="Timeline prop" value={clip.target} options={scene.objects.filter(item => ['hold','open'].includes(anchorFor(item)?.action??'')).map(item => item.id)}
            onChange={target => patchClip({ ...clip, target })} render={id => scene.objects.find(item => item.id === id)?.name ?? label(id)}/></label>
          <label className="field">Interaction<Select aria="Timeline prop interaction" value={clip.interaction} options={scene.objects.find(item=>item.id===clip.target)?.kind==='door'?['open','close']:['equip', 'release']} onChange={interaction => patchClip({ ...clip, interaction })}/></label>
        </>}
        {clip.track === 'body' && <><label className="field">Action<Select aria="Clip action" value={clip.action} onChange={action => patchClip({ ...clip, action })} options={actions}/></label><label className="field">Layer<Select aria="Action layer" value={usesSeat(clip.action) ? 'body' : clip.layer} onChange={layer => patchClip({ ...clip, layer })} options={usesSeat(clip.action) ? ['body'] as const : ['body', 'gesture'] as const}/></label>
          {clip.action==='sit'&&<p className="small-text">Sit in place. Selecting a seat is optional and never moves your actor automatically.</p>}
          <label className="field">{usesSeat(clip.action) ? 'Seat' : 'Interact with'}<Select aria="Interaction target" value={clip.target ?? ''} onChange={value => { const { target: _, ...rest } = clip; patchClip(value ? { ...rest, target: value } : rest); }}
          options={['', ...compatibleObjects(scene, clip.action).map(item => item.id)]}
          render={id => id==='' ? usesSeat(clip.action)?'Keep current position':'No object' : scene.objects.find(item => item.id === id)?.name ?? 'No object'}/></label></>}
        {clip.track==='body'&&clip.action==='throw-prop'&&clip.target&&<button type="button" className="quiet full" onClick={()=>onLanding(clip)}>Set landing point on stage</button>}
        {clip.track === 'performance' && <>
          <label className="field">Take name<input aria-label="Performance take name" key={clip.id+'/'+clip.name} defaultValue={clip.name??'Performance take'} maxLength={72}
            onBlur={event=>{const name=event.currentTarget.value.trim().slice(0,72)||'Performance take';if(name!==clip.name)patchClip({...clip,name});}}/></label>
          <label className="field">Facing for this take
            <Select aria="Performance facing direction" value={clip.facing??'inherit'}
              options={['inherit','front','left','right'] as const}
              onChange={value=>{
                if(value==='inherit'){
                  const {facing: _previous, ...unchanged}=clip;
                  patchClip(unchanged);
                } else patchClip({...clip,facing:value});
              }}
              render={value=>value==='inherit'?'Use actor facing':value==='front'?'Front · camera':
                value==='left'?'¾ Front Left':'¾ Front Right'}/>
          </label>
          <div className="performance-summary">
            <strong>{clip.performance.length} editable pose keys</strong>
            <span>{clip.performanceOrigin==='mocap'?'Recorded with webcam':'Authored performance'} · body and hand movement{clip.performance.some(key=>!!key.facial)?' · facial controls':''}</span>
          </div>
          <p className="small-text">Move, trim, split, duplicate or copy this take like any other timeline clip. Its captured poses stay retimed with the clip.</p>
        </>}
        {clip.track === 'face' && <><label className="field">Expression<Select aria="Clip expression" value={clip.expression} onChange={expression => patchClip({ ...clip, expression })} options={expressions}/></label>
          <label className="field">Acting intention<Select aria="Acting intention" value={clip.intent??'none'} onChange={intent=>patchClip({...clip,intent})} options={actingIntents}/></label>
          <NumberField text="Acting intensity" value={clip.intensity??1} min={0} max={1.5} step={.05} onChange={intensity=>patchClip({...clip,intensity})}/>
          <details><summary>Emotion mixer</summary><div className="field-row">
            <NumberField text="Mood -/+" value={clip.emotion?.valence??0} min={-1} max={1} step={.1} onChange={valence=>patchClip({...clip,emotion:{...clip.emotion,valence}})}/>
            <NumberField text="Energy" value={clip.emotion?.arousal??.5} min={0} max={1} step={.1} onChange={arousal=>patchClip({...clip,emotion:{...clip.emotion,arousal}})}/>
          </div><div className="field-row">
            <NumberField text="Confidence" value={clip.emotion?.dominance??.5} min={0} max={1} step={.1} onChange={dominance=>patchClip({...clip,emotion:{...clip.emotion,dominance}})}/>
            <NumberField text="Tension" value={clip.emotion?.tension??.2} min={0} max={1} step={.1} onChange={tension=>patchClip({...clip,emotion:{...clip.emotion,tension}})}/>
          </div></details>
          <p className="small-text">Subtle at 0.35 · Natural at 1 · Exaggerated at 1.5. Expression edits remain timeline-based.</p></>}
        {(clip.track==='dialogue'||clip.track==='audio'||clip.track==='music')&&
          <SoundClipEditor key={'audio/'+clip.id} clip={clip} change={patchClip} locked={!!scene.trackSettings?.[clip.track]?.locked}/>}
        {clip.track==='dialogue'&&<VoiceClipControls key={'voice/'+clip.id} clip={clip} character={characters.find(character=>character.id===scene.actors.find(actor=>actor.id===clip.actor)?.characterId)} precision={precision} rerecord={rerecord} align={alignVoiceClip}/>}
        {clip.track === 'camera' && <div className="camera-direction-fields">
          <p className="small-text camera-inspector-hint">One camera at a time. Choose framing, target, angle and motion independently. Existing timeline trims and cuts remain non-destructive.</p>
          <label className="field">Shot size / classic preset
            <CameraShotSelect value={clip.shot} onChange={shot=>patchClip({...clip,shot})}/>
          </label>
          <label className="field">Subject framing / perspective
            <Select aria="Camera subject composition" value={clip.composition??'none'}
              onChange={value=>{
                const {composition:_old,...rest}=clip;
                patchClip(value==='none'?rest:{...rest,composition:value});
              }}
              options={['none',...shotCompositions] as const}
              render={value=>value==='none'?'None · use shot size':shotLabel(value)}/>
          </label>
          <label className="field">Focus · actor or prop
            <Select aria="Camera focus" value={clip.focus ?? ''}
              onChange={value=>{
                const {focus: _old,...rest}=clip;
                patchClip(value?{...rest,focus:value}:rest);
              }}
              options={['',...Object.keys(actors),...scene.objects.map(prop=>prop.id)]}
              render={id=>actors[id]??scene.objects.find(prop=>prop.id===id)?.name??'Automatic'}/>
          </label>
          <div className="field-row">
            <label className="field">Camera angle
              <Select aria="Camera angle" value={clip.angle??'eye-level'}
                onChange={angle=>{
                  const {angle:_old,...rest}=clip;
                  patchClip(angle==='eye-level'?rest:{...rest,angle});
                }} options={cameraAngles}/>
            </label>
            <label className="field">Camera movement
              <Select aria="Camera movement" value={clip.movement??'none'}
                onChange={movement=>{
                  const {movement:_old,strength:_strength,...rest}=clip;
                  patchClip(movement==='none'?rest:{...rest,movement,strength:clip.strength??1});
                }} options={cameraMovements}/>
            </label>
          </div>
          <NumberField text="Film camera zoom multiplier" value={clip.zoomMultiplier??1}
            min={.5} max={8} step={.25}
            onChange={zoomMultiplier=>patchClip({...clip,zoomMultiplier})}/>
          <p className="small-text">Use up to 8× additional zoom for extreme close-ups. This affects the movie; the canvas zoom controls only affect editing.</p>
          {clip.movement&&clip.movement!=='none'&&
            <NumberField text="Movement intensity" value={clip.strength??1}
              min={.25} max={2.5} step={.25}
              onChange={strength=>patchClip({...clip,strength})}/>}
          {clip.angle==='dutch-angle'&&
            <NumberField text="Dutch tilt (°)" value={clip.roll??12}
              min={-30} max={30} step={1}
              onChange={roll=>patchClip({...clip,roll})}/>}
          <label className="field">Transition
            <Select aria="Camera transition" value={clip.transition}
              onChange={transition=>patchClip({...clip,transition})} options={['cut','glide']}/>
          </label>
          <p className="camera-direction-hint">{cameraDirectionHint(clip.shot,clip.angle??'eye-level',clip.movement??'none',clip.composition)}</p>
          <p className="small-text">Camera: {clip.start.toFixed(2)}–{(clip.start+clip.length).toFixed(2)}s · {clip.transition==='glide'?'Smooth glide':'Instant cut'}.</p>
        </div>}
        {clip.track === 'transition' && <label className="field">Transition<Select aria="Scene transition" value={clip.effect} onChange={effect => patchClip({ ...clip, effect })} options={transitionNames}/></label>}
      </details></>}
      {object && objectDependencies(scene, object.id, actors).length > 0 && <p className="small-text" role="status">This object supports {objectDependencies(scene, object.id, actors).length} timeline action(s). Deleting it will let you choose replacements.</p>}
      <div className="inspector-actions"><button className="quiet" onClick={duplicate}><Copy size={14}/> Duplicate</button><IconButton title="Delete selection" onClick={remove}><Trash2 size={16}/></IconButton></div>
    </> : <>
      <div className="inspector-card"><div className="inspector-emblem"><Clapperboard size={21}/></div><div><strong>{scene.environment}</strong><small>Scene {String(sceneIndex + 1).padStart(2, '0')} of {String(scenes).padStart(2, '0')}</small></div></div>
      <details open><summary>Scene settings</summary><label className="field">Scene name<input aria-label="Scene name" key={scene.name} defaultValue={scene.name} maxLength={70} onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== scene.name) patchScene({ name: e.target.value.trim() }); }}/></label><NumberField text="Duration (s)" value={scene.duration} min={1} max={180} step={.1} onChange={duration => patchScene(resizeSceneTimeline(scene, duration))}/></details>
      {scene.backgroundImage&&<details><summary>Background framing</summary><NumberField text="Background X" min={-2000} max={3000} value={scene.backgroundTransform?.x??0} onChange={x=>patchScene({backgroundTransform:{x,y:scene.backgroundTransform?.y??0,scale:scene.backgroundTransform?.scale??1}})}/><NumberField text="Background Y" min={-2000} max={3000} value={scene.backgroundTransform?.y??0} onChange={y=>patchScene({backgroundTransform:{y,x:scene.backgroundTransform?.x??0,scale:scene.backgroundTransform?.scale??1}})}/><NumberField text="Background scale" min={.2} max={4} step={.05} value={scene.backgroundTransform?.scale??1} onChange={scale=>patchScene({backgroundTransform:{scale,x:scene.backgroundTransform?.x??0,y:scene.backgroundTransform?.y??0}})}/></details>}
      <SceneLayers scene={scene} names={actors} select={select} selection={selection} move={onLayer}/>
      <details><summary>Preview settings <Settings2 size={13}/></summary><label className="check"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)}/> Snap to grid</label><label className="check"><input type="checkbox" checked={subtitles} onChange={e => setSubtitles(e.target.checked)}/> Subtitles</label><label className="check"><input type="checkbox" checked={quality} onChange={e => setQuality(e.target.checked)}/> Full preview resolution</label></details>
      <button className="quiet full manage-scenes" onClick={openScenes}><Layers3 size={15}/> Manage scenes<Plus size={14}/></button>
    </>}
    </div>
  </aside>;
}
