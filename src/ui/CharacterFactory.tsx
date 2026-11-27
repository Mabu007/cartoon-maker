import {bodyProfiles} from '../engine/visualAssets.ts';
import {PerformanceStudio} from './PerformanceStudio.tsx';
import type {Clip} from '../engine/schema.ts';
import {useReducer,useCallback,useMemo,type SetStateAction} from 'react';
import {draftHistory,startDraft,characterAudition,randomizeWorkspace,type PreviewPhysics} from '../engine/characterWorkspace.ts';
import {characterIdentity} from '../engine/characterIdentity.ts';
import {CharacterSecondaryControls} from './SecondaryMotionControls.tsx';
import {flagshipCharacters,applyProfile} from '../engine/visualPresets.ts';
import {CharacterDefinition} from '../engine/schema.ts';
import {CharacterIdentityPanel} from './CharacterIdentityPanel.tsx';
import {duplicateCharacterIdentity} from '../engine/characterIdentity.ts';
import { CharacterVisualStudio } from './CharacterVisualStudio.tsx';
import { useEffect, useRef, useState } from 'react';
import { Copy, Maximize2, Minus, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { armBuilds, bodyFrames, legBuilds } from '../engine/bodyBuild.ts';
import { createRenderer } from '../engine/renderer.ts';
import { animations } from '../engine/animation.ts';
import { conversationAudition } from '../engine/dialogueGestures.ts';
import { resolvePersonality, traitDefaults, type Trait } from '../engine/livingCharacter.ts';
import { fitCharacterPreview } from '../engine/previewLayout.ts';
import { CharacterChoices } from './CharacterChoices.tsx';
import { NativeCharacterPreview } from './NativeCharacterPreview.tsx';
import { actions, expressions, label, uid, views, personalityPresets, signatureMannerisms, type Action, type Character, type Expression, type Scene, type View } from '../engine/schema.ts';
import { characters } from '../engine/presets.ts';
import { visemeNames, type Viseme } from '../engine/visemes.ts';
import { Avatar, IconButton, Modal, Select } from './shared.tsx';

const sliders = { height: 'Height', head: 'Head size', thickness: 'Build', torso: 'Torso length', arms: 'Arm length', legs: 'Leg length', eyeSpacing: 'Eye spacing' } as const;
const skinTones = ['#f2c49b', '#d89b70', '#b97550', '#925b40', '#76452f', '#503123'];
const sections = ['Identity','Body','Face','Eyes','Brows','Nose','Mouth','Ears','Hair','Facial hair','Garments','Footwear','Accessories','Personality','Voice','Physics','Advanced art'] as const;
const presets=[...flagshipCharacters,...characters];
const personalityLabels:Record<Trait,string>={confidence:'Confidence',expressiveness:'Expressiveness',energy:'Energy',sociability:'Sociability',nervousness:'Nervousness',aggressiveness:'Aggressiveness',playfulness:'Playfulness',patience:'Patience',restlessness:'Restlessness',emotionalReactivity:'Emotional reactivity',gestureFrequency:'Gesture frequency',gestureAmplitude:'Gesture size',movementSpeed:'Movement speed',postureOpenness:'Posture openness',eyeContact:'Eye contact',personalSpace:'Personal space',reactionIntensity:'Reaction intensity',movementSmoothness:'Movement smoothness',breathingAmplitude:'Breathing amplitude',breathingRate:'Breathing rate',idleTiming:'Idle adjustment frequency',blinkFrequency:'Blink frequency',headOrientation:'Head orientation',responseTendency:'Listening responses'};
const highImpactTraits:Trait[]=['confidence','expressiveness','energy','nervousness','gestureFrequency','gestureAmplitude','postureOpenness','eyeContact'];
const viewLabels: Record<View, string> = { front: 'Front', 'three-quarter': '¾ Front', side: 'Side', 'back-quarter': '¾ Back', back: 'Back' };
export function CharacterFactory({ source, save, close, remove }: { source?: Character; save: (value: Character) => void; close: () => void; remove: (id: string) => void }) {
  const [initial]=useState<Character>(()=>source??{...structuredClone(flagshipCharacters[0]??characters[0]),id:uid(),name:'New character'});
  const [history,dispatch]=useReducer(draftHistory,initial,startDraft),draft=history.present;
  const setDraft=useCallback((update:SetStateAction<Character>,key?:string)=>dispatch({type:'edit',update,key,time:performance.now()}),[]);
  const [playing,setPlaying]=useState(false),[physics,setPhysics]=useState<PreviewPhysics>('off'),[wind,setWind]=useState(0),[pan,setPan]=useState({x:0,y:0}),[status,setStatus]=useState('');
  const [captureOpen,setCaptureOpen]=useState(false),[take,setTake]=useState<Clip[]>([]);
  const drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
  const [section, setSection] = useState<typeof sections[number]>('Identity'), [view, setView] = useState<View>('three-quarter');
  const [action, setAction] = useState<Action>('idle'), [expression, setExpression] = useState<Expression>('neutral');
  const [look, setLook] = useState<'auto'|'camera'|'left'|'right'|'up'>('auto');
  const [mouthTest,setMouthTest]=useState<'auto'|Viseme>('auto');
  const [flip, setFlip] = useState(false), [scale, setScale] = useState(1), [fallback, setFallback] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [advancedPersonality,setAdvancedPersonality]=useState(false);
  const [tooth,setTooth]=useState(0);
  const canvas = useRef<HTMLDivElement>(null);
  const audition=useMemo(()=>characterAudition(draft,action,expression,view,flip,physics,wind,take),[draft,action,expression,view,flip,physics,wind,take]);
  const frame=useRef({draft,action,look,mouthTest,audition,playing});
  frame.current={draft,action,look,mouthTest,audition,playing};
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
      let previous=-1,lastFrame:typeof frame.current|undefined,elapsed=0,lastNow=performance.now(),lastAction:Action|undefined;
      const animate=(now:number)=>{
        const current=frame.current,{draft,action,look,mouthTest,audition,playing}=current;
        if(lastAction!==action||lastFrame&&lastFrame.audition.span!==audition.span){elapsed=0;lastAction=action;previous=-1;}
        const dt=Math.min(.1,Math.max(0,(now-lastNow)/1000));lastNow=now;
        if(playing&&!document.hidden)elapsed=(elapsed+dt)%audition.span;
        const time=Math.min(elapsed,Math.max(0,audition.span-.001)),changed=!lastFrame||lastFrame.audition!==audition||lastFrame.look!==look||lastFrame.mouthTest!==mouthTest||lastFrame.playing!==playing;
        if(!document.hidden&&(changed||playing&&Math.floor(time*20)!==previous)){
          previous=Math.floor(time*20);lastFrame=current;
          const gaze = look === 'auto' ? undefined : look === 'camera' ? { x: 0, y: 0 } :
            look === 'left' ? { x: -.95, y: 0 } : look === 'right' ? { x: .95, y: 0 } : { x: 0, y: -.95 };
          try {
            renderer.draw(audition.scene,[draft],time,{characterPreview:true,previewFocus:gaze,previewCamera:look==='camera',
              previewViseme:mouthTest==='auto'?undefined:mouthTest});
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
  const update = <K extends keyof Character>(key: K, value: Character[K]) => setDraft(item => ({ ...item, [key]: value }),String(key));
  type Closet = NonNullable<Character['wardrobe']>;
  const updateCloset=<K extends keyof Closet>(key:K,value:Closet[K])=>setDraft(item=>({...item,wardrobe:{...item.wardrobe,[key]:value}}),'wardrobe.'+String(key));
  const updateBuild=<K extends keyof NonNullable<Character['bodyBuild']>>(key:K,value:NonNullable<Character['bodyBuild']>[K])=>
    setDraft(item=>({...item,bodyBuild:{...item.bodyBuild,[key]:value}}),'body.'+String(key));
  const updatePersonality = <K extends keyof NonNullable<Character['personality']>>(key:K,value:NonNullable<Character['personality']>[K])=>
    setDraft(current=>({...current,personality:{...current.personality,[key]:value}}),'personality.'+String(key));
  const activePersonality=resolvePersonality(draft.personality);
  const toothColors=Array.from({length:6},(_,index)=>draft.toothColors?.[index]??(draft.goldTeeth?.includes(index)?'#eac05c':'#fff4de'));

  return <Modal wide title={source ? 'Edit character' : 'Create character'} description="Pick a look, make it yours, and direct it from any angle." close={close}>
    <div className="factory-grid workspace-grid" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)){e.preventDefault();dispatch({type:e.shiftKey?'redo':'undo'});}}}><div className="factory-preview"><div className="workspace-preview-header"><strong>Character studio</strong><button type="button" aria-label={playing?'Pause audition':'Play audition'} onClick={()=>setPlaying(v=>!v)}>{playing?'Pause':'Play'}</button><span>{fallback?'SVG fallback · approximate':'Scene renderer'}</span></div><div className="factory-canvas workspace-canvas" aria-label="Character preview" tabIndex={0} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setPan(v=>({x:Math.max(-400,Math.min(400,v.x+(e.key==='ArrowLeft'?-16:e.key==='ArrowRight'?16:0))),y:Math.max(-400,Math.min(400,v.y+(e.key==='ArrowUp'?-16:e.key==='ArrowDown'?16:0)))}));}}} onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(d)setPan({x:Math.max(-400,Math.min(400,d.px+e.clientX-d.x)),y:Math.max(-400,Math.min(400,d.py+e.clientY-d.y))});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><div className="workspace-preview-transform" style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${scale})`}}>{fallback ? <NativeCharacterPreview frozenTime={playing?undefined:0} character={draft} view={view} action={action} expression={expression} flip={flip} scale={fitCharacterPreview(draft, 1.4, action).scale} focus={look === 'auto' ? undefined : look === 'camera' ? { x: 0, y: 0 } : look === 'left' ? { x: -.95, y: 0 } : look === 'right' ? { x: .95, y: 0 } : { x: 0, y: -.95 }} mouthTest={mouthTest==='auto'?undefined:mouthTest}/> : <div className="factory-renderer-mount" ref={canvas}/>}</div></div><div className="factory-zoom"><IconButton title="Fit entire character" onClick={() => {setScale(1);setPan({x:0,y:0});}}><Maximize2 size={15}/></IconButton><IconButton title="Mirror character" active={flip} onClick={() => setFlip(value => !value)}><RotateCcw size={15}/></IconButton><IconButton title="Zoom out character" onClick={() => setScale(n => Math.max(.6, n - .2))}><Minus size={15}/></IconButton><IconButton title="Zoom in character" onClick={() => setScale(n => Math.min(3, n + .2))}><Plus size={15}/></IconButton></div>
      <div className="segmented view-choice" aria-label="Character view">{views.map(item => <button key={item} className={view === item ? 'active' : ''} aria-pressed={view===item} onClick={() => setView(item)}>{viewLabels[item]}</button>)}</div>
      <div className="workspace-auditions" aria-label="Quick auditions">{(['idle','walk','run','sit','stand','talk','wave','turn'] as const).map(a=><button key={a} type="button" aria-pressed={action===a} onClick={()=>{setTake([]);setAction(a);setPlaying(true);}}>{label(a)}</button>)}</div><div className="field-row"><label>Preview action<Select aria="Preview action" value={action} onChange={a=>{setTake([]);setAction(a);}} options={actions}/></label><label>Expression<Select aria="Preview expression" value={expression} onChange={setExpression} options={expressions}/></label></div>
      <label className="field preview-eye-focus">Eye focus<Select aria="Preview eye focus" value={look} onChange={setLook} options={['auto','camera','left','right','up'] as const}
        render={value => value === 'auto' ? 'Natural · moving eyes' : value === 'camera' ? 'Eye contact · camera' : 'Look ' + value}/></label>
      <label className="field">Mouth rig audition
        <Select aria="Preview mouth shape" value={mouthTest} onChange={setMouthTest}
          options={['auto',...visemeNames] as const}
          render={value=>value==='auto'?'Automatic · speech/audio':value.toUpperCase()}/>
      </label>
      <button type="button" disabled={fallback} onClick={()=>{setPlaying(false);setCaptureOpen(true);}}>Open webcam audition</button>{take.length>0&&<button type="button" onClick={()=>setTake([])}>Clear temporary capture</button>}<p className="small-text">Camera starts only inside Performance Studio after explicit consent. Temporary motion takes are not saved to character DNA.</p><details className="factory-details"><summary>Audition physics</summary><label>Physics preview<select aria-label="Audition physics" value={physics} onChange={e=>setPhysics(e.target.value as PreviewPhysics)}><option value="off">Off</option><option value="subtle">Subtle</option><option value="expressive">Expressive</option></select></label><label>Wind <input type="range" aria-label="Audition wind" min={-80} max={80} value={wind} onChange={e=>setWind(Number(e.target.value))}/></label><button type="button" onClick={()=>{setPhysics('off');setWind(0);}}>Reset audition settings</button><p className="small-text">Preview only. No scene settings are saved.</p></details>
    </div><div className="factory-edit"><div className="workspace-history"><button type="button" disabled={!history.past.length} onClick={()=>dispatch({type:'undo'})}>Undo</button><button type="button" disabled={!history.future.length} onClick={()=>dispatch({type:'redo'})}>Redo</button><button type="button" onClick={()=>dispatch({type:'reset',value:initial})}>Reset draft</button></div><label className="field">Name<input aria-label="Character name" maxLength={60} value={draft.name} onChange={e => update('name', e.target.value)}/></label>

      <div className="segmented factory-categories workspace-categories" role="group" aria-label="Character sections">{sections.map(item=><button key={item} type="button" onClick={()=>setSection(item)} aria-pressed={item===section} className={item===section?'active':''}>{item}</button>)}</div>
      <h3 className="workspace-category-title">{section}</h3>
      {section==='Identity'&&<><CharacterIdentityPanel character={draft} change={setDraft}/><div className="factory-section-heading"><span>Start with a character</span><button type="button" className="surprise-button" onClick={()=>{try{setDraft(randomizeWorkspace(draft,(characterIdentity(draft).seed+1)>>>0));setStatus('Seeded identity applied');}catch(e){setStatus(String(e));}}}>Randomize unlocked</button></div><div className="preset-row" aria-label="Character presets">{presets.map(item=><button key={item.id} type="button" title={item.name} aria-label={`Use ${item.name} preset`} onClick={()=>setDraft({...structuredClone(item),id:draft.id,name:draft.name})}><Avatar character={item}/><span>{item.name}</span></button>)}</div></>}
      {section==='Advanced art'&&<CharacterVisualStudio character={draft} change={setDraft}/>}
      {section==='Physics'&&<CharacterSecondaryControls character={draft} change={value=>update('secondaryMotion',value)}/>}
      {section==='Voice'&&<><label className="field">Voice preset<Select aria="Voice preset" value={draft.voicePreset??'warm'} options={['warm','bright','deep'] as const} onChange={v=>update('voicePreset',v)}/></label><label className="field">Optional hosted voice ID<input aria-label="Hosted voice ID" value={draft.hostedVoiceId??''} maxLength={120} onChange={e=>update('hostedVoiceId',e.target.value||undefined)}/></label><p className="small-text">Voice choice is saved with the identity. Hosted synthesis is optional; imported or recorded audio still works offline.</p></>}
      <div className="factory-fields">
        {(section==='Hair'||section==='Facial hair'||section==='Face'||section==='Eyes'||section==='Brows'||section==='Nose'||section==='Mouth'||section==='Ears'||section==='Garments'||section==='Footwear'||section==='Accessories')&&<CharacterChoices key={section} section={section} character={draft} change={update} changeCloset={updateCloset}/>}
        {section === 'Personality' && <div className="factory-personality">
          <div className="factory-build-field"><strong>Personality preset</strong>
            <Select aria="Personality preset" value={activePersonality.preset} options={personalityPresets}
              onChange={preset=>setDraft(current=>({...current,personality:{
                preset,autoActing:current.personality?.autoActing??'full',signature:current.personality?.signature??'none',actingModel:current.personality?.actingModel,behaviorSeed:current.personality?.behaviorSeed
              }}))} render={value=>label(value)}/>
          </div>
          <label className="check"><input type="checkbox" checked={draft.personality?.actingModel==='coherent-v1'} onChange={e=>updatePersonality('actingModel',e.target.checked?'coherent-v1':undefined)}/> Coordinated procedural acting (experimental)</label>
          {draft.personality?.actingModel==='coherent-v1'&&<label>Default walk style<select value={draft.personality.walkStyle??'natural'} onChange={e=>updatePersonality('walkStyle',e.target.value as NonNullable<Character['personality']>['walkStyle'])}>{['natural','zombie','elder','kid','tsotsi','goofy','sneak','sprint'].map(style=><option key={style}>{style}</option>)}</select></label>}
          {draft.personality?.actingModel==='coherent-v1'&&<label>Behavior seed<input type="number" min={0} max={4294967295} step={1} value={draft.personality.behaviorSeed??0} onChange={e=>updatePersonality('behaviorSeed',Math.max(0,Math.min(4294967295,Math.floor(Number(e.target.value)||0))))}/></label>}
          <p className="small-text">A character's personality affects how they move, gesture and listen. Press Play on the preview to see it.</p>
          <div className="factory-build-field"><strong>Auto-acting</strong><div className="choice-pills" role="group" aria-label="Auto acting mode">
            {(['full','subtle','off'] as const).map(mode=><button type="button" key={mode}
              className={activePersonality.autoActing===mode?'selected':''} aria-pressed={activePersonality.autoActing===mode}
              onClick={()=>updatePersonality('autoActing',mode)}>{label(mode)}</button>)}
          </div></div>
          <label className="field">Signature mannerism
            <Select aria="Signature mannerism" value={activePersonality.signature} options={signatureMannerisms}
              onChange={value=>updatePersonality('signature',value)} render={value=>label(value)}/>
          </label>
          {(advancedPersonality?(Object.keys(traitDefaults) as Trait[]):highImpactTraits).map(key=>
            <label className="field slider" key={key}><span>{personalityLabels[key]} <small>{Math.round(activePersonality[key])}%</small></span>
              <input aria-label={personalityLabels[key]} type="range" min={0} max={100} step={1}
                value={activePersonality[key]} onChange={event=>updatePersonality(key,Number(event.currentTarget.value))}/>
            </label>)}
          <button type="button" className="advanced-toggle" aria-expanded={advancedPersonality}
            onClick={()=>setAdvancedPersonality(value=>!value)}>{advancedPersonality?'− Fewer personality controls':'+ All personality controls'}</button>
          <div className="field-row">
            <button className="quiet" type="button" onClick={()=>{setTake([]);setAction('talk');setExpression('neutral');setPlaying(true);}}>Preview conversation</button>
            <button className="quiet" type="button" onClick={()=>{setTake([]);setAction('walk');setExpression('neutral');setPlaying(true);}}>Preview walk</button>
          </div>
        </div>}
        {section === 'Body' && <><label>Body profile<select aria-label="Body profile" value={draft.visual?.profile??'average'} onChange={e=>setDraft(applyProfile(draft,e.target.value as NonNullable<Character['visual']>['profile']))}>{bodyProfiles.map(v=><option key={v}>{v}</option>)}</select></label><p className="small-text">Applying a body profile resets proportions and retains only compatible imported artwork. Undo restores the previous draft.</p>
          {([
            ['frame','Body type',bodyFrames],['arms','Arms / biceps',armBuilds],['legs','Leg build',legBuilds]
          ] as const).map(([id,label,options])=><div className="factory-build-field" key={id}>
            <strong>{label}</strong><div className="choice-pills" role="group" aria-label={label}>
              {options.map(value=><button type="button" key={value} aria-pressed={(draft.bodyBuild?.[id]??'regular')===value}
                className={(draft.bodyBuild?.[id]??'regular')===value?'selected':''}
                onClick={()=>updateBuild(id,value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}
            </div>
          </div>)}
          {([['chest','Chest fullness'],['hips','Hip and seat fullness']] as const).map(([id,label])=><label className="field slider" key={id}>{label}
            <input type="range" min={0} max={1} step={.01} value={draft.bodyBuild?.[id]??0} onChange={event=>updateBuild(id,Number(event.currentTarget.value))}/>
          </label>)}
          <label className="check"><input type="checkbox" checked={draft.bodyBuild?.abs??false} onChange={event=>updateBuild('abs',event.currentTarget.checked)}/> Six-pack definition in shirtless outfits</label>
          {(['height', 'head', 'thickness'] as const).map(id => <label className="field slider" key={id}>{sliders[id]}<input type="range" min={id === 'thickness' ? .65 : .75} max={id === 'head' ? 1.35 : id === 'thickness' ? 1.45 : 1.3} step={.01} value={draft[id]} onChange={e => update(id, Number(e.target.value))}/></label>)}
        </>}
        {section === 'Mouth' && <div className="factory-teeth-editor">
          <strong>Tooth color</strong>
          <div className="factory-teeth-row" role="group" aria-label="Select a tooth">
            {toothColors.map((color,index)=><button type="button" key={index} aria-pressed={tooth===index}
              aria-label={`Tooth ${index+1}`} title={draft.missingTeeth?.includes(index)?'Missing tooth':`Tooth ${index+1}`}
              style={{background:draft.missingTeeth?.includes(index)?undefined:color,color:'#2b2235'}}
              className={tooth===index?'is-selected':''} onClick={()=>{setTooth(index);setMouthTest('wide');}}>{index+1}</button>)}
          </div>
          <div className="field-row">
            <label>Color <input type="color" aria-label="Selected tooth color" value={toothColors[tooth]}
              onChange={e=>update('toothColors',toothColors.map((color,index)=>index===tooth?e.target.value:color))}/></label>
            <label className="check"><input type="checkbox" checked={draft.missingTeeth?.includes(tooth)??false}
              onChange={e=>update('missingTeeth',e.target.checked?[...(draft.missingTeeth??[]),tooth]:(draft.missingTeeth??[]).filter(index=>index!==tooth))}/> Missing tooth</label>
          </div>
          <label className="field slider">Tooth color intensity
            <input type="range" min="0" max="1" step=".01" value={draft.wardrobe?.teethIntensity??1}
              onChange={e=>updateCloset('teethIntensity',Number(e.target.value))}/>
          </label>
        </div>}
        {section === 'Mouth' && <div className="factory-mouth-rig-editor">
          <strong>Parametric SVG mouth rig</strong>
          <p className="small-text">Character-specific proportions. The visemes animate jaw opening, lip rounding and position, closure, teeth and tongue automatically.</p>
          {([
            ['width','Mouth width',.65,1.5],
            ['jawScale','Jaw opening',.6,1.5],
            ['roundness','Lip roundness',0,1],
            ['asymmetry','Mouth asymmetry',-1,1]
          ] as const).map(([key,name,min,max])=><label key={key} className="field slider">
            <span>{name} <small>{(draft.mouthRig?.[key]??({width:1,jawScale:1,roundness:.5,asymmetry:0})[key]).toFixed(2)}</small></span>
            <input aria-label={name} type="range" min={min} max={max} step={.01}
              value={draft.mouthRig?.[key]??({width:1,jawScale:1,roundness:.5,asymmetry:0})[key]}
              onChange={event=>setDraft(current=>({ ...current,mouthRig:{
                width:current.mouthRig?.width??1,jawScale:current.mouthRig?.jawScale??1,
                roundness:current.mouthRig?.roundness??.5,asymmetry:current.mouthRig?.asymmetry??0,
                [key]:Number(event.target.value)
              }}))}/>
          </label>)}
        </div>}
        {(section==='Identity'||section==='Body'||section==='Face')&&<div className="factory-skin"><span>Skin tone</span><div className="tone-swatches">{skinTones.map(tone => <button key={tone} type="button" className={draft.skin.toLowerCase() === tone ? 'selected' : ''} style={{ backgroundColor: tone }} title={tone} aria-label={`Skin tone ${tone}`} onClick={() => update('skin', tone)}/>)}</div><label className="custom-tone">Custom <input type="color" aria-label="Custom skin tone" value={draft.skin} onChange={e => update('skin', e.target.value)}/></label></div>}
        {(section === 'Eyes' || section === 'Body') && <><button type="button" className="advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>{advanced ? '− Hide advanced proportions' : '+ Advanced proportions'}</button>
        {advanced && <div className="factory-advanced">{(section === 'Eyes' ? ['eyeSpacing'] : ['torso', 'arms', 'legs']).map(key => { const id = key as keyof typeof sliders; return <label className="field slider" key={key}>{sliders[id]}<input type="range" min={id==='eyeSpacing'?.65:.75} max={id === 'eyeSpacing' ? 1.4 : 1.3} step={.01} value={draft[id]} onChange={event => update(id, Number(event.target.value))}/></label>; })}</div>}</>}
      </div>
    </div></div>
    {status&&<p role="status" className="small-text">{status}</p>}<footer className="modal-footer">{source && <><IconButton title="Delete character" onClick={() => remove(source.id)}><Trash2 size={17}/></IconButton><button className="quiet" disabled={!draft.name.trim()} onClick={() => {try{save(duplicateCharacterIdentity(draft,uid()));}catch(e){setStatus(e instanceof Error?e.message:'Invalid character');}}}><Copy size={16}/> Duplicate</button></>}<span className="spacer"/><button className="quiet" onClick={close}>Cancel</button><button className="primary" disabled={!draft.name.trim()} onClick={() => {const parsed=CharacterDefinition.safeParse({...draft,name:draft.name.trim()});if(parsed.success)save(parsed.data);else setStatus(parsed.error.issues[0]?.message??'Invalid character');}}><Save size={16}/> Save character</button></footer>
    {captureOpen&&<PerformanceStudio scene={{...audition.scene,duration:180,clips:[]}} characters={[draft]} selectedActor="preview" start={0} previewOnly close={()=>setCaptureOpen(false)} commit={async clips=>{setTake(clips.filter(c=>c.track==='performance'||c.track==='body'));setAction('idle');setPlaying(true);}} saveActingDNA={()=>{}}/>}
  </Modal>;
}
