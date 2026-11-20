import { useState } from 'react';
import { ArrowRight, Clapperboard, Copy, Film, FolderOpen, Lightbulb, Plus, Sparkles, Trash2, WandSparkles, X } from 'lucide-react';
import type { Project } from '../engine/schema.ts';
import type { SavedProject } from '../services/projects.ts';

export function Welcome({ screen, items, openProjects, openProject, createManual, createAI, duplicate, remove, openExample }: {
  screen: 'landing' | 'projects'; items: SavedProject[];
  openProjects: () => void; openProject: (project: Project) => void;
  createManual: () => void; createAI: (prompt: string) => void;
  duplicate: (project: Project) => void; remove: (project: Project) => void; openExample: () => void;
}) {
  const [creating, setCreating] = useState<'choose' | 'ai' | null>(null);
  const [idea, setIdea] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const filtered = items.filter(item => item.project.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === 'recent' ? b.updated - a.updated : a.project.name.localeCompare(b.project.name));
  return <div className="toonroom-home">
    <header className="home-nav">
      <span className="home-logo"><Clapperboard size={22}/> Toonroom<span className="home-dot">.</span></span>
      <div className="home-nav-actions"><button className="quiet" onClick={openProjects}>Projects</button><button className="primary" onClick={() => setCreating('choose')}><Plus size={16}/> New movie</button></div>
    </header>
    {screen === 'landing' ? <main className="home-hero">
      <div className="home-kicker"><Sparkles size={15}/> YOUR CARTOON STUDIO</div>
      <h1>Your imagination.<br/><em>Your movie.</em></h1>
      <p>Write a story, generate voices and direct animated characters with AI. Make scenes, edit everything and export your cartoon — no animation experience needed.</p>
      <div className="home-hero-actions">
        <button className="primary" onClick={() => setCreating('choose')}>Start your movie <ArrowRight size={18}/></button>
        <button className="quiet" onClick={openProjects}><FolderOpen size={18}/> Open my projects</button>
      </div>
      <div className="home-preview" aria-label="Toonroom filmmaking preview">
        <div className="home-preview-top"><span><Film size={17}/> THE STUDIO</span><span>SCENE 01 · FIRST TAKE</span></div>
        <div className="home-preview-stage"><div className="home-preview-person person-left"><i/><b/></div><div className="home-preview-person person-right"><i/><b/></div><div className="home-preview-bubble">This is where our story begins.</div></div>
        <div className="home-preview-timeline">
          {['Camera','Actions','Dialogue','Music'].map((item, i) => <div key={item} className="home-preview-track"><span>{item}</span><i style={{ width: `${[80,62,38,90][i]}%`, backgroundColor: ['#7896f0','#dea575','#70c1a9','#ae87da'][i] }}/></div>)}
        </div>
      </div>
      <div className="home-feature-strip">
        <span><Lightbulb size={17}/> Dream it</span><span><Film size={17}/> Direct it</span><span><Sparkles size={17}/> Make it yours</span>
      </div>
    </main> : <main className="home-projects">
      <div className="home-projects-head"><div><div className="home-kicker">YOUR MOVIE LIBRARY</div><h1>My projects</h1><p>All your stories, in one place. Pick up exactly where you left off.</p></div><button className="primary" onClick={() => setCreating('choose')}><Plus size={16}/> New movie</button></div>
      <div className="home-filter"><input aria-label="Search projects" placeholder="Search movies…" value={search} onChange={event => setSearch(event.target.value)}/><select aria-label="Sort projects" value={sort} onChange={event => setSort(event.target.value as 'recent' | 'title')}><option value="recent">Recently edited</option><option value="title">Title A–Z</option></select></div>
      <div className="home-project-grid">
        <button className="home-project-create" onClick={() => setCreating('choose')}><Plus size={30}/><strong>Create a movie</strong><small>Let the magic begin</small></button>
        {filtered.map(({project,updated}) => <div className="home-project-card" key={project.id}>
          <button className="home-project-cover" onClick={() => openProject(project)} aria-label={`Open ${project.name}`}><Film size={37}/><span>{project.scenes.length} scene{project.scenes.length !== 1 ? 's' : ''}</span></button>
          <div className="home-project-card-row"><button className="home-project-name" onClick={() => openProject(project)}><strong>{project.name}</strong><small>Edited {new Date(updated).toLocaleDateString()}</small></button><button className="quiet" title={`Duplicate ${project.name}`} onClick={() => duplicate(project)}><Copy size={15}/></button><button className="quiet" title={`Delete ${project.name}`} onClick={() => remove(project)}><Trash2 size={15}/></button></div>
        </div>)}
      </div>
      {!filtered.length && items.length > 0 && <p className="small-text">No movies match your search.</p>}
      {!items.length && <button className="quiet" onClick={openExample}>Or explore a sample movie</button>}
    </main>}
    {creating && <div className="home-create-shade" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCreating(null); }}>
      <section className="home-create-dialog" role="dialog" aria-modal="true" aria-label="New movie">
        <div className="home-create-heading"><h2>{creating === 'ai' ? 'Describe your movie' : 'Start a new movie'}</h2><button className="quiet" onClick={() => setCreating(null)} aria-label="Close"><X size={18}/></button></div>
        {creating === 'choose' ? <div className="home-create-options">
          <button onClick={() => setCreating('ai')}><WandSparkles size={24}/><strong>Build with AI</strong><span>Describe your story, develop it and turn it into an editable screenplay.</span><ArrowRight size={18}/></button>
          <button onClick={() => { setCreating(null); createManual(); }}><Film size={24}/><strong>Start blank</strong><span>Write a script or jump straight into building your first scene.</span><ArrowRight size={18}/></button>
        </div> : <div className="home-create-ai">
          <label htmlFor="movie-idea">What movie do you want to make?</label>
          <textarea autoFocus id="movie-idea" value={idea} maxLength={3000} onChange={event => setIdea(event.target.value)} placeholder="A funny five-minute cartoon about two friends who lose their landlord's rent money…"/>
          <p>You'll be able to edit every detail before directing scenes.</p>
          <button className="primary" disabled={idea.trim().length < 8} onClick={() => { createAI(idea.trim()); setCreating(null); }}>Develop my movie <ArrowRight size={16}/></button>
        </div>}
      </section>
    </div>}
  </div>;
}
