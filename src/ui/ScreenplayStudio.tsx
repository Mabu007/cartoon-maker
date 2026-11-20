import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Clapperboard, Download, Maximize2, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { identifyCues } from '../engine/filmmakerAI.ts';
import { fromOutline, makeLine, makeStoryScene, reviseScript } from '../engine/production.ts';
import { environments, label, scriptTypes, uid, type Production, type Project, type ScriptLine, type ScriptSceneData } from '../engine/schema.ts';
import { canUseAI, filmmaker, type AiAccess } from '../services/filmmaker.ts';
import { download, fileName } from '../services/projectExchange.ts';
import { useStudio } from '../studio.ts';
import { CueEditor, cueAssets } from './CueEditor.tsx';
import { ScriptEditor } from './ScriptEditor.tsx';
import { IconButton, Select } from './shared.tsx';

type Update = (change: (current: Production) => Production) => void;
const hasCharacterSlug = (scene: ScriptSceneData, index: number) => {
  const previous = scene.elements[index - 1];
  const slug = previous?.type === 'parenthetical' ? scene.elements[index - 2] : previous;
  return slug?.type === 'character';
};
const formattedText = (line: ScriptLine) => {
  if (line.type === 'character') return ' '.repeat(24) + line.text.toUpperCase();
  if (line.type === 'dialogue') return ' '.repeat(12) + line.text;
  if (line.type === 'parenthetical') return ' '.repeat(17) + '(' + line.text.replace(/^\(|\)$/g, '') + ')';
  if (['scene-heading', 'shot', 'transition'].includes(line.type)) return line.text.toUpperCase();
  return line.text;
};

