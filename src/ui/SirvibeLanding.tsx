import { useState, type FormEvent } from 'react';
import { ArrowRight, AudioLines, Check, Clapperboard, Film, Heart, Layers3, LockKeyhole, Mic2, MousePointer2, Play, Sparkles, WandSparkles, X } from 'lucide-react';
import { characters } from '../engine/presets.ts';
import type { Account } from '../services/cloud.ts';
import { NativeCharacterPreview } from './NativeCharacterPreview.tsx';

type AuthMode='register'|'login';
const steps=[
  {number:'01',title:'Set the scene',copy:'Upload your own world or pick a starter scene. Bring your characters into it.'},
  {number:'02',title:'Direct the magic',copy:'Walk, run, sit, react and create entrances. Every move is yours to adjust.'},
  {number:'03',title:'Give it a voice',copy:'Record dialogue, upload songs and effects, then bring it all together on a real timeline.'}
];
const qualities=[
  {icon:Layers3,title:'Your cast, your universe',copy:'Start with expressive, customizable characters. Design personalities that belong in your stories.'},
  {icon:Mic2,title:'Voices make them real',copy:'Record your own performances. Watch their mouths respond to the words you speak.'},
  {icon:MousePointer2,title:'Direct every moment',copy:'Place characters, set their moves and use a visual timeline to shape the action.'},
  {icon:Film,title:'Go from scene to screen',copy:'Compose shots, layer in audio and export an animated movie to share.'}
];
function authError(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  if(message.includes('auth/email-already-in-use'))return 'That email already has an account. Please sign in.';
  if(message.includes('auth/invalid-credential')||message.includes('auth/wrong-password')||message.includes('auth/user-not-found'))return 'Email or password not recognized. Try again.';
  if(message.includes('auth/weak-password'))return 'Choose a stronger password (at least 6 characters).';
  if(message.includes('auth/operation-not-allowed'))return 'Email/password registration has not been enabled in Firebase yet.';
  if(message.includes('auth/too-many-requests'))return 'Too many attempts. Please try again later.';
  if(message.includes('auth/network-request-failed'))return 'Could not connect. Check your internet connection and retry.';
  return message;
}
export function SirvibeLanding({account,available,login,enter}:{
  account:Account|null;available:boolean;
  login:(email:string,password:string,register:boolean,displayName?:string)=>Promise<void>;
  enter:()=>void;
}){
  const [mode,setMode]=useState<AuthMode|null>(null),[busy,setBusy]=useState(false);
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState('');
  const start=(next:AuthMode)=>{
    if(account){enter();return;}
    setError('');setMode(next);
  };
  async function submit(event:FormEvent){
    event.preventDefault();
    if(!mode||busy)return;
    if(mode==='register'&&name.trim().length<2){setError('Add your name so your creator profile has a name.');return;}
    setBusy(true);setError('');
    try {
      await login(email.trim(),password,mode==='register',name.trim());
      setMode(null);enter();
    } catch(e) {setError(authError(e));}
    finally {setBusy(false);}
  }
  const primary=account?'Open my studio':'Start creating free';
  return <div className="sv-landing">
    <header className="sv-nav">
      <div className="sv-nav-inner">
        <a href="#top" className="sv-identity" aria-label="SIRVIBE home">
          <span className="sv-brand-icon"><img src="/api/logo" alt="" onError={event=>{event.currentTarget.hidden=true;}}/></span>
          <span className="sv-wordmark">SIRVIBE<span className="sv-mark">.</span></span>
        </a>
        <nav aria-label="Main navigation" className="sv-nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#studio-features">The studio</a>
          <span className="sv-beta-pill"><span/> FREE (BETA)</span>
          {!account&&<button type="button" className="sv-nav-login" onClick={()=>start('login')}>Log in</button>}
          <button type="button" className="sv-nav-cta" onClick={()=>start('register')}>
            {account?'My projects':'Create account'} <ArrowRight size={15}/>
          </button>
        </nav>
      </div>
    </header>
    <main id="top">
      <section className="sv-hero" aria-labelledby="sv-headline">
        <div className="sv-hero-light sv-light-1"/><div className="sv-hero-light sv-light-2"/>
        <div className="sv-hero-grid">
          <div className="sv-hero-content">
            <div className="sv-hero-kicker"><span className="sv-kicker-star"><Sparkles size={13}/></span> THE NEXT GENERATION CARTOON STUDIO <span className="sv-beta-inline">FREE (BETA)</span></div>
            <h1 id="sv-headline">Your imagination.<br/><span>Your own</span><br/><em>animated universe.</em></h1>
            <p>Some stories are too good to stay in your head. Create characters, give them a voice, direct their every move and turn everyday moments into cartoons worth watching.</p>
            <div className="sv-hero-ctas">
              <button type="button" className="sv-primary" onClick={()=>start('register')}>{primary}<ArrowRight size={19}/></button>
              <a className="sv-secondary" href="#how-it-works"><Play size={16} fill="currentColor"/> See how it works</a>
            </div>
            <div className="sv-hero-assurance"><Check size={15}/><span>No card required during beta</span><i/><Check size={15}/><span>Make it in your browser</span></div>
          </div>
          <div className="sv-hero-art" aria-label="Actual customizable SIRVIBE starter characters and editing timeline">
            <div className="sv-art-halo"/>
            <div className="sv-studio-window">
              <div className="sv-window-header"><span className="sv-window-dots"><i/><i/><i/></span><span className="sv-window-title"><Clapperboard size={12}/> SCENE 01 — YOUR STORY</span><span className="sv-live-tag">LIVE PREVIEW</span></div>
              <div className="sv-art-stage">
                <div className="sv-art-sun"/>
                <div className="sv-back-wall"/><div className="sv-art-floor"/>
                <div className="sv-character sv-character-one"><NativeCharacterPreview character={characters[0]} view="three-quarter" action="point" expression="surprised" flip={false} frozenTime={.53} scale={1}/></div>
                <div className="sv-character sv-character-two"><NativeCharacterPreview character={characters[1]} view="three-quarter" action="laugh" expression="happy" flip frozenTime={.35} scale={1}/></div>
                <div className="sv-character sv-character-three"><NativeCharacterPreview character={characters[4]} view="three-quarter" action="wave" expression="happy" flip={false} frozenTime={.38} scale={1}/></div>
                <div className="sv-speech-bubble">“Wait... YOU ate my food?!”</div>
                <div className="sv-stage-tag"><span className="sv-stage-pulse"/> YOUR CHARACTERS. YOUR RULES.</div>
              </div>
              <div className="sv-art-timeline">
                <div className="sv-ruler"><span>00:00</span><span>00:05</span><span>00:10</span><span>00:15</span><span>00:20</span></div>
                <div className="sv-demo-track"><span><Layers3 size={11}/> Actors</span><i className="sv-block sv-block-violet"/><i className="sv-block sv-block-cyan"/></div>
                <div className="sv-demo-track"><span><Film size={11}/> Movement</span><i className="sv-block sv-block-teal"/><i className="sv-block sv-block-violet"/></div>
                <div className="sv-demo-track"><span><AudioLines size={11}/> Voices</span><i className="sv-block sv-block-pink sv-wave-line"/></div>
                <div className="sv-demo-track"><span><Mic2 size={11}/> Sound</span><i className="sv-block sv-block-blue"/></div>
                <div className="sv-art-playhead"/>
              </div>
            </div>
            <span className="sv-art-float sv-float-top"><WandSparkles size={15}/> Animate anything</span>
            <span className="sv-art-float sv-float-bottom"><Heart size={15}/> Made for storytellers</span>
          </div>
        </div>
        <div className="sv-hero-bottom"><span>BUILT FOR THE NEXT WAVE OF CREATORS</span><span>YOUR STORY IS THE MAIN CHARACTER <ArrowRight size={16}/></span></div>
      </section>
      <section className="sv-section sv-vision" id="studio-features">
        <div className="sv-section-intro"><span className="sv-overline">THE VISION</span><h2>Animation isn't just for studios.<br/><em>It's for everyone with a story.</em></h2><p>We believe the next unforgettable cartoon can come from a bedroom, a classroom, a township, anywhere. SIRVIBE puts the tools in your hands, without making you learn the hard stuff first.</p></div>
        <div className="sv-feature-grid">{qualities.map(({icon:Icon,title,copy},i)=><article className={'sv-feature sv-feature-'+i} key={title}><span className="sv-feature-icon"><Icon size={24} strokeWidth={1.7}/></span><span className="sv-feature-number">0{i+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>
      <section className="sv-section sv-how" id="how-it-works">
        <div className="sv-how-top"><div><span className="sv-overline">YOUR NEXT BIG IDEA STARTS HERE</span><h2>From a wild idea to<br/><em>“play it again.”</em></h2></div><p>No intimidating animation pipeline. Your scenes, characters, recordings and movements all come together on one timeline.</p></div>
        <div className="sv-steps">{steps.map(step=><article key={step.number}><span>{step.number}</span><div><h3>{step.title}</h3><p>{step.copy}</p></div><ArrowRight size={19}/></article>)}</div>
      </section>
      <section className="sv-cta-section">
        <div className="sv-cta-glow"/>
        <div className="sv-cta-content"><span className="sv-overline">WELCOME TO THE CREATOR ERA · FREE (BETA)</span><h2>The world doesn't need<br/>another story left untold.</h2><p>Your first scene is waiting. Make something only you could make.</p><button type="button" className="sv-primary sv-cta-large" onClick={()=>start('register')}>{account?'Go to my projects':'Create your free account'}<ArrowRight size={19}/></button><small>Early beta access · No payment details required</small></div>
      </section>
    </main>
    <footer className="sv-footer"><span className="sv-identity sv-footer-brand"><span className="sv-wordmark">SIRVIBE<span className="sv-mark">.</span></span></span><p>Where imagination becomes animation.</p><span>FREE (BETA) · Made for creators everywhere.</span></footer>
    {mode&&!account&&<div className="sv-auth-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setMode(null);}}>
      <section className="sv-auth-card" role="dialog" aria-modal="true" aria-labelledby="sv-auth-title" onKeyDown={event=>{if(event.key==='Escape'&&!busy)setMode(null);}}>
        <button type="button" className="sv-auth-close" onClick={()=>setMode(null)} disabled={busy} aria-label="Close"><X size={19}/></button>
        <span className="sv-auth-logo">SIRVIBE<span>.</span></span><span className="sv-overline">FREE (BETA)</span>
        <h2 id="sv-auth-title">{mode==='register'?'Your universe starts here.':'Welcome back, creator.'}</h2>
        <p>{mode==='register'?'Create your free creator profile to start bringing ideas to life.':'Sign in to get back to your characters, scenes and stories.'}</p>
        <form onSubmit={event=>void submit(event)}>
          {mode==='register'&&<label>Creator name<input autoFocus type="text" autoComplete="name" required minLength={2} maxLength={70} value={name} onChange={e=>setName(e.target.value)} placeholder="What should we call you?"/></label>}
          <label>Email<input autoFocus={mode==='login'} type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
          <label>Password<input type="password" autoComplete={mode==='register'?'new-password':'current-password'} minLength={6} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>
          {error&&<div className="sv-auth-error" role="alert">{error}</div>}
          {!available&&<div className="sv-auth-error" role="alert">Firebase sign-in is not yet configured for this deployment.</div>}
          <button className="sv-primary sv-auth-submit" type="submit" disabled={busy||!available}>{busy?'Connecting…':mode==='register'?'Create free account':'Log in'} <ArrowRight size={17}/></button>
        </form>
        <p className="sv-auth-switch">{mode==='register'?'Already have a profile?':'New to SIRVIBE?'} <button type="button" onClick={()=>{setError('');setMode(mode==='register'?'login':'register');}}>{mode==='register'?'Log in':'Create an account'}</button></p>
        <span className="sv-auth-trust"><LockKeyhole size={13}/> Your projects are tied to your private account.</span>
      </section>
    </div>}
  </div>;
}
