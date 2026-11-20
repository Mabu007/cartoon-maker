import { useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, GripVertical, Plus, Sparkles, Trash2 } from 'lucide-react';
import { acceptBibleProposal } from '../engine/filmmakerAI.ts';
import { fromOutline, makeStoryScene, reviseScript } from '../engine/production.ts';
import { creativeStatuses, environments, uid, type Production, type Project, type StoryScene } from '../engine/schema.ts';
import { canUseAI, filmmaker, type AiAccess } from '../services/filmmaker.ts';
import { useStudio } from '../studio.ts';
import { IconButton, NumberField, Select } from './shared.tsx';

type Update = (change: (current: Production) => Production) => void;
const textFields = ['title', 'logline', 'synopsis', 'genre', 'tone', 'theme', 'audience', 'visualStyle'] as const;
const fieldNames = { title: 'Title', logline: 'Logline', synopsis: 'Synopsis', genre: 'Genre', tone: 'Tone', theme: 'Theme', audience: 'Audience', visualStyle: 'Visual style' };
const sceneFields = ['title', 'location', 'summary', 'purpose', 'act', 'sequence', 'continuity', 'requirements'] as const;
const sceneLabels = { title: 'Scene title', location: 'Location', summary: 'Summary', purpose: 'Narrative purpose', act: 'Act', sequence: 'Sequence', continuity: 'Continuity', requirements: 'Production requirements' };
const approved = (status: string) => status === 'approved' || status === 'locked';

