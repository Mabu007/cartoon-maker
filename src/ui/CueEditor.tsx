import { Plus, Trash2 } from 'lucide-react';
import { makeScene } from '../engine/presets.ts';
import { anchorFor } from '../engine/interactions.ts';
import { actions, expressions, label, shots, soundNames, uid, type DirectionData, type Project, type ScriptLine, type ScriptSceneData } from '../engine/schema.ts';
import { IconButton, NumberField, Select } from './shared.tsx';

const kinds = ['move', 'action', 'expression', 'gaze', 'prop', 'presence', 'camera', 'sound', 'transition', 'pause'] as const;
export function cueAssets(project: Project, scene: ScriptSceneData) {
  const current = project.scenes.find(item => item.id === (scene.setsFrom ?? scene.id));
  return current?.environment === scene.environment ? current.objects : makeScene(scene.environment).objects.map((object, index, items) =>
    items.findIndex(item => item.kind === object.kind) === index ? object : { ...object, id: `${object.kind}-${index + 1}` });
}

function defaultCue(kind: DirectionData['kind'], actor: string, firstTarget: string, hold: string): DirectionData {
  const time = { id: uid(), seconds: 1, delay: 0, parallel: ['expression', 'gaze', 'camera', 'sound', 'presence', 'prop'].includes(kind) };
  switch (kind) {
    case 'move': return { ...time, kind, actor, gait: 'walk', x: 480 };
    case 'action': return { ...time, kind, actor, action: 'point', layer: 'gesture' };
    case 'expression': return { ...time, kind, actor, expression: 'thinking' };
    case 'gaze': return { ...time, kind, actor, target: firstTarget || 'camera' };
    case 'prop': return { ...time, kind, actor, target: hold || 'missing-prop', interaction: 'equip' };
    case 'presence': return { ...time, kind, actor, visible: true };
    case 'camera': return { ...time, kind, shot: 'medium', transition: 'cut', ...(actor ? { actor } : {}) };
    case 'sound': return { ...time, kind, sound: 'ding' };
    case 'transition': return { ...time, kind, effect: 'fade-out' };
    case 'pause': return { ...time, kind };
  }
}

