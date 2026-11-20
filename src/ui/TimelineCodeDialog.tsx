import { useState } from 'react';
import { ClipboardCopy, Code2, FileCheck, RotateCcw } from 'lucide-react';
import { parseSceneCode, sceneContext, sceneToCode } from '../engine/timelineCode.ts';
import type { Project, Scene } from '../engine/schema.ts';
import { Modal } from './shared.tsx';

/** Visual timeline and JSON editor both write the same Scene in the Zustand store. */
export function TimelineCodeDialog({ project, scene, apply, close }: {
  project: Project; scene: Scene; apply: (next: Scene, base: string) => void; close: () => void;
}) {
  const [original] = useState(() => sceneToCode(scene));
  const [code, setCode] = useState(original);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState('');
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setError(''); }
    catch { setError('Could not access clipboard. Select the text and copy manually.'); }
  }
  function validate(): Scene | undefined {
    try {
      const next = parseSceneCode(code, project, scene.id);
      setError(''); setMessage(`Valid scene · ${next.clips.length} clips · ${next.duration}s`);
      return next;
    } catch (err) { setMessage(''); setError(err instanceof Error ? err.message : 'Invalid scene JSON.'); }
  }
  function commit() {
    const next = validate();
    if (!next) return;
    try { apply(next, original); close(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not apply the scene.'); }
  }
  return <Modal wide title="Timeline code" description="Your timeline is editable JSON. Changes here update the same scene used by the visual editor and animation engine." close={close}>
    <div className="dialog-fields">
      <div className="film-tools">
        <button type="button" className="quiet" onClick={() => void copy(sceneContext(project, scene), 'AI scene-building context')}><ClipboardCopy size={15}/> Copy AI context</button>
        <button type="button" className="quiet" onClick={() => void copy(code, 'scene JSON')}><Code2 size={15}/> Copy JSON</button>
        <button type="button" className="quiet" onClick={() => { setCode(original); setError(''); setMessage(''); }}><RotateCcw size={15}/> Reset draft</button>
      </div>
      <p className="small-text">Paste scene JSON from ChatGPT, validate it, then choose Apply. Existing actors, props and audio assets must use real IDs from the copied AI context.</p>
      <label className="field">Scene JSON
        <textarea className="timeline-code-input" aria-label="Editable timeline JSON" spellCheck={false} value={code}
          onChange={event => { setCode(event.target.value); setError(''); setMessage(''); }}/>
      </label>
      {error && <p role="alert" className="form-error">{error}</p>}
      {message && <p role="status" className="small-text"><FileCheck size={14}/> {message}</p>}
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