export function StoryStudio({ project, production, update, ai, write, loadExample, initialIdea = '' }: {
  project: Project; production: Production; update: Update; ai: AiAccess; write: (draft: boolean) => void; loadExample: () => void; initialIdea?: string;
}) {
  const { bible } = production;
  const [prompt, setPrompt] = useState(initialIdea), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [proposal, setProposal] = useState<Production['bible']>();
  const [dragId, setDragId] = useState('');
  const [person, setPerson] = useState('');
  const [focused, setFocused] = useState<string>();
  function patchScene(id: string, value: Partial<StoryScene>) {
    update(current => ({ ...current, bible: { ...current.bible, scenes: current.bible.scenes.map(scene => scene.id === id ? { ...scene, ...value } : scene) } }));
  }
  function changeScenes(change: (scenes: StoryScene[]) => StoryScene[]) {
    update(current => ({ ...current, bible: { ...current.bible, scenes: change(current.bible.scenes) } }));
  }
  function reorder(from: string, to: string) {
    if (from === to || !bible.scenes.some(scene => scene.id === from)) return;
    changeScenes(scenes => {
      const target = scenes.findIndex(scene => scene.id === to);
      const result = scenes.filter(scene => scene.id !== from);
      result.splice(target, 0, scenes.find(scene => scene.id === from)!);
      return result;
    });
  }
  async function send() {
    if (!canUseAI(ai) || !prompt.trim() || busy) return;
    const request = prompt.trim();
    setBusy(true); setError('');
    try {
      const result = await filmmaker(ai, 'brainstorm', request, { bible, conversation: production.conversation.slice(-8),
        cast: project.characters.map(({ id, name }) => ({ id, name })),
        sets: environments });
      if (useStudio.getState().project.id !== project.id) return;
      const response = result.message;
      if (result.proposal) {
        const cast = new Set(project.characters.map(character => character.id));
        setProposal({ ...result.proposal, characters: result.proposal.characters.filter(character => cast.has(character.characterId)),
          scenes: result.proposal.scenes.map(scene => ({ ...scene, cast: scene.cast.filter(id => cast.has(id)) })) });
      }
      update(current => ({ ...current, conversation: [...current.conversation, { role: 'user' as const, text: request }, { role: 'assistant' as const, text: response }].slice(-24) }));
      setPrompt('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Brainstorming failed.'); }
    finally { setBusy(false); }
  }
  function openScreenplay() {
    if (!production.screenplay.scenes.length) {
      const outline = bible.scenes.filter(scene => approved(scene.status));
      if (!outline.length) { setError('Approve at least one scene to start writing from the outline.'); return; }
      update(current => reviseScript(current, outline.map(fromOutline)));
    }
    write(!production.screenplay.scenes.length);
  }
  return <main className="film-workspace story-workspace">
    <section className="film-main">
      <header className="film-heading"><div><h1>Story Bible</h1><p>Develop the story, cast and locations for your film.</p></div><button className="primary" onClick={openScreenplay}><BookOpen size={16}/>Write screenplay</button></header>
      <details className="film-section" open><summary>Film brief</summary>
        <div className="film-fields">
          {textFields.map(field => <label key={field} className={['synopsis', 'logline'].includes(field) ? 'film-field-wide' : ''}>{fieldNames[field]}
            {field === 'synopsis' ? <textarea disabled={bible.status === 'locked'} key={bible.profile[field]} defaultValue={bible.profile[field]} maxLength={4000}
              onBlur={event => { const value = event.currentTarget.value; if (value !== bible.profile[field]) update(current => ({ ...current, bible: { ...current.bible, profile: { ...current.bible.profile, [field]: value } } })); }}/>
              : <input disabled={bible.status === 'locked'} key={bible.profile[field]} defaultValue={bible.profile[field]} maxLength={field === 'title' ? 100 : 500}
                onBlur={event => { const value = event.currentTarget.value.trim(); if (value !== bible.profile[field] && (field !== 'title' || value)) update(current => ({ ...current, bible: { ...current.bible, profile: { ...current.bible.profile, [field]: value } } })); }}/>
            }
          </label>)}
          <NumberField text="Target minutes" value={bible.profile.targetMinutes} min={1} max={90} onChange={value => {
            if (bible.status !== 'locked') update(current => ({ ...current, bible: { ...current.bible, profile: { ...current.bible.profile, targetMinutes: value } } }));
          }}/>
          <label>Decision<Select aria="Film brief status" value={bible.status} options={creativeStatuses} onChange={status => update(current => ({ ...current, bible: { ...current.bible, status } }))}/></label>
        </div>
      </details>
      <details className="film-section" open><summary>Scene board</summary>
        <div className="scene-board">
          {bible.scenes.map((scene, index) => <article key={scene.id} className="scene-card" onDragOver={event => event.preventDefault()}
            onDrop={event => { event.preventDefault(); reorder(dragId, scene.id); setDragId(''); }}>
            <header><span draggable className="drag-handle" title="Drag to reorder" onDragStart={event => { setDragId(scene.id); event.dataTransfer.setData('text/plain', scene.id); }}><GripVertical size={17}/></span>
              <button className="scene-card-title" onClick={() => setFocused(focused === scene.id ? undefined : scene.id)} aria-expanded={focused === scene.id}>{index + 1}. {scene.title}<small>{scene.location || scene.environment} · {scene.seconds}s</small></button>
              <IconButton title="Move scene up" disabled={!index} onClick={() => reorder(scene.id, bible.scenes[index - 1].id)}><ArrowUp size={15}/></IconButton>
              <IconButton title="Move scene down" disabled={index === bible.scenes.length - 1} onClick={() => reorder(scene.id, bible.scenes[index + 1].id)}><ArrowDown size={15}/></IconButton>
            </header>
            {(scene.summary || scene.cast.length > 0) && <p>{scene.summary}<small>{scene.cast.map(id => project.characters.find(character => character.id === id)?.name ?? id).join(', ')}</small></p>}
            <div className="scene-card-status"><Select aria={`Status for ${scene.title}`} value={scene.status} options={creativeStatuses} onChange={status => patchScene(scene.id, { status })}/>
              <small>{production.graph.find(record => record.sceneId === scene.id)?.diagnostics.length
                ? 'Needs production review' : production.graph.some(record => record.sceneId === scene.id) ? 'Compiled' : 'Outline'}</small></div>
            {focused === scene.id && <div className="film-fields">
              {sceneFields.map(field => <label key={field}>{sceneLabels[field]}<input disabled={scene.status === 'locked'} key={scene[field]} defaultValue={scene[field]}
                maxLength={field === 'title' ? 100 : 500} onBlur={event => { const value = event.currentTarget.value.trim(); if (value !== scene[field] && (field !== 'title' || value)) patchScene(scene.id, { [field]: value }); }}/></label>)}
              <label>Environment<Select aria="Scene environment" value={scene.environment} options={environments} onChange={environment => { if (scene.status !== 'locked') patchScene(scene.id, { environment }); }}/></label>
              <NumberField text="Estimated seconds" min={1} max={180} value={scene.seconds} onChange={seconds => { if (scene.status !== 'locked') patchScene(scene.id, { seconds }); }}/>
              <fieldset className="film-field-wide"><legend>Cast</legend>{project.characters.map(character => <label className="check" key={character.id}>
                <input type="checkbox" disabled={scene.status === 'locked'} checked={scene.cast.includes(character.id)} onChange={event => patchScene(scene.id, { cast: event.target.checked ? [...scene.cast, character.id] : scene.cast.filter(id => id !== character.id) })}/>{character.name}</label>)}</fieldset>
              <div className="film-field-wide film-tools">
                <button className="quiet" disabled={scene.status === 'locked' || bible.scenes.length >= 30} onClick={() => {
                  const second = { ...scene, id: uid(), title: `${scene.title.slice(0, 85)} continued`, seconds: Math.max(1, Math.round(scene.seconds / 2)), status: 'proposed' as const };
                  changeScenes(scenes => scenes.flatMap(item => item.id === scene.id ? [{ ...item, seconds: second.seconds }, second] : [item]));
                }}>Split scene</button>
                <button className="quiet" disabled={scene.status === 'locked' || !bible.scenes[index + 1] || bible.scenes[index + 1]?.status === 'locked'} onClick={() => {
                  const next = bible.scenes[index + 1];
                  changeScenes(scenes => scenes.filter(item => item.id !== next.id).map(item => item.id === scene.id ? {
                    ...item, summary: `${item.summary} ${next.summary}`.trim().slice(0, 500), cast: [...new Set([...item.cast, ...next.cast])], seconds: Math.min(180, item.seconds + next.seconds)
                  } : item));
                }}>Merge with next</button>
                <IconButton title="Remove outline scene" disabled={scene.status === 'locked'} onClick={() => changeScenes(scenes => scenes.filter(item => item.id !== scene.id))}><Trash2 size={16}/></IconButton>
              </div>
            </div>}
          </article>)}
          <button className="quiet" disabled={bible.scenes.length >= 30} onClick={() => {
            const scene = makeStoryScene(`Scene ${bible.scenes.length + 1}`);
            changeScenes(scenes => [...scenes, scene]); setFocused(scene.id);
          }}><Plus size={16}/>Add scene</button>
        </div>
      </details>
      <details className="film-section"><summary>Character notes</summary>
        <div className="film-fields">
          {bible.characters.map(character => <fieldset key={character.characterId} className="film-field-wide"><legend>{project.characters.find(item => item.id === character.characterId)?.name ?? character.characterId}</legend>
            {(['description', 'personality', 'motivation', 'relationships', 'speakingStyle', 'mannerisms'] as const).map(field => <label key={field}>{field.replace(/([a-z])([A-Z])/g, '$1 $2')}<input disabled={character.status === 'locked'} key={character[field]} defaultValue={character[field]} maxLength={500}
              onBlur={event => { const value = event.currentTarget.value; if (value !== character[field]) update(current => ({ ...current, bible: { ...current.bible, characters: current.bible.characters.map(item => item.characterId === character.characterId ? { ...item, [field]: value } : item) } })); }}/></label>)}
            <label>Voice<Select aria="Character voice" value={character.voice} options={['warm', 'bright', 'deep']} onChange={voice => { if (character.status !== 'locked') update(current => ({ ...current, bible: { ...current.bible, characters: current.bible.characters.map(item => item.characterId === character.characterId ? { ...item, voice } : item) } })); }}/></label>
            <label>Decision<Select aria="Character decision" value={character.status} options={creativeStatuses} onChange={status => update(current => ({ ...current, bible: { ...current.bible, characters: current.bible.characters.map(item => item.characterId === character.characterId ? { ...item, status } : item) } }))}/></label>
          </fieldset>)}
          <label>Add from the cast<Select aria="New character notes" value={person} options={['', ...project.characters.filter(character => !bible.characters.some(item => item.characterId === character.id)).map(character => character.id)]}
            onChange={setPerson} render={id => project.characters.find(character => character.id === id)?.name ?? 'Choose character'}/></label>
          <button className="quiet" disabled={!person} onClick={() => {
            update(current => ({ ...current, bible: { ...current.bible, characters: [...current.bible.characters, {
              characterId: person, description: '', personality: '', motivation: '', relationships: '', speakingStyle: '', voice: 'warm', mannerisms: '', status: 'proposed'
            }] } })); setPerson('');
          }}><Plus size={16}/>Add character notes</button>
        </div>
      </details>
      <details className="film-section"><summary>Worlds and atmosphere</summary><div className="film-fields">
        {bible.worlds.map(world => <fieldset key={world.id} className="film-field-wide"><legend>{world.name}</legend>
          {(['name', 'description', 'atmosphere', 'layout'] as const).map(field => <label key={field}>{field}<input disabled={world.status === 'locked'} key={world[field]} defaultValue={world[field]} maxLength={field === 'name' ? 100 : 500}
            onBlur={event => { const value = event.currentTarget.value; if (value !== world[field] && (field !== 'name' || value.trim())) update(current => ({ ...current, bible: { ...current.bible, worlds: current.bible.worlds.map(item => item.id === world.id ? { ...item, [field]: value } : item) } })); }}/></label>)}
          <label>Environment<Select aria="World environment" value={world.environment} options={environments} onChange={environment => {
            if (world.status !== 'locked') update(current => ({ ...current, bible: { ...current.bible, worlds: current.bible.worlds.map(item => item.id === world.id ? { ...item, environment } : item) } }));
          }}/></label>
          <label>Decision<Select aria="World decision" value={world.status} options={creativeStatuses} onChange={status => update(current => ({ ...current, bible: { ...current.bible, worlds: current.bible.worlds.map(item => item.id === world.id ? { ...item, status } : item) } }))}/></label>
        </fieldset>)}
        <button className="quiet" disabled={bible.worlds.length >= 30} onClick={() => update(current => ({ ...current, bible: { ...current.bible, worlds: [...current.bible.worlds,
          { id: uid(), name: 'New location', environment: 'Living room', description: '', atmosphere: '', layout: '', status: 'proposed' }] } }))}><Plus size={16}/>Add world</button>
      </div></details>
    </section>
    <aside className="film-side creative-side">
      <header><Sparkles size={17}/><h2>Creative collaborator</h2></header>
      <div className="creative-messages">
        {production.conversation.map((message, index) => <article key={index} data-role={message.role}><strong>{message.role === 'user' ? 'You' : 'Toonroom'}</strong><p>{message.text}</p></article>)}
        {!production.conversation.length && <button className="quiet" onClick={loadExample}>Open The Missing Rent Money</button>}
        {proposal && <article><strong>Proposed Story Bible</strong><p>{proposal.profile.logline}</p><ul>{proposal.scenes.map(scene => <li key={scene.id}>{scene.title}</li>)}</ul>
          <div className="film-tools"><button className="primary" onClick={() => { update(current => ({ ...current, bible: acceptBibleProposal(current.bible, proposal) })); setProposal(undefined); }}>Add as proposals</button>
            <button className="quiet" onClick={() => setProposal(undefined)}>Reject</button></div>
        </article>}
      </div>
      {error && <p className="film-error" role="alert">{error}</p>}
      <form onSubmit={event => { event.preventDefault(); void send(); }}>
        {canUseAI(ai) ? <><label htmlFor="story-prompt">Develop an idea</label><textarea id="story-prompt" value={prompt} maxLength={6000} onChange={event => setPrompt(event.target.value)} placeholder="Two friends accidentally spend their rent money…"/>
          <button className="primary" disabled={busy || !prompt.trim()}>{busy ? 'Thinking…' : 'Send'}</button></> : <p className="small-text">Connect a model in AI settings to brainstorm here. The Story Bible and screenplay are editable anytime.</p>}
      </form>
    </aside>
  </main>;
}
