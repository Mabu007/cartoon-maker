import { useState } from 'react';
import { Code2, Send, Sparkles, WandSparkles } from 'lucide-react';
import { applyTimelineEdits, type TimelineEditProposal } from '../engine/timelineAI.ts';
import { sceneToCode } from '../engine/timelineCode.ts';
import type { Project, Scene } from '../engine/schema.ts';
import { canUseAI, filmmaker, type AiAccess } from '../services/filmmaker.ts';
import type { Selection } from '../studio.ts';

type Message = { role: 'user' | 'assistant'; text: string };
type Pending = { base: string; next: Scene; proposal: TimelineEditProposal; request: string };

export function DirectorPanel({ project, scene, selection, getTime, ai, busy, apply, openCode }: {
  project: Project; scene: Scene; selection: Selection; getTime: () => number; ai: AiAccess; busy: boolean;
  apply: (next: Scene, original: string) => void; openCode: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Pending>();
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const selected = selection?.kind === 'clip' ? scene.clips.find(item => item.id === selection.id) : undefined;
  const time = getTime();

  async function propose() {
    if (!prompt.trim() || loading || !canUseAI(ai)) return;
    const request = prompt.trim();
    const base = sceneToCode(scene);
    setPending(undefined); setError(''); setLoading(true);
    try {
      const proposal = await filmmaker(ai, 'timeline', request, {
        project: { id: project.id, title: project.name },
        scene,
        selectedClip: selected,
        selection,
        playheadSeconds: time,
        characters: project.characters.map(c => ({ id: c.id, name: c.name })),
        actors: scene.actors.map(a => ({ id: a.id, characterId: a.characterId })),
        props: scene.objects.map(o => ({ id: o.id, kind: o.kind, name: o.name })),
        storyBible: project.production?.bible.profile,
        script: project.production?.screenplay.scenes.find(s => s.id === scene.id)?.elements.map(e => ({ type: e.type, text: e.text })),
        recentChat: history.slice(-6)
      });
      if (proposal.edits.length) {
        const next = applyTimelineEdits(project, scene, proposal);
        setPending({ base, next, proposal, request });
      } else {
        setHistory(old => [...old, { role: 'user' as const, text: request }, { role: 'assistant' as const, text: proposal.message }].slice(-20));
        setPrompt('');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not direct this scene.'); }
    finally { setLoading(false); }
  }

  function commit() {
    if (!pending) return;
    try {
      apply(pending.next, pending.base);
      setHistory(old => [...old, { role: 'user' as const, text: pending.request }, { role: 'assistant' as const, text: pending.proposal.message }].slice(-20));
      setPending(undefined);
      setPrompt('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The scene changed. Request a fresh edit.'); }
  }

  return <aside className="inspector director-panel" aria-label="AI Director">
    <div className="inspector-top"><Sparkles size={17}/><h2>AI Director</h2></div>
    <div className="director-body">
      <p className="small-text">Chat with your director to modify the actual animation timeline. No approved screenplay required.</p>
      <p className="small-text">Scene: <strong>{scene.name}</strong> · {scene.clips.length} clips{selected ? ` · Selected ${selected.track} clip` : ''}</p>
      {history.length > 0 && <div className="director-messages" aria-label="Director conversation">
        {history.map((message, i) => <p key={i} className={message.role === 'user' ? 'director-user-message' : 'director-ai-message'}><strong>{message.role === 'user' ? 'You' : 'Director'}</strong> {message.text}</p>)}
      </div>}
      <form onSubmit={event => { event.preventDefault(); void propose(); }}>
        <label>Ask AI to direct your scene
          <textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={3500}
            placeholder="Make Zee look at Sbu, then add an angry reaction. Give me a close-up for three seconds."
            aria-label="Ask the AI Director"/>
        </label>
        <div className="film-tools">
          <button type="button" className="quiet" onClick={openCode}><Code2 size={15}/> Timeline code</button>
          <button type="submit" className="primary" disabled={!canUseAI(ai) || busy || loading || !prompt.trim()}>
            {loading ? <WandSparkles size={15}/> : <Send size={15}/>}
            {loading ? 'Directing…' : 'Propose edit'}
          </button>
        </div>
        {!canUseAI(ai) && <p className="small-text">Connect a model through AI settings, or edit this scene directly in Timeline Code. The timeline works without AI.</p>}
      </form>
      {error && <p role="alert" className="film-error">{error}</p>}
      {pending && <div className="script-diff" role="region" aria-label="Review AI timeline changes">
        <h3>Review timeline changes</h3>
        <p>{pending.proposal.message}</p>
        <p className="small-text">{pending.proposal.edits.map(e => e.op).join(' · ')} · {pending.next.clips.length} resulting clips</p>
        <div className="film-tools">
          <button className="primary" disabled={busy} onClick={commit}>Apply to timeline</button>
          <button className="quiet" onClick={() => setPending(undefined)}>Discard</button>
        </div>
      </div>}
    </div>
  </aside>;
}
