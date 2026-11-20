import { useState } from 'react';
import { BookOpen, LockKeyhole, Sparkles } from 'lucide-react';
import { applyDirectorEdits } from '../engine/filmmakerAI.ts';
import { evaluate } from '../engine/evaluate.ts';
import { uid, type Project, type Scene, type ScriptSceneData } from '../engine/schema.ts';
import { canUseAI, filmmaker, type AiAccess } from '../services/filmmaker.ts';
import { useStudio, type Selection } from '../studio.ts';
import { cueAssets, CueEditor } from './CueEditor.tsx';

export function DirectorPanel({ project, scene, selection, getTime, ai, busy, commit, write, toggleLock }: {
  project: Project; scene: Scene; selection: Selection; getTime: () => number; ai: AiAccess; busy: boolean;
  commit: (next: ScriptSceneData, expected: ScriptSceneData, note?: string, request?: string) => Promise<boolean>;
  write: (id: string, line?: string) => void; toggleLock: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<{ base: ScriptSceneData; next: ScriptSceneData; message: string; request?: string }>();
  const [lineId, setLineId] = useState('');
  const production = project.production;
  const script = production?.screenplay.scenes.find(item => item.id === scene.id);
  const record = production?.graph.find(item => item.sceneId === scene.id);
  const clip = selection?.kind === 'clip' ? scene.clips.find(item => item.id === selection.id) : undefined;
  const source = clip ? record?.events[clip.id] : undefined;
  const line = script?.elements.find(item => item.id === (lineId || source?.line))
    ?? script?.elements.find(item => item.type === 'dialogue') ?? script?.elements[0];
  const reviewLine = review?.next.elements.find(item => item.id === line?.id) ?? line;
  const changed = review?.next.elements.filter(item => JSON.stringify(item) !== JSON.stringify(review.base.elements.find(original => original.id === item.id))) ?? [];
  const removed = review?.base.elements.filter(item => !review.next.elements.some(next => next.id === item.id)) ?? [];

  async function propose() {
    if (!canUseAI(ai) || !script || !prompt.trim() || loading) return;
    setLoading(true); setError(''); setReview(undefined);
    const request = prompt.trim(), at = getTime();
    try {
      const state = evaluate(scene, at);
      const result = await filmmaker(ai, 'direct', request, {
        scene: script, at, selection, source, selectedLine: line?.id, shot: state.shot,
        cast: project.characters.filter(character => script.cast.includes(character.id)).map(({ id, name }) => ({ id, name })),
        state: state.actors.map(({ characterId, x, y, expression, gazeTarget, held, visible }) => ({ characterId, x, y, expression, gazeTarget, held: held?.id, visible })),
        props: cueAssets(project, script).map(({ id, name, kind }) => ({ id, name, kind })),
        conversation: production?.conversation.slice(-6)
      });
      if (useStudio.getState().project.id !== project.id) return;
      setReview({ base: script, next: applyDirectorEdits(script, result, uid), message: result.message, request });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Direction could not be proposed.'); }
    finally { setLoading(false); }
  }
  return <aside className="inspector director-panel" aria-label="Director panel">
    <div className="inspector-top"><Sparkles size={17}/><h2>Director</h2></div>
    {!script ? <div className="director-body"><p className="small-text">Compile a screenplay scene to connect its lines to this timeline.</p><button className="quiet" onClick={() => write(scene.id)}><BookOpen size={16}/>Open screenplay</button></div> :
      <div className="director-body">
        <label>Screenplay line<select aria-label="Direct screenplay line" value={line?.id ?? ''} onChange={event => { setLineId(event.target.value); setReview(undefined); }}>
          {script.elements.map(item => <option value={item.id} key={item.id}>{item.text.slice(0, 62) || item.type}</option>)}
        </select></label>
        <div className="film-tools"><button className="quiet" onClick={() => write(scene.id, line?.id)}><BookOpen size={16}/>Open script line</button>
          {clip && source && <button className="quiet" onClick={() => toggleLock(clip.id)}><LockKeyhole size={15}/>{record?.locked.includes(clip.id) ? 'Unlock clip' : 'Lock clip'}</button>}</div>
        {!!record?.diagnostics.length && <details open><summary>Production notes ({record.diagnostics.length})</summary><ul>{record.diagnostics.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
        <form onSubmit={event => { event.preventDefault(); void propose(); }}>
          {canUseAI(ai) ? <><label>Ask the AI Director<textarea value={prompt} maxLength={6000} onChange={event => setPrompt(event.target.value)} placeholder="Make Zee look at the door, then pause before answering."/></label>
            <button className="primary" disabled={loading || busy || !prompt.trim()}>{loading ? 'Reading the scene…' : 'Propose changes'}</button></>
            : <p className="small-text">Connect a model in AI settings for conversational direction, or direct the selected line below.</p>}
        </form>
        {reviewLine && line && <details><summary>Direct this line</summary><CueEditor line={reviewLine} scene={script} project={project} change={next => setReview({
          base: script, next: { ...script, elements: script.elements.map(item => item.id === next.id ? next : item) },
          message: 'Update the selected line’s performance cues.'
        })}/></details>}
        {error && <p className="film-error" role="alert">{error}</p>}
        {review && <div className="script-diff" role="region" aria-label="Direction review">
          <h3>Review direction</h3><p>{review.message}</p>
          {removed.map(item => <p className="diff-before" key={item.id}>Removed · {item.text}</p>)}
          {changed.map(item => <div key={item.id} className="diff-item">
            <p className="diff-before">{review.base.elements.find(original => original.id === item.id)?.text || 'New line'}</p>
            <p className="diff-after">{item.text || item.type}{item.directions.length > 0 && <small>{item.directions.map(cue => cue.kind + ('target' in cue ? ' · ' + cue.target : '')).join(', ')}</small>}</p>
          </div>)}
          <div className="film-tools">
            <button className="primary" disabled={busy || !changed.length && !removed.length} onClick={async () => {
              if (await commit(review.next, review.base, review.message, review.request)) { setReview(undefined); setPrompt(''); }
            }}>{busy ? 'Compiling…' : 'Apply and preview'}</button>
            <button className="quiet" onClick={() => setReview(undefined)}>Discard</button>
          </div>
        </div>}
      </div>}
  </aside>;
}
