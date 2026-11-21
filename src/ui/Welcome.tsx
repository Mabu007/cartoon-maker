import { useState } from 'react';
import { Copy, Download, FolderOpen, LogOut, Moon, Plus, Sun, Trash2 } from 'lucide-react';
import type { Welcome as PreviousWelcome } from './ParkedWelcome.tsx';
import { ProjectThumbnail } from './ProjectThumbnail.tsx';
import { SirvibeLanding } from './SirvibeLanding.tsx';
import type { Account } from '../services/cloud.ts';

type Original=Omit<Parameters<typeof PreviousWelcome>[0], 'createAI'>;
type Props=Original & {
  account:Account|null; authAvailable:boolean;
  login:(email:string,password:string,register:boolean,name?:string)=>Promise<void>;
  logout:()=>Promise<void>; enter:()=>void;
};
export function Welcome(props: Props){
  const [query,setQuery]=useState(''),[error,setError]=useState('');
  if(props.screen==='landing')return <SirvibeLanding account={props.account} available={props.authAvailable} login={props.login} enter={props.enter}/>;
  return <main className="simple-home sv-projects-home">
    <header>
      <button className="home-wordmark" onClick={props.openLanding}><img className="sv-project-logo" src="/sirvibe-logo.png" alt="" onError={event=>{event.currentTarget.hidden=true;}}/>SIRVIBE<span>.</span></button>
      <div className="home-tools">
        <span className="sv-project-account">{props.account?.displayName||props.account?.email||'Creator'}</span>
        <button className="quiet" onClick={props.openProjects}><FolderOpen size={17}/>My cartoons</button>
        <button className="quiet" onClick={()=>void props.logout().catch(err=>setError(err instanceof Error?err.message:'Could not log out.'))}><LogOut size={16}/>Sign out</button>
        <button className="icon-button" aria-label="Toggle theme" onClick={props.toggleTheme}>{props.theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>
      </div>
    </header>
    <section className="simple-projects">
      <div className="projects-heading"><div><span className="eyebrow">YOUR CREATOR UNIVERSE · FREE (BETA)</span><h1>My cartoons</h1><p>Every story starts somewhere. Pick up where you left off.</p></div><button className="primary" onClick={props.createManual}><Plus size={18}/>Create a Cartoon</button></div>
      <div className="projects-tools"><input aria-label="Search cartoons" placeholder="Find a cartoon…" value={query} onChange={e=>setQuery(e.target.value)}/><button className="quiet" onClick={props.restore}>Import backup</button></div>
      {error&&<p role="alert" className="form-error">{error}</p>}
      <div className="simple-project-grid">{props.items.filter(item=>item.project.name.toLowerCase().includes(query.toLowerCase())).map(({project})=><article key={project.id}>
        <button className="project-cover" onClick={()=>props.openProject(project)}><ProjectThumbnail project={project}/></button>
        <input aria-label={`Rename ${project.name}`} key={project.name} defaultValue={project.name} maxLength={100} onBlur={e=>{if(e.target.value.trim()&&e.target.value.trim()!==project.name)void props.rename(project,e.target.value.trim());}}/>
        <div className="project-card-foot"><small>{project.scenes.length} scene{project.scenes.length===1?'':'s'} · {project.scenes.reduce((n,s)=>n+s.duration,0)}s</small>
          <button className="icon-button" title="Duplicate cartoon" onClick={()=>props.duplicate(project)}><Copy size={15}/></button>
          <button className="icon-button" title="Download project backup" onClick={()=>props.backup(project)}><Download size={15}/></button>
          <button className="icon-button" title="Delete cartoon" onClick={()=>props.remove(project)}><Trash2 size={15}/></button></div>
      </article>)}</div>
      {!props.items.length&&<div className="home-empty"><Plus size={36}/><h2>Your first cartoon starts here.</h2><p>Two characters and your voice can tell a whole story.</p><button className="primary" onClick={props.createManual}>Create a Cartoon</button></div>}
    </section>
    <footer>Your voice. Your film. Your imagination. <span>Made in SIRVIBE · FREE (BETA)</span></footer>
  </main>;
}