export function CueEditor({ line, project, scene, change }: {
  line: ScriptLine; project: Project; scene: ScriptSceneData; change: (line: ScriptLine) => void;
}) {
  const cast = scene.cast;
  const objects = cueAssets(project, scene);
  const holdables = objects.filter(object => anchorFor(object)?.action === 'hold');
  const targets = ['camera', ...cast, ...objects.map(object => object.id)];
  const name = (id: string) => project.characters.find(item => item.id === id)?.name ?? objects.find(item => item.id === id)?.name ?? label(id);
  const firstActor = line.characterId ?? cast[0] ?? 'missing-actor';
  const init = (kind: DirectionData['kind']) => defaultCue(kind, firstActor, objects[0]?.id, holdables[0]?.id);
  const patch = (index: number, cue: DirectionData) => change({ ...line, directions: line.directions.map((item, at) => at === index ? { ...cue, id: cue.kind === item.kind ? item.id ?? cue.id : cue.id } : item) });
  return <div className="cue-list">
    {line.directions.map((cue, index) => {
      const actionObjects = cue.kind === 'action' && cue.action === 'sit' ? objects.filter(object => anchorFor(object)?.action === 'sit') : objects;
      return <fieldset className="direction-fields" key={cue.id ?? index}><legend>Cue {index + 1}</legend>
        <div className="film-tools"><Select aria="Cue type" value={cue.kind} options={kinds} onChange={kind => patch(index, init(kind))}/>
          <IconButton title="Remove cue" onClick={() => change({ ...line, directions: line.directions.filter((_, at) => at !== index) })}><Trash2 size={15}/></IconButton></div>
        {'actor' in cue && <label>Actor<Select aria="Cue actor" value={cue.actor ?? ''} options={cue.kind === 'camera' ? ['', ...cast] : cast}
          onChange={actor => patch(index, { ...cue, actor: cue.kind === 'camera' && !actor ? undefined : actor } as DirectionData)} render={id => id ? name(id) : 'Automatic'}/></label>}
        {cue.kind === 'move' && <>
          <label>Pace<Select aria="Movement pace" value={cue.gait} options={['walk', 'run']} onChange={gait => patch(index, { ...cue, gait })}/></label>
          <NumberField text="Destination X" value={cue.x} min={-2000} max={3000} onChange={x => patch(index, { ...cue, x })}/>
          <NumberField text="Destination Y" value={cue.y ?? 453} min={-2000} max={3000} onChange={y => patch(index, { ...cue, y })}/>
        </>}
        {cue.kind === 'action' && <>
          <label>Animation<Select aria="Animation" value={cue.action} options={actions} onChange={action => patch(index, { ...cue, action, target: undefined, layer: action === 'sit' ? 'body' : cue.layer })}/></label>
          <label>Layer<Select aria="Animation layer" value={cue.layer} options={cue.action === 'sit' ? ['body'] : ['body', 'gesture']} onChange={layer => patch(index, { ...cue, layer })}/></label>
          <label>Object<Select aria="Action object" value={cue.target ?? ''} options={['', ...actionObjects.map(object => object.id)]} onChange={target => patch(index, { ...cue, target: target || undefined })} render={id => id ? name(id) : 'Choose object'}/></label>
        </>}
        {cue.kind === 'expression' && <label>Expression<Select aria="Acting expression" value={cue.expression} options={expressions} onChange={expression => patch(index, { ...cue, expression })}/></label>}
        {cue.kind === 'gaze' && <label>Look at<Select aria="Look at target" value={cue.target} options={targets} onChange={target => patch(index, { ...cue, target })} render={name}/></label>}
        {cue.kind === 'prop' && <>
          <label>Prop<Select aria="Held prop" value={cue.target} options={holdables.map(object => object.id)} onChange={target => patch(index, { ...cue, target })} render={name}/></label>
          <label>Interaction<Select aria="Cue prop interaction" value={cue.interaction} options={['equip', 'release']} onChange={interaction => patch(index, { ...cue, interaction })}/></label>
        </>}
        {cue.kind === 'presence' && <label className="check"><input type="checkbox" checked={cue.visible} onChange={event => patch(index, { ...cue, visible: event.target.checked })}/>Visible from this cue</label>}
        {cue.kind === 'camera' && <>
          <label>Framing<Select aria="Framing" value={cue.shot} options={shots} onChange={shot => patch(index, { ...cue, shot })}/></label>
          <label>Camera transition<Select aria="Camera transition" value={cue.transition} options={['cut', 'glide']} onChange={transition => patch(index, { ...cue, transition })}/></label>
        </>}
        {cue.kind === 'sound' && <label>Effect<Select aria="Cue sound" value={cue.sound} options={soundNames} onChange={sound => patch(index, { ...cue, sound })}/></label>}
        {cue.kind === 'transition' && <label>Effect<Select aria="Scene transition" value={cue.effect} options={['fade-in', 'fade-out']} onChange={effect => patch(index, { ...cue, effect })}/></label>}
        {cue.kind !== 'move' && <NumberField text="Duration in seconds" value={cue.seconds} min={.1} max={60} step={.1} onChange={seconds => patch(index, { ...cue, seconds })}/>}
        <NumberField text="Delay in seconds" value={cue.delay} min={0} max={60} step={.1} onChange={delay => patch(index, { ...cue, delay })}/>
        {cue.kind !== 'pause' && <label className="check"><input type="checkbox" checked={cue.parallel} onChange={event => patch(index, { ...cue, parallel: event.target.checked })}/>Play alongside this line</label>}
      </fieldset>;
    })}
    <button className="quiet" disabled={line.directions.length >= 12} onClick={() => change({ ...line, directions: [...line.directions, init('camera')] })}><Plus size={15}/>Add direction cue</button>
  </div>;
}
