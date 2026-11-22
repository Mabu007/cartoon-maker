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
const sections = ['Hair','Face','Outfit','Accessories','Body','Personality'] as const;
const personalityLabels:Record<Trait,string>={confidence:'Confidence',expressiveness:'Expressiveness',energy:'Energy',sociability:'Sociability',nervousness:'Nervousness',aggressiveness:'Aggressiveness',playfulness:'Playfulness',patience:'Patience',restlessness:'Restlessness',emotionalReactivity:'Emotional reactivity',gestureFrequency:'Gesture frequency',gestureAmplitude:'Gesture size',movementSpeed:'Movement speed',postureOpenness:'Posture openness',eyeContact:'Eye contact',personalSpace:'Personal space',reactionIntensity:'Reaction intensity',movementSmoothness:'Movement smoothness'};
const highImpactTraits:Trait[]=['confidence','expressiveness','energy','nervousness','gestureFrequency','gestureAmplitude','postureOpenness','eyeContact'];
const viewLabels: Record<View, string> = { front: 'Front', 'three-quarter': '¾ Front', side: 'Side', 'back-quarter': '¾ Back', back: 'Back' };
export function CharacterFactory({ source, save, close, remove }: { source?: Character; save: (value: Character) => void; close: () => void; remove: (id: string) => void }) {
  const [draft, setDraft] = useState<Character>(() => source ?? { ...characters[0], id: uid(), name: 'New character' });
  const [section, setSection] = useState<typeof sections[number]>('Hair'), [view, setView] = useState<View>('three-quarter');
  const [action, setAction] = useState<Action>('idle'), [expression, setExpression] = useState<Expression>('neutral');
  const [look, setLook] = useState<'auto'|'camera'|'left'|'right'|'up'>('auto');
  const [mouthTest,setMouthTest]=useState<'auto'|Viseme>('auto');
  const [flip, setFlip] = useState(false), [scale, setScale] = useState(1.4), [fallback, setFallback] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [advancedPersonality,setAdvancedPersonality]=useState(false);
  const [tooth,setTooth]=useState(0);
  const canvas = useRef<HTMLDivElement>(null);
  const frame = useRef({ draft, action, expression, view, flip, scale, look, mouthTest });
  frame.current = { draft, action, expression, view, flip, scale, look, mouthTest };
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
        const { draft, action, expression, view, flip, scale, look, mouthTest } = frame.current;
        if (lastAction !== action) { lastAction = action; reset = now; }
        const performance=animations[action];
        // A full Sit -> hold -> Stand audition reveals weight transfer.
        const span=action==='stand'?4:performance.loop||action==='sit'?8:Math.min(8,performance.duration+.75);
        const time = ((now - reset) / 1000) % span;
        if (!document.hidden && Math.floor(time * 24) !== previous) {
          previous = Math.floor(time * 24);
          const layout = fitCharacterPreview(draft, scale, action);
          const actor = scene.actors[0];
          actor.characterId = draft.id; actor.x = layout.x; actor.y = layout.y; actor.scale = layout.scale;
          actor.view = view; actor.flip = flip; actor.expression = expression;
          const body = scene.clips[0], face = scene.clips[1];
          if (body.track === 'body'){
            body.action=action==='stand'?'sit':action;
            body.length=action==='stand'?1.8:action==='sit'||performance.loop?8:performance.duration+.22;
          }
          if (face.track === 'face') face.expression = expression;
          if (action === 'talk') {
            scene.clips[2] = { id: 'example-speech', track: 'dialogue', actor: 'preview', text: conversationAudition.text, asset: 'builtin:sbu-food',
              start: conversationAudition.start, length: conversationAudition.duration, muted: false, volume: 1, offset: 0 };
          } else if (action==='stand') {
            scene.clips[2]={id:'rise',track:'body',layer:'body',actor:'preview',action:'stand',start:1.8,length:animations.stand.duration};
          } else scene.clips.length = 2;
          if(face.track==='face')face.start=expression==='neutral'?8:0;
          const gaze = look === 'auto' ? undefined : look === 'camera' ? { x: 0, y: 0 } :
            look === 'left' ? { x: -.95, y: 0 } : look === 'right' ? { x: .95, y: 0 } : { x: 0, y: -.95 };
          try {
            renderer.draw(scene,[draft],time,{characterPreview:true,previewFocus:gaze,previewCamera:look==='camera',
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
  const update = <K extends keyof Character>(key: K, value: Character[K]) => setDraft(item => ({ ...item, [key]: value }));
  type Closet = NonNullable<Character['wardrobe']>;
  const updateCloset=<K extends keyof Closet>(key:K,value:Closet[K])=>setDraft(item=>({...item,wardrobe:{...item.wardrobe,[key]:value}}));
  const updateBuild=<K extends keyof NonNullable<Character['bodyBuild']>>(key:K,value:NonNullable<Character['bodyBuild']>[K])=>
    setDraft(item=>({...item,bodyBuild:{...item.bodyBuild,[key]:value}}));
  const updatePersonality = <K extends keyof NonNullable<Character['personality']>>(key:K,value:NonNullable<Character['personality']>[K])=>
    setDraft(current=>({...current,personality:{...current.personality,[key]:value}}));
  const activePersonality=resolvePersonality(draft.personality);
  const toothColors=Array.from({length:6},(_,index)=>draft.toothColors?.[index]??(draft.goldTeeth?.includes(index)?'#eac05c':'#fff4de'));

  return <Modal wide title={source ? 'Edit character' : 'Create character'} description="Pick a look, make it yours, and direct it from any angle." close={close}>
    <div className="factory-grid"><div className="factory-preview"><div className="factory-canvas">{fallback ? <NativeCharacterPreview character={draft} view={view} action={action} expression={expression} flip={flip} scale={fitCharacterPreview(draft, scale, action).scale} focus={look === 'auto' ? undefined : look === 'camera' ? { x: 0, y: 0 } : look === 'left' ? { x: -.95, y: 0 } : look === 'right' ? { x: .95, y: 0 } : { x: 0, y: -.95 }} mouthTest={mouthTest==='auto'?undefined:mouthTest}/> : <div className="factory-renderer-mount" ref={canvas}/>}</div><div className="factory-zoom"><IconButton title="Fit entire character" onClick={() => setScale(1.4)}><Maximize2 size={15}/></IconButton><IconButton title="Mirror character" active={flip} onClick={() => setFlip(value => !value)}><RotateCcw size={15}/></IconButton><IconButton title="Zoom out character" onClick={() => setScale(n => Math.max(.75, n - .12))}><Minus size={15}/></IconButton><IconButton title="Zoom in character" onClick={() => setScale(n => Math.min(1.7, n + .12))}><Plus size={15}/></IconButton></div>
      <div className="segmented view-choice" aria-label="Character view">{views.map(item => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{viewLabels[item]}</button>)}</div>
      <div className="field-row"><label>Preview action<Select aria="Preview action" value={action} onChange={setAction} options={actions}/></label><label>Expression<Select aria="Preview expression" value={expression} onChange={setExpression} options={expressions}/></label></div>
      <label className="field preview-eye-focus">Eye focus<Select aria="Preview eye focus" value={look} onChange={setLook} options={['auto','camera','left','right','up'] as const}
        render={value => value === 'auto' ? 'Natural · moving eyes' : value === 'camera' ? 'Eye contact · camera' : 'Look ' + value}/></label>
      <label className="field">Mouth rig audition
        <Select aria="Preview mouth shape" value={mouthTest} onChange={setMouthTest}
          options={['auto',...visemeNames] as const}
          render={value=>value==='auto'?'Automatic · speech/audio':value.toUpperCase()}/>
      </label>
    </div><div className="factory-edit"><label className="field">Name<input aria-label="Character name" maxLength={60} value={draft.name} onChange={e => update('name', e.target.value)}/></label>

      <div className="factory-section-heading"><span>Start with a character</span><button type="button" className="surprise-button" onClick={() => {
        const item = characters[Math.floor(Math.random() * characters.length)];
        setDraft(current => ({ ...item, id: current.id, name: current.name }));
      }}>Surprise me ✨</button></div>
      <div className="preset-row" aria-label="Character presets">{characters.map(item => <button key={item.id} type="button" title={item.name} aria-label={`Use ${item.name} preset`} onClick={() => setDraft({ ...item, id: draft.id, name: draft.name })}><Avatar character={item}/><span>{item.name}</span></button>)}</div>
      <div className="segmented factory-categories" role="group" aria-label="Character sections">{sections.map(item => <button key={item} type="button" onClick={() => setSection(item)} aria-pressed={item===section} className={item === section ? 'active' : ''}>{item}</button>)}</div>
      <div className="factory-fields">
        {(section==='Hair'||section==='Face'||section==='Outfit'||section==='Accessories')&&<CharacterChoices key={section} section={section} character={draft} change={update} changeCloset={updateCloset}/>}
        {section === 'Personality' && <div className="factory-personality">
          <div className="factory-build-field"><strong>Personality preset</strong>
            <Select aria="Personality preset" value={activePersonality.preset} options={personalityPresets}
              onChange={preset=>setDraft(current=>({...current,personality:{
                preset,autoActing:current.personality?.autoActing??'full',signature:current.personality?.signature??'none'
              }}))} render={value=>label(value)}/>
          </div>
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
            <button className="quiet" type="button" onClick={()=>{setAction('talk');setExpression('neutral');}}>Preview conversation</button>
            <button className="quiet" type="button" onClick={()=>{setAction('walk');setExpression('neutral');}}>Preview walk</button>
          </div>
        </div>}
        {section === 'Body' && <>
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
        {section === 'Face' && <div className="factory-teeth-editor">
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
        {section === 'Face' && <div className="factory-mouth-rig-editor">
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
        <div className="factory-skin"><span>Skin tone</span><div className="tone-swatches">{skinTones.map(tone => <button key={tone} type="button" className={draft.skin.toLowerCase() === tone ? 'selected' : ''} style={{ backgroundColor: tone }} title={tone} aria-label={`Skin tone ${tone}`} onClick={() => update('skin', tone)}/>)}</div><label className="custom-tone">Custom <input type="color" aria-label="Custom skin tone" value={draft.skin} onChange={e => update('skin', e.target.value)}/></label></div>
        {(section === 'Face' || section === 'Body') && <><button type="button" className="advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>{advanced ? '− Hide advanced proportions' : '+ Advanced proportions'}</button>
        {advanced && <div className="factory-advanced">{(section === 'Face' ? ['eyeSpacing'] : ['torso', 'arms', 'legs']).map(key => { const id = key as keyof typeof sliders; return <label className="field slider" key={key}>{sliders[id]}<input type="range" min={id==='eyeSpacing'?.65:.75} max={id === 'eyeSpacing' ? 1.4 : 1.3} step={.01} value={draft[id]} onChange={event => update(id, Number(event.target.value))}/></label>; })}</div>}</>}
      </div>
    </div></div>
    <footer className="modal-footer">{source && <><IconButton title="Delete character" onClick={() => remove(source.id)}><Trash2 size={17}/></IconButton><button className="quiet" disabled={!draft.name.trim()} onClick={() => save({ ...draft, id: uid(), name: `${draft.name.trim().slice(0, 54)} copy` })}><Copy size={16}/> Duplicate</button></>}<span className="spacer"/><button className="quiet" onClick={close}>Cancel</button><button className="primary" disabled={!draft.name.trim()} onClick={() => save({ ...draft, name: draft.name.trim() })}><Save size={16}/> Save character</button></footer>
  </Modal>;
}