export function ScreenplayStudio({ project, production, update, ai, approve, generate, direct, busy, initialScene, initialLine, autoDraft }: {
  project: Project; production: Production; update: Update; ai: AiAccess; approve: () => void; generate: () => void;
  direct:()=>void;busy: boolean; initialScene?: string; initialLine?: string; autoDraft?: boolean;
}) {
  const scenes = production.screenplay.scenes;
  const [sceneId, setSceneId] = useState(initialScene ?? '');
  const current = scenes.find(scene => scene.id === sceneId) ?? scenes[0];
  const [selected, setSelected] = useState(initialLine ?? '');
  const [jump, setJump] = useState<{ id: string } | undefined>(() => initialLine ? { id: initialLine } : undefined);
  const [focus, setFocus] = useState(false);
  const suggestedLocations = [...new Set([...environments, ...production.bible.scenes.map(scene => scene.location), ...production.bible.worlds.map(world => world.name)])].filter(Boolean);
  const [search, setSearch] = useState(''), [replacement, setReplacement] = useState('');
  const [prompt, setPrompt] = useState(''), [draftBusy, setDraftBusy] = useState(false), [error, setError] = useState('');
  const [draftScope, setDraftScope] = useState<'scene' | 'act' | 'sequence' | 'all'>(autoDraft ? 'all' : 'scene');
  const [draft, setDraft] = useState<{ base: ScriptSceneData[]; next: ScriptSceneData[] }>();
  const line = current?.elements.find(item => item.id === selected) ?? current?.elements[0];
  const matching = search.trim() ? scenes.flatMap(scene => scene.elements.filter(item => item.text.toLowerCase().includes(search.toLowerCase())).map(item => ({ scene, line: item }))) : [];
  const words = scenes.flatMap(scene => scene.elements).map(item => item.text.trim()).join(' ').split(/\s+/).filter(Boolean).length;
  const spokenWords = scenes.flatMap(scene => scene.elements).filter(item => item.type === 'dialogue').flatMap(item => item.text.trim().split(/\s+/)).filter(Boolean).length;
  const speaker = (id?: string) => project.characters.find(character => character.id === id)?.name;
  function updateScenes(change: (scenes: ScriptSceneData[]) => ScriptSceneData[]) {
    update(value => reviseScript(value, change(value.screenplay.scenes)));
  }
  function patchScene(patch: Partial<ScriptSceneData>) {
    updateScenes(items => items.map(scene => scene.id === current?.id ? { ...scene, ...patch } : scene));
  }
  function patchLine(value: ScriptLine) {
    if (!current) return;
    patchScene({ elements: current.elements.map(item => item.id === value.id ? value : item) });
  }
  function openLine(scene: ScriptSceneData, id: string) {
    setSceneId(scene.id); setSelected(id); setJump({ id });
  }
  function addScene() {
    const scene = fromOutline(makeStoryScene(`Scene ${scenes.length + 1}`));
    updateScenes(items => [...items, scene]); setSceneId(scene.id); setSelected('');
  }
  function moveScene(offset: number) {
    updateScenes(items => {
      const index = items.findIndex(item => item.id === current?.id);
      if (index < 0 || !items[index + offset]) return items;
      const ordered = [...items];
      [ordered[index], ordered[index + offset]] = [ordered[index + offset], ordered[index]];
      return ordered;
    });
  }
  function addLine() {
    if (!current || !line || current.elements.length >= 150) return;
    const next = makeLine('action');
    patchScene({ elements: current.elements.flatMap(item => item.id === line.id ? [item, next] : [item]) });
    openLine(current, next.id);
  }
  function replaceAll() {
    if (!search) return;
    const needle = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(needle, 'gi');
    updateScenes(items => items.map(scene => ({ ...scene, elements: scene.elements.map(item => ({ ...item, text: item.text.replace(pattern, () => replacement).slice(0, 400) })) })));
  }
  async function generateDraft() {
    if (!canUseAI(ai) || !current || draftBusy) return;
    setError(''); setDraftBusy(true);
    const outline = production.bible.scenes.find(scene => scene.id === current.id);
    const active = (status: string) => status === 'approved' || status === 'locked';
    const bible = { profile: active(production.bible.status) ? production.bible.profile : { title: production.bible.profile.title },
      characters: production.bible.characters.filter(character => active(character.status)),
      worlds: production.bible.worlds.filter(world => active(world.status)),
      scenes: production.bible.scenes.filter(scene => active(scene.status)) };
    const selected = scenes.filter(scene => draftScope === 'all' || scene.id === current.id ||
      ((draftScope === 'act' || draftScope === 'sequence') && Boolean(outline?.[draftScope]) &&
        bible.scenes.some(item => item.id === scene.id && item[draftScope] === outline?.[draftScope])));
    try {
      const next: ScriptSceneData[] = [];
      for (const scene of selected) {
        const result = await filmmaker(ai, 'screenplay', prompt.trim() || 'Write this scene from the approved outline.', {
          bible, outline: bible.scenes.find(item => item.id === scene.id), scene: { ...scene, set: scene.environment },
          previous: next.at(-1)?.elements.slice(-6),
          cast: project.characters.filter(character => scene.cast.includes(character.id)).map(({ id, name }) => ({ id, name })),
          props: cueAssets(project, scene).map(({ id, name, kind }) => ({ id, name, kind }))
        });
        if (useStudio.getState().project.id !== project.id) return;
        if (result.elements[0]?.type !== 'scene-heading') throw new Error('The draft is missing its scene heading. Try again with a shorter prompt.');
        const reusable = new Set<string>();
        next.push({ ...scene, elements: result.elements.map(item => {
          const same = scene.elements.find(line => line.type === item.type && line.text === item.text && !reusable.has(line.id));
          if (same) reusable.add(same.id);
          return { ...item, id: same?.id ?? uid(), directions: identifyCues(item.directions, same?.directions ?? [], uid) };
        }) });
      }
      setDraft({ base: selected, next });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not draft this screenplay.'); }
    finally { setDraftBusy(false); }
  }
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoDraft && current && canUseAI(ai) && !autoStarted.current) {
      autoStarted.current = true;
      void generateDraft();
    }
  });
  function applyDraft() {
    if (!draft) return;
    if (draft.base.some(base => JSON.stringify(scenes.find(scene => scene.id === base.id)) !== JSON.stringify(base))) {
      setError('The screenplay changed since this draft was generated. Generate a fresh revision.');
      return;
    }
    updateScenes(items => items.map(scene => draft.next.find(item => item.id === scene.id) ?? scene));
    setDraft(undefined); setPrompt('');
  }
  const remaining = production.bible.scenes.filter(scene => ['approved', 'locked'].includes(scene.status) && !scenes.some(item => item.id === scene.id));
  const exportText = () => {
    const script = [production.bible.profile.title, ...scenes.flatMap(scene => ['', ...scene.elements.flatMap((item, index) =>
      item.type === 'dialogue' && item.characterId && !hasCharacterSlug(scene, index) ? [`                        ${(speaker(item.characterId) ?? '').toUpperCase()}`, formattedText(item)] : [formattedText(item)]
    )])].join('\n');
    download(`${fileName(project.name)}.txt`, new Blob([script], { type: 'text/plain;charset=utf-8' }));
  };
  return <main className={`film-workspace write-workspace ${focus ? 'writing-focus' : ''}`}>
    <aside className="film-side screenplay-nav">
      <header><h2>Screenplay</h2><IconButton title="Add screenplay scene" disabled={scenes.length >= 30} onClick={addScene}><Plus size={17}/></IconButton></header>
      <div className="screenplay-nav-list">{scenes.map((scene,index)=><button key={scene.id}
        className={scene.id===current?.id?'active':''}
        onClick={()=>{setSceneId(scene.id);setSelected('');}}>
        <span>{index+1}.</span>{scene.title}</button>)}</div>
      {!!remaining.length && <button className="quiet" onClick={() => updateScenes(items => [...items, ...remaining.slice(0, 30 - items.length).map(fromOutline)])}>Import approved scenes</button>}
      <details><summary>Characters</summary>{project.characters.filter(character => scenes.some(scene => scene.cast.includes(character.id))).map(character => <button className="quiet" key={character.id} onClick={() => {
        const first = scenes.find(scene => scene.elements.some(item => item.characterId === character.id));
        const item = first?.elements.find(item => item.characterId === character.id);
        if (first && item) openLine(first, item.id);
      }}>{character.name}</button>)}</details>
      <details><summary>Search and replace</summary><div className="search-script">
        <label><Search size={14}/> Find<input aria-label="Find in screenplay" value={search} onChange={event => setSearch(event.target.value)}/></label>
        <label>Replace with<input aria-label="Replacement text" value={replacement} onChange={event => setReplacement(event.target.value)}/></label>
        <button className="quiet" disabled={!matching.length} onClick={replaceAll}>Replace {matching.length} matching lines</button>
        {matching.slice(0, 20).map(item => <button key={item.line.id} className="quiet" onClick={() => openLine(item.scene, item.line.id)}>{item.line.text.slice(0, 80)}</button>)}
      </div></details>
      {!!production.versions.length && <details><summary>Approved versions</summary>
        {production.versions.map(version => <button className="quiet" key={version.id} onClick={() => updateScenes(() => version.screenplay.scenes)}>Restore {new Date(version.date).toLocaleString()}</button>)}
      </details>}
    </aside>
    <section className="film-main screenplay-main">
      <header className="film-heading screenplay-heading"><div>
        <span className="film-step-label">STEP 2 · WRITE</span>
        <h1>{production.bible.profile.title || project.name}</h1>
        <p>{words} words · ≈ {Math.max(1,Math.ceil(words/180))} screenplay page(s) ·
          {Math.ceil(spokenWords/2.4)}s of dialogue</p>
        <small className="write-guidance">Write your story here. You can direct scenes at any time, even before the screenplay is finished.</small>
      </div>
        <div className="film-tools">
          <IconButton title={focus?'Exit writing focus':'Focus writing'} active={focus} onClick={()=>setFocus(value=>!value)}><Maximize2 size={16}/></IconButton>
          <button className="quiet" disabled={!scenes.length} onClick={exportText}><Download size={15}/>Text</button>
          <button className="quiet" disabled={!scenes.length} onClick={()=>window.print()}>Print / PDF</button>
          <button className="quiet" onClick={direct}><Clapperboard size={16}/>Open Director</button>
          <button className="primary" disabled={busy||!scenes.length} onClick={generate}
            title="Animate your screenplay. Existing manually directed clips are preserved where possible.">
            <Sparkles size={16}/>{busy?'Creating scenes…':'Animate screenplay'}</button>
        </div>
      </header>
      {!!error && <p className="film-error" role="alert">{error}</p>}
      {!current && <div className="film-empty"><h2>Start your screenplay</h2><button className="primary" onClick={addScene}><Plus size={16}/>Add screenplay scene</button></div>}
      {current && <>
        <div className="script-toolbar">
          {line && <><Select aria="Screenplay element type" value={line.type} options={scriptTypes} onChange={type => patchLine({ ...line, type })}/>
          {line.type === 'scene-heading' && <Select aria="Insert scene heading" value="" options={['', ...suggestedLocations]}
            render={id => id || 'Insert location heading'} onChange={id => { if (id) patchLine({ ...line, text: `INT. ${id.toUpperCase()} - DAY` }); }}/>}
          {(line.type === 'character' || line.type === 'dialogue') && <Select aria="Screenplay speaker" value={line.characterId ?? ''}
            options={['', ...current.cast]} render={id => speaker(id) ?? 'Choose speaker'} onChange={characterId => patchLine({
              ...line, characterId: characterId || undefined, text: line.type === 'character' && characterId ? (speaker(characterId) ?? characterId).toUpperCase() : line.text
            })}/>}</>}
          <IconButton title="Add screenplay line" onClick={addLine}><Plus size={17}/></IconButton>
          <span className="spacer"/>
          <small>Enter adds a line · Tab changes its type</small>
        </div>
        <div className="script-paper"><ScriptEditor key={current.id} lines={current.elements} onChange={elements => patchScene({ elements })}
          onSelect={setSelected} jumpTo={jump}/></div>
      </>}
    </section>
    <aside className="film-side screenplay-inspector">
      <header><Clapperboard size={17}/><h2>Scene direction</h2></header>
      {current && <div className="film-scroll">
        <details open><summary>{current.title}</summary><div className="film-fields one-column">
          <label>Title<input key={current.title} defaultValue={current.title} maxLength={100} onBlur={event => { const value = event.currentTarget.value.trim(); if (value && value !== current.title) patchScene({ title: value }); }}/></label>
          <label>Environment<Select aria="Screenplay environment" value={current.environment} options={environments} onChange={environment => patchScene({ environment })}/></label>
          <label>World layout<Select aria="World layout" value={current.setsFrom ?? ''} options={['', ...project.scenes.filter(scene => scene.id !== current.id).map(scene => scene.id)]}
            render={id => project.scenes.find(scene => scene.id === id)?.name ?? 'Environment preset'} onChange={id => patchScene({ setsFrom: id || undefined, environment: project.scenes.find(scene => scene.id === id)?.environment ?? current.environment })}/></label>
          <label className="check"><input type="checkbox" checked={current.continues} onChange={event => patchScene({ continues: event.target.checked })}/>Continue blocking from the previous scene</label>
          <fieldset><legend>Cast</legend>{project.characters.map(character => <label className="check" key={character.id}><input type="checkbox" checked={current.cast.includes(character.id)}
            onChange={event => patchScene({ cast: event.target.checked ? [...current.cast, character.id] : current.cast.filter(id => id !== character.id) })}/>{character.name}</label>)}</fieldset>
          <div className="film-tools">
            <IconButton title="Move screenplay scene up" onClick={() => moveScene(-1)} disabled={current.id === scenes[0]?.id}><ArrowUp size={16}/></IconButton>
            <IconButton title="Move screenplay scene down" onClick={() => moveScene(1)} disabled={current.id === scenes.at(-1)?.id}><ArrowDown size={16}/></IconButton>
            <IconButton title="Remove screenplay scene" onClick={() => updateScenes(items => items.filter(scene => scene.id !== current.id))}><Trash2 size={16}/></IconButton>
          </div>
        </div></details>
        {line && <details open><summary>{label(line.type)} cues</summary><CueEditor line={line} project={project} scene={current} change={patchLine}/></details>}
        <details open={Boolean(autoDraft || draft || draftBusy) || undefined}><summary>Draft with AI</summary><div className="film-fields one-column">
          <label>Scope<Select aria="Draft scope" options={['scene', 'act', 'sequence', 'all']} value={draftScope} onChange={setDraftScope}/></label>
          <label>Direction<textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={6000} placeholder="Extend the exchange without changing the reveal."/></label>
          <button className="primary" disabled={!canUseAI(ai) || draftBusy} onClick={() => void generateDraft()}><Sparkles size={16}/>{draftBusy ? 'Drafting…' : 'Draft screenplay'}</button>
          {!canUseAI(ai) && <p className="small-text">Connect a model in AI settings to draft with AI.</p>}
          {draft && <div className="script-diff"><h3>Review screenplay revision</h3>
            {draft.next.map((scene, index) => <details key={scene.id} open><summary>{scene.title}</summary><pre className="diff-before">{draft.base[index].elements.map(formattedText).join('\n')}</pre><pre className="diff-after">{scene.elements.map(formattedText).join('\n')}</pre></details>)}
            <div className="film-tools"><button className="primary" onClick={applyDraft}>Apply revision</button><button className="quiet" onClick={() => setDraft(undefined)}>Discard</button></div>
          </div>}
        </div></details>
      </div>}
    </aside>
    <section className="screenplay-print"><h1>{production.bible.profile.title}</h1>{scenes.map(scene => <div key={scene.id}>{scene.elements.map((item, index) => <div key={item.id}>
      {item.type === 'dialogue' && item.characterId && !hasCharacterSlug(scene, index) && <p data-type="character">{speaker(item.characterId)}</p>}
      <p data-type={item.type}>{item.text}</p>
    </div>)}</div>)}</section>
  </main>;
}
