import { useState } from 'react';
import { Clapperboard, Copy, Download, FolderOpen, Moon, Plus, Sun, Trash2 } from 'lucide-react';
import type { Welcome as PreviousWelcome } from './ParkedWelcome.tsx';
import { makeProject } from '../engine/presets.ts';
import { ProjectThumbnail } from './ProjectThumbnail.tsx';
import { NativeCharacterPreview } from './NativeCharacterPreview.tsx';
const cast = makeProject().characters;
export function Welcome(props: Omit<Parameters<typeof PreviousWelcome>[0], 'createAI'>) {
  const [query, setQuery] = useState('');
  return <main className="simple-home">
    <header><button className="home-wordmark" onClick={props.openLanding}><Clapperboard size={24}/>toonroom<span>.</span></button><div className="home-tools"><button className="quiet" onClick={props.openProjects}><FolderOpen size={17}/>My cartoons</button><button className="icon-button" aria-label="Toggle theme" onClick={props.toggleTheme}>{props.theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button></div></header>
    {props.screen==='landing'?<section className="simple-hero">
      <div className="hero-copy"><span className="eyebrow">YOUR VOICE. THEIR WORLD.</span><h1>Small characters.<br/><em>Big stories.</em></h1><p>Upload a background. Add characters.<br/>Give them voices. Make them act.</p><button className="primary create-cartoon" onClick={props.createManual}><Plus size={20}/>Create a Cartoon</button><small>Start instantly · No account needed</small></div>
      <div className="hero-cartoon" aria-label="Sbu and Zee cartoon characters"><div className="hero-speech">Bro, where’s my lunch?</div><div className="hero-cast">{cast.slice(0,2).map((character,index)=><NativeCharacterPreview key={character.id} character={character} view="three-quarter" action={index?'laugh':'point'} expression={index?'happy':'surprised'} scale={1} flip={!!index}/>)}</div><div className="hero-timeline"><span>Voice</span><i/><i/><b/><span>Action</span><b/><i/></div></div>
    </section>:<section className="simple-projects"><div className="projects-heading"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h1>My cartoons</h1></div><button className="primary" onClick={props.createManual}><Plus size={18}/>Create a Cartoon</button></div>
      <div className="projects-tools"><input aria-label="Search cartoons" placeholder="Find a cartoon…" value={query} onChange={e=>setQuery(e.target.value)}/><button className="quiet" onClick={props.restore}>Import backup</button></div>
      <div className="simple-project-grid">{props.items.filter(item=>item.project.name.toLowerCase().includes(query.toLowerCase())).map(({project})=><article key={project.id}><button className="project-cover" onClick={()=>props.openProject(project)}><ProjectThumbnail project={project}/></button><input aria-label={`Rename ${project.name}`} key={project.name} defaultValue={project.name} maxLength={100} onBlur={e=>{if(e.target.value.trim()&&e.target.value.trim()!==project.name)void props.rename(project,e.target.value.trim());}}/><div className="project-card-foot"><small>{project.scenes.length} scene{project.scenes.length===1?'':'s'} · {project.scenes.reduce((n,s)=>n+s.duration,0)}s</small><button className="icon-button" title="Duplicate cartoon" onClick={()=>props.duplicate(project)}><Copy size={15}/></button><button className="icon-button" title="Download project backup" onClick={()=>props.backup(project)}><Download size={15}/></button><button className="icon-button" title="Delete cartoon" onClick={()=>props.remove(project)}><Trash2 size={15}/></button></div></article>)}</div>
      {!props.items.length&&<div className="home-empty"><Clapperboard size={40}/><h2>Your first cartoon starts here.</h2><p>Two characters and your voice can tell a whole story.</p><button className="primary" onClick={props.createManual}>Create a Cartoon</button></div>}
    </section>}
    <footer>Your voice. Your film. Your imagination. <span>Made in Toonroom.</span></footer>
  </main>;
}
