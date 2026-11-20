import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { defaultObjectDecision, objectDependencies, type ObjectDependencyDecision } from '../engine/interactions.ts';
import { label, type Scene } from '../engine/schema.ts';
import { Modal, Select } from './shared.tsx';

export function ObjectDependenciesDialog({ scene, objectId, actorNames, close, confirm }: {
  scene: Scene; objectId: string; actorNames: Record<string, string>;
  close: () => void; confirm: (decisions: ObjectDependencyDecision) => void;
}) {
  const object = scene.objects.find(item => item.id === objectId);
  const impacted = objectDependencies(scene, objectId, actorNames);
  const [decisions, setDecisions] = useState<ObjectDependencyDecision>(() =>
    Object.fromEntries(impacted.map(item => [item.clip.id, defaultObjectDecision(item.clip)]))
  );
  if (!object) return null;
  return <Modal title={'Delete ' + object.name + '?'} description="This object is used by actions in the scene. Nothing will be left sitting or holding invisible props." close={close}>
    <div className="dialog-fields object-dependency-dialog">
      <p className="dependency-warning"><AlertTriangle size={19}/> {impacted.length} timeline {impacted.length === 1 ? 'action depends' : 'actions depend'} on this {label(object.kind).toLowerCase()}. Choose what each character should do instead.</p>
      {impacted.map(({ clip, actorName, alternatives }) => {
        const fallback = defaultObjectDecision(clip);
        const choices = [fallback, ...(!['action:stand','action:idle'].includes(fallback) ? ['action:idle'] : []),
          ...(clip.action !== 'sit' ? ['action:' + clip.action, 'action:think'] : []),
          ...alternatives.map(item => 'object:' + item.id)];
        const options = [...new Set(choices)];
        const description = (value: string) => {
          if (value.startsWith('object:')) return 'Use ' + (alternatives.find(item => item.id === value.slice(7))?.name ?? 'another object');
          if (value === 'action:stand') return 'Stand on the floor';
          if (value === 'action:idle') return 'Relax / idle (empty hands)';
          if (value === 'action:' + clip.action) return 'Keep ' + label(clip.action) + ' without the prop';
          return label(value.slice(7)) + ' instead';
        };
        return <label className="field" key={clip.id}>
          <strong>{actorName} · {label(clip.action)}</strong>
          <small>{clip.start.toFixed(1)}s–{(clip.start + clip.length).toFixed(1)}s · {clip.layer === 'gesture' ? 'Gesture' : 'Body action'}</small>
          <Select aria={'Replace action for ' + actorName} value={decisions[clip.id] ?? fallback}
            options={options} onChange={decision => setDecisions(prev => ({ ...prev, [clip.id]: decision }))} render={description}/>
        </label>;
      })}
      <p className="small-text">The floor is always available for standing. You can undo the deletion to restore the object and its original animation links.</p>
    </div>
    <footer className="modal-footer"><button type="button" className="quiet" onClick={close}>Keep object</button><span className="spacer"/><button type="button" className="danger" onClick={() => confirm(decisions)}><Trash2 size={16}/> Delete and update actions</button></footer>
  </Modal>;
}
