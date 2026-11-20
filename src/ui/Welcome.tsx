import { useState } from 'react';
import { ArrowRight, Clapperboard, Copy, Film, FolderOpen, Plus, Sparkles,
  Trash2, WandSparkles, X, Star, Pencil, Clock3, Layers3, Moon, Sun, Search,
  Check, Play, SlidersHorizontal, ChevronRight } from 'lucide-react';
import { makeProject } from '../engine/presets.ts';
import type { Project } from '../engine/schema.ts';
import type { SavedProject, ProjectCollection, EditorSession } from '../services/projects.ts';
import { projectPreviewInfo, ProjectThumbnail } from './ProjectThumbnail.tsx';

type Organize=(id:string,changes:{favorite?:boolean;collection?:ProjectCollection})=>void;
const collectionLabels:Record<ProjectCollection,string>={
  ideas:'Ideas','in-production':'In production',finished:'Finished'
};
const publicExample=makeProject(true);
const clipTimes=['20%','39%','56%','83%'];
const tracks=['Camera','Performance','Dialogue','Music'];
export function Welcome({screen,items,lastSession,openProjects,openLanding,openProject,
  createManual,createAI,duplicate,rename,organize,remove,openExample,theme,toggleTheme}:{
  screen:'landing'|'projects';items:SavedProject[];lastSession?:EditorSession;
  openProjects:()=>void;openLanding:()=>void;openProject:(project:Project)=>void;
  createManual:()=>void;createAI:(prompt:string)=>void;
  duplicate:(project:Project)=>void;rename:(project:Project,name:string)=>void|Promise<void>;
  organize:Organize;remove:(project:Project)=>void;openExample:()=>void;
  theme:'dark'|'light';toggleTheme:()=>void;
}){
  const [creating,setCreating]=useState<'choose'|'ai'|null>(null);
  const [idea,setIdea]=useState('');
  const [search,setSearch]=useState('');
  const [sort,setSort]=useState<'recent'|'title'|'longest'>('recent');
  // Render only a small page of thumbnail SVGs to keep large libraries fast.
  const [visibleCount,setVisibleCount]=useState(20);
  const [collection,setCollection]=useState<'all'|'favorites'|ProjectCollection>('all');
  const [renaming,setRenaming]=useState<Project>();
  const [newName,setNewName]=useState('');
  const [deleting,setDeleting]=useState<Project>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const resume=lastSession&&items.find(item=>item.project.id===lastSession.projectId);
  const filtered=items.filter(item=>{
    const info=projectPreviewInfo(item.project);
    const matches=!search.trim()||[item.project.name,info.scene.environment,
      ...item.project.characters.map(c=>c.name)].some(value=>value.toLowerCase().includes(search.toLowerCase()));
    return matches&&(collection==='all' ||
      collection==='favorites'&&item.favorite ||
      item.collection===collection);
  }).sort((a,b)=>sort==='recent'?b.updated-a.updated:sort==='longest'?
    projectPreviewInfo(b.project).seconds-projectPreviewInfo(a.project).seconds:
    a.project.name.localeCompare(b.project.name));
  async function commitRename(){
    if(!renaming||busy)return;
    const name=newName.trim();
    if(!name||name.length>100){setError('Choose a title between 1 and 100 characters.');return;}
    setBusy(true);setError('');
    try{await rename(renaming,name);setRenaming(undefined);}
    catch(e){setError(e instanceof Error?e.message:'Could not rename your movie.');}
    finally{setBusy(false);}
  }
  function closeModal(){if(busy)return;setCreating(null);setRenaming(undefined);setDeleting(undefined);setError('');}
  const start=()=>{setError('');setCreating('choose');};
  return <div className="toonroom-home">
    <header className="home-nav">
      <button className="home-logo" onClick={openLanding} aria-label="Toonroom home">
        <span className="home-logo-mark"><Clapperboard size={22}/></span>
        <span>toonroom<span className="home-dot">.</span></span>
      </button>
      <nav className="home-nav-actions" aria-label="Main navigation">
        <button className={screen==='projects'?'quiet current':'quiet'} onClick={openProjects}>
          <FolderOpen size={16}/> <span>Projects</span>
        </button>
        <button className="home-theme-toggle quiet" aria-label={theme==='dark'?'Switch to light theme':'Switch to dark theme'}
          title={theme==='dark'?'Light mode':'Dark mode'} onClick={toggleTheme}>
          {theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}
        </button>
        <button className="primary home-new-button" onClick={start}><Plus size={16}/> New movie</button>
      </nav>
    </header>
    {screen==='landing'?<main className="home-landing">
      <section className="home-hero">
        <div className="home-kicker"><span className="home-kicker-dot"/> YOUR STORY. YOUR ANIMATION STUDIO.</div>
        <h1>Imagine a cartoon.<br/><em>Create your movie.</em></h1>
        <p>Bring your characters to life. Write the story, direct every moment, create voices and turn your imagination into an animated film — no animation experience required.</p>
        <div className="home-hero-actions">
          <button className="primary" onClick={start}>Get started <ArrowRight size={18}/></button>
          {resume?<button className="quiet" onClick={()=>openProject(resume.project)}>
            <Play size={17}/> Resume {resume.project.name.length>18?resume.project.name.slice(0,18)+'…':resume.project.name}
          </button>:<button className="quiet" onClick={openExample}><Play size={17}/> Explore a sample movie</button>}
        </div>
        <div className="home-proof"><span><Check size={14}/> Characters that act</span>
          <span><Check size={14}/> AI that actually edits</span>
          <span><Check size={14}/> Every frame yours</span></div>
      </section>
      <section className="home-showreel" aria-label="Preview of Toonroom movie editor">
        <div className="home-showreel-heading">
          <span><span className="home-live-pulse"/> THE MOVIE STUDIO</span>
          <span>SCENE 01 / STORYBOARD</span>
          <span className="home-editor-dots"><i/><i/><i/></span>
        </div>
        <div className="home-showreel-screen">
          <ProjectThumbnail project={publicExample}/>
          <div className="home-scene-caption">
            <span className="home-camera-mark"><Film size={12}/> CAM A · TAKE 01</span>
            <strong>Two characters. Endless possibilities.</strong>
          </div>
          <div className="home-speech-bubble">“Okay, but hear me out…”</div>
          <div className="home-stage-play"><Play size={24} fill="currentColor"/></div>
        </div>
        <div className="home-showreel-timeline">
          <div className="home-timeline-ruler"><span>00:00</span><span>00:05</span><span>00:10</span><span>00:15</span></div>
          {tracks.map((track,index)=><div className="home-showreel-track" key={track}>
            <span>{track}</span>
            <div className="home-track-lane"><i style={{width:clipTimes[index],left:'6%'}} className={`home-track-clip tone-${index}`}/>
              {index===0&&<i className="home-track-clip tone-0" style={{width:'24%',left:'62%'}}/>}
            </div>
          </div>)}
          <div className="home-playhead"/>
        </div>
      </section>
      <section className="home-story-steps" aria-label="How Toonroom works">
        <div className="home-section-heading"><span className="home-kicker">FROM IDEA TO PREMIERE</span>
          <h2>You bring the imagination.<br/>Toonroom gives it motion.</h2></div>
        <div className="home-steps-grid">
          <article><span className="home-step-icon"><Sparkles size={25}/></span><span className="home-step-number">01 · CREATE</span>
            <h3>Dream up a world</h3><p>Invent characters, choose locations and explore your story with an AI creative partner.</p></article>
          <article><span className="home-step-icon"><Pencil size={25}/></span><span className="home-step-number">02 · WRITE</span>
            <h3>Give them a story</h3><p>Write natural dialogue, shape scenes and make a screenplay that sounds like you.</p></article>
          <article><span className="home-step-icon"><Film size={25}/></span><span className="home-step-number">03 · DIRECT</span>
            <h3>Bring it to life</h3><p>Direct eyes, expressions, movement, cameras, voices and sound on a real timeline.</p></article>
        </div>
        <div className="home-bottom-cta"><div><strong>Your next cartoon starts with one idea.</strong>
          <span>Make the first scene today.</span></div>
          <button className="primary" onClick={start}>Create a movie <ArrowRight size={17}/></button></div>
      </section>
    </main>:<main className="home-projects">
      <div className="home-projects-head">
        <div><span className="home-kicker">YOUR FILM LIBRARY</span><h1>Your movies<span className="home-dot">.</span></h1>
          <p>Every story has a home. Pick up where you left off.</p></div>
        <button className="primary" onClick={start}><Plus size={16}/> New movie</button>
      </div>
      {resume&&<button className="home-resume" onClick={()=>openProject(resume.project)}>
        <span className="home-resume-symbol"><Play size={19} fill="currentColor"/></span>
        <span><strong>Continue your last session</strong><small>{resume.project.name} · {lastSession?.workspace==='direct'?'Directing':
          lastSession?.workspace==='write'?'Writing':'Developing'} · Scene ${Math.max(1,resume.project.scenes.findIndex(s=>s.id===lastSession?.sceneId)+1)}</small></span>
        <ChevronRight size={20}/>
      </button>}
      <div className="home-library-toolbar">
        <div className="home-collection-tabs" role="group" aria-label="Project collections">
          {(['all','favorites','ideas','in-production','finished'] as const).map(tab=><button key={tab} type="button"
            aria-pressed={collection===tab} className={collection===tab?'active':''}
            onClick={()=>{setCollection(tab);setVisibleCount(20);}}>{tab==='all'?'All movies':tab==='favorites'?'Starred':collectionLabels[tab]}
            {tab==='all'&&<small>{items.length}</small>}</button>)}
        </div>
        <div className="home-filter">
          <label className="home-search"><Search size={17}/><input aria-label="Search movies" value={search}
            placeholder="Find a movie, scene or character…" onChange={event=>{setSearch(event.target.value);setVisibleCount(20);}}/></label>
          <label className="home-sort"><SlidersHorizontal size={15}/><select aria-label="Sort movies"
            value={sort} onChange={event=>{setSort(event.target.value as typeof sort);setVisibleCount(20);}}>
            <option value="recent">Recently edited</option><option value="title">Title A–Z</option>
            <option value="longest">Longest first</option>
          </select></label>
        </div>
      </div>
      <div className="home-project-grid">
        <button className="home-project-create" onClick={start}><span className="home-create-icon"><Plus size={28}/></span>
          <strong>Start something new</strong><small>An empty canvas, a whole new world.</small></button>
        {filtered.slice(0,visibleCount).map(item=>{
          const {project,updated}=item,info=projectPreviewInfo(project);
          return <article className="home-project-card" key={project.id}>
            <button className="home-project-cover" onClick={()=>openProject(project)}
              aria-label={`Open ${project.name}`}><ProjectThumbnail project={project} compact/>
              <span className="home-project-cover-badge"><Film size={12}/>{info.sceneCount} scene{info.sceneCount!==1?'s':''}</span>
            </button>
            <div className="home-project-card-body">
              <div className="home-card-title-row">
                <button className="home-project-name" onClick={()=>openProject(project)}>
                  <strong>{project.name}</strong><small>{info.scene.environment}</small></button>
                <button className={item.favorite?'home-favorite is-favorite':'home-favorite'} type="button"
                  title={item.favorite?'Unstar movie':'Star movie'}
                  aria-label={item.favorite?`Unstar ${project.name}`:`Star ${project.name}`}
                  aria-pressed={Boolean(item.favorite)}
                  onClick={()=>organize(project.id,{favorite:!item.favorite})}><Star size={17} fill={item.favorite?'currentColor':'none'}/></button>
              </div>
              <div className="home-project-metadata"><span><Clock3 size={13}/>{Math.round(info.seconds)}s</span>
                <span><Layers3 size={13}/>{info.clipCount} clips</span>
                <span>Edited {new Date(updated).toLocaleDateString()}</span></div>
              <div className="home-project-card-footer">
                <label className="home-card-collection"><span className="sr-only">Organize {project.name}</span>
                  <select aria-label={`Collection for ${project.name}`} value={item.collection??''}
                    onChange={event=>organize(project.id,{collection:event.target.value as ProjectCollection})}>
                    <option value="">Unsorted</option>
                    {(Object.keys(collectionLabels) as ProjectCollection[]).map(k=>
                      <option key={k} value={k}>{collectionLabels[k]}</option>)}
                  </select></label>
                <div className="home-card-actions">
                  <button className="quiet" title={`Rename ${project.name}`}
                    aria-label={`Rename ${project.name}`} onClick={()=>{setRenaming(project);setNewName(project.name);setError('');}}><Pencil size={16}/></button>
                  <button className="quiet" title={`Duplicate ${project.name}`}
                    aria-label={`Duplicate ${project.name}`} onClick={()=>duplicate(project)}><Copy size={16}/></button>
                  <button className="quiet home-delete" title={`Delete ${project.name}`}
                    aria-label={`Delete ${project.name}`} onClick={()=>setDeleting(project)}><Trash2 size={16}/></button>
                </div>
              </div>
            </div>
          </article>;
        })}
      </div>
      {filtered.length>visibleCount&&<button className="quiet home-load-more"
        onClick={()=>setVisibleCount(count=>count+20)}>
        Show more movies ({filtered.length-visibleCount} remaining)
      </button>}
      {!filtered.length&&items.length>0&&<div className="home-empty-projects">
        <Search size={27}/><h2>No movies found</h2><p>Try another search or collection to find your project.</p>
        <button className="quiet" onClick={()=>{setSearch('');setCollection('all');}}>Show all movies</button></div>}
      {!items.length&&<div className="home-library-empty">
        <span>Every great film starts with a scene.</span>
        <button className="quiet" onClick={openExample}><Film size={17}/> Explore a sample movie</button></div>}
    </main>}
    {(creating||renaming||deleting)&&<div className="home-create-shade" role="presentation"
      onMouseDown={event=>{if(event.target===event.currentTarget)closeModal();}}>
      <section className="home-create-dialog" role="dialog" aria-modal="true"
        aria-label={creating?'New movie':renaming?'Rename movie':'Delete movie'}>
        <div className="home-create-heading"><h2>{creating==='ai'?'Describe your movie':creating==='choose'?'Create something wonderful':
          renaming?'Rename movie':'Delete this movie?'}</h2>
          <button className="quiet" onClick={closeModal} aria-label="Close dialog"><X size={18}/></button>
        </div>
        {creating==='choose'&&<div className="home-create-options">
          <button onClick={()=>setCreating('ai')}><span className="create-option-symbol"><WandSparkles size={27}/></span>
            <strong>Build with AI</strong><span>Start with an idea. Develop characters, scenes and the story together.</span><ArrowRight size={18}/></button>
          <button onClick={()=>{setCreating(null);createManual();}}><span className="create-option-symbol"><Pencil size={27}/></span>
            <strong>Start Blank</strong><span>Open a screenplay immediately, or jump into the visual director.</span><ArrowRight size={18}/></button>
        </div>}
        {creating==='ai'&&<form className="home-create-ai" onSubmit={event=>{event.preventDefault();
          if(idea.trim().length>=8){createAI(idea.trim());setCreating(null);setIdea('');}}}>
          <label htmlFor="movie-idea">What happens in your movie?</label>
          <textarea autoFocus id="movie-idea" value={idea} maxLength={3000}
            onChange={event=>setIdea(event.target.value)}
            placeholder="Two friends lose their rent money and have one afternoon to find it before the landlord arrives…"/>
          <p>Nothing is final. You can edit your characters, story and every scene later.</p>
          <button className="primary" type="submit" disabled={idea.trim().length<8}>
            Develop my movie <ArrowRight size={16}/></button>
        </form>}
        {renaming&&<form className="home-create-ai" onSubmit={event=>{event.preventDefault();void commitRename();}}>
          <label htmlFor="new-movie-title">Movie title</label>
          <input id="new-movie-title" autoFocus maxLength={100} value={newName}
            onChange={event=>setNewName(event.target.value)}/>
          {!!error&&<p className="film-error" role="alert">{error}</p>}
          <div className="home-dialog-actions"><button type="button" className="quiet" onClick={closeModal}>Cancel</button>
            <button className="primary" disabled={busy||!newName.trim()} type="submit">
              {busy?'Saving…':'Save title'} <Check size={16}/></button></div>
        </form>}
        {deleting&&<div className="home-create-ai"><p>Delete <strong>{deleting.name}</strong> from your saved movies?
          This removes its scenes, characters and project data. This cannot be undone.</p>
          <div className="home-dialog-actions"><button className="quiet" onClick={closeModal}>Keep movie</button>
            <button className="danger" onClick={()=>{remove(deleting);setDeleting(undefined);}}><Trash2 size={16}/> Delete movie</button></div>
        </div>}
      </section>
    </div>}
  </div>;
}
