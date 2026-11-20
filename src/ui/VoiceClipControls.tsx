import { useState } from 'react';
import { Sparkles, Volume2 } from 'lucide-react';
import { voices } from '../services/speech.ts';
import { type Clip } from '../engine/schema.ts';
type Dialogue = Extract<Clip, { track: 'dialogue' }>;

export function VoiceClipControls({ clip, generate }: {
  clip: Dialogue;
  generate: (clip: Dialogue, text: string, voice: string) => Promise<string>;
}) {
  const [text, setText] = useState(clip.text);
  const [voice, setVoice] = useState('warm');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  async function run() {
    if (!text.trim() || busy) return;
    setBusy(true); setStatus(''); setError('');
    try { setStatus(await generate(clip, text.trim(), voice)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Voice generation failed.'); }
    finally { setBusy(false); }
  }
  return <div className="voice-generation-controls">
    <label className="field">Spoken line
      <textarea aria-label="Edit spoken dialogue" maxLength={400} value={text} onChange={event => setText(event.target.value)}
        placeholder="What should this character say?"/>
    </label>
    <label className="field">Voice
      <select aria-label="Voice preset" value={voice} onChange={event => setVoice(event.target.value)}>
        {voices.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select>
    </label>
    <button className="primary full" disabled={busy || !text.trim()} onClick={() => void run()}>
      {busy ? <Volume2 size={15}/> : <Sparkles size={15}/>}
      {busy ? 'Generating and aligning…' : 'Generate / Regenerate voice'}
    </button>
    <p className="small-text">Only this line is regenerated. The previous asset stays intact until the replacement succeeds; Undo restores it.</p>
    {status && <p role="status" className="small-text">{status}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}
