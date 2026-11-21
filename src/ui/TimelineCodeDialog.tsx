import { useState } from 'react';
import { ClipboardCopy, Code2, FileCheck, RotateCcw } from 'lucide-react';
import { parseSceneCode, sceneToCode } from '../engine/timelineCode.ts';
import { movieToCode, parseMovieCode, sceneBuildingContext } from '../engine/movieTimeline.ts';
import type { Project, Scene } from '../engine/schema.ts';
import { Modal } from './shared.tsx';

/** Both views edit the exact persisted ProjectDocument; never a shadow timeline. */
export function TimelineCodeDialog({ project, scene, apply, applyMovie, close }: {
  project: Project; scene: Scene; apply: (next: Scene, base: string) => void;
  applyMovie: (next: Project, base: string) => void; close: () => void;
}) {
  const [originalScene] = useState(() => sceneToCode(scene));
  const [originalMovie] = useState(() => movieToCode(project));
  const [sceneCode, setSceneCode] = useState(originalScene);
  const [movieCode, setMovieCode] = useState(originalMovie);
  const [mode, setMode] = useState<'scene' | 'movie'>('scene');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState('');
  const code = mode === 'scene' ? sceneCode : movieCode;
  const setCode = mode === 'scene' ? setSceneCode : setMovieCode;
  function switchMode(value: 'scene' | 'movie') {
    setMode(value); setError(''); setMessage('');
  }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setError(''); }
    catch { setError('Could not access clipboard. Select the JSON and copy manually.'); }
  }
  function validate() {
    try {
      if (mode === 'scene') {
        const next = parseSceneCode(sceneCode, project, scene.id);
        setMessage('Valid scene · ' + next.clips.length + ' clips · ' + next.duration + 's');
      } else {
        const next = parseMovieCode(movieCode, project);
        setMessage('Valid movie · ' + next.scenes.length + ' scenes · ' + next.scenes.reduce((total, item) => total + item.duration, 0) + 's');
      }
      setError('');
    } catch (err) {
      setMessage('');
      setError(err instanceof Error ? err.message : 'Invalid timeline JSON.');
    }
  }
  function commit() {
    try {
      if (mode === 'scene') apply(parseSceneCode(sceneCode, project, scene.id), originalScene);
      else applyMovie(parseMovieCode(movieCode, project), originalMovie);
      close();
    } catch (err) {
      setMessage('');
      setError(err instanceof Error ? err.message : 'Could not apply timeline.');
    }
  }
  return <Modal wide title="Timeline Code Mode" description="Edit and validate the live movie data. Scene and movie views use the same ProjectDocument as the visual timeline and playback." close={close}>
    <div className="dialog-fields">
      <div className="timeline-code-tabs" role="tablist" aria-label="Timeline JSON scope">
        <button type="button" role="tab" aria-selected={mode === 'scene'} className="quiet" onClick={() => switchMode('scene')}>Current scene</button>
        <button type="button" role="tab" aria-selected={mode === 'movie'} className="quiet" onClick={() => switchMode('movie')}>Entire movie</button>
      </div>
      <div className="film-tools">
        <button type="button" className="quiet" onClick={() => void copy(sceneBuildingContext(project, scene), 'scene-building context')}><ClipboardCopy size={15}/> Copy AI context</button>
        <button type="button" className="quiet" onClick={() => void copy(code, mode === 'scene' ? 'scene JSON' : 'movie JSON')}><Code2 size={15}/> Copy JSON</button>
        <button type="button" className="quiet" onClick={() => { setCode(mode === 'scene' ? originalScene : originalMovie); setError(''); setMessage(''); }}><RotateCcw size={15}/> Reset this draft</button>
      </div>
      <p className="small-text">Paste AI-generated JSON, validate, then apply. Every actor, prop and audio reference must exist. Switching tabs preserves each unsubmitted draft. Applying creates one Undo/Redo step.</p>
      <label className="field">{mode === 'scene' ? 'Scene JSON' : 'Whole movie timeline JSON'}
        <textarea className="timeline-code-input" aria-label="Editable timeline JSON" spellCheck={false} value={code}
          onChange={event => { setCode(event.target.value); setError(''); setMessage(''); }}/>
      </label>
      {error && <p role="alert" className="form-error timeline-code-status">{error}</p>}
      {message && <p role="status" className="small-text timeline-code-status"><FileCheck size={14}/> {message}</p>}
      {copied && <p role="status" className="small-text">Copied {copied}.</p>}
    </div>
    <footer className="modal-footer">
      <button type="button" className="quiet" onClick={validate}>Validate JSON</button>
      <span className="spacer"/>
      <button type="button" className="quiet" onClick={close}>Cancel</button>
      <button type="button" className="primary" onClick={commit}>Apply to timeline</button>
    </footer>
  </Modal>;
}
