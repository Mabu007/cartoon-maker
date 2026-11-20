import { useEffect, useRef, useState } from 'react';
import { Code2, Send, Sparkles, WandSparkles, Check, X, Undo2, ClipboardCopy, Eye } from 'lucide-react';
import { applyTimelineEdits, countPendingSpeech, prepareDirectorSpeech,
  type TimelineEditProposal } from '../engine/timelineAI.ts';
import { evaluate } from '../engine/evaluate.ts';
import { sceneToCode } from '../engine/timelineCode.ts';
import { sceneBuildingContext } from '../engine/movieTimeline.ts';
import { builtinVoiceNames, soundNames, uid, type Project, type Scene } from '../engine/schema.ts';
import { canUseAI, filmmaker, type AiAccess } from '../services/filmmaker.ts';
import { synthesizeCached, speechProvider } from '../services/speech.ts';
import { audioLength, putAudio } from '../services/audio.ts';
import { analyzeLipSync } from '../services/lipSync.ts';
import type { Selection } from '../studio.ts';

type Message={role:'user'|'assistant';text:string};
type Pending={base:string;characters:string;next:Scene;proposal:TimelineEditProposal;request:string;unresolved:number};
function description(edit:TimelineEditProposal['edits'][number]):string {
  switch(edit.op){
    case 'insert':return `Add ${edit.clip.track} clip at ${edit.clip.start.toFixed(2)}s`;
    case 'replace':return `Replace ${edit.clipId} (${edit.clip.track})`;
    case 'remove':return `Remove ${edit.clipId}`;
    case 'update_clip':return `Edit ${edit.clipId}: ${Object.keys(edit.changes).join(', ')}`;
    case 'place_actor':return `Direct actor ${edit.actorId}: ${Object.keys(edit.changes).join(', ')}`;
    case 'place_prop':return `Arrange prop ${edit.propId}: ${Object.keys(edit.changes).join(', ')}`;
    case 'add_prop':return `Add prop ${edit.prop.name}`;
    case 'remove_prop':return `Remove prop ${edit.propId}`;
    case 'place_scene':return `Scene: ${Object.keys(edit.changes).join(', ')}`;
    case 'speak':return `${edit.clipId?'Regenerate':'Generate'} speech for ${edit.actor} at ${edit.start.toFixed(2)}s`;
  }
}
export function DirectorPanel({project,scene,selection,getTime,ai,busy,apply,preview,undo,canUndo,openCode}:{
  project:Project;scene:Scene;selection:Selection;getTime:()=>number;
  ai:AiAccess;busy:boolean;apply:(next:Scene,original:string,generatedAssets:readonly string[])=>void;
  preview:(scene:Scene|undefined)=>void;undo:()=>void;canUndo:boolean;openCode:()=>void;
}){
  const [prompt,setPrompt]=useState('');
  const [loading,setLoading]=useState(false),[applying,setApplying]=useState(false);
  const [pending,setPending]=useState<Pending>();
  const [error,setError]=useState(''),[history,setHistory]=useState<Message[]>([]);
  const [copied,setCopied]=useState('');
  const previewRef=useRef(preview);previewRef.current=preview;
  useEffect(()=>()=>previewRef.current(undefined),[]);
  const selected=selection?.kind==='clip'?scene.clips.find(item=>item.id===selection.id):undefined;
  const selectedActor=selection?.kind==='actor'?scene.actors.find(item=>item.id===selection.id):undefined;
  const selectedProp=selection?.kind==='object'?scene.objects.find(item=>item.id===selection.id):undefined;
  const time=getTime();
  const camera=evaluate(scene,time).camera;
  const cast=scene.actors.map(actor=>({
    id:actor.id,characterId:actor.characterId,name:project.characters.find(c=>c.id===actor.characterId)?.name??actor.id,
    x:actor.x,y:actor.y,view:actor.view,expression:actor.expression,gazeTarget:actor.gazeTarget
  }));
  const assets=[...new Set([
    ...builtinVoiceNames.map(name=>`builtin:${name}`),
    ...soundNames.map(name=>`builtin:${name}`),
    ...project.scenes.flatMap(s=>s.clips.flatMap(c=>'asset' in c?[c.asset]:[]))
  ])];
  const snapshot=sceneToCode(scene);
  const characterStamp=JSON.stringify(project.characters);
  function clear(){setPending(undefined);preview(undefined);}
  async function propose(){
    if(!prompt.trim()||loading||applying||!canUseAI(ai))return;
    const request=prompt.trim(),base=snapshot;
    clear();setError('');setCopied('');setLoading(true);
    try{
      const context={
        project:{id:project.id,title:project.name,scenes:project.scenes.map(s=>({id:s.id,name:s.name,duration:s.duration}))},
        storyBible:project.production?.bible,
        screenplay:project.production?.screenplay.scenes.find(s=>s.id===scene.id),
        screenplayStatus:project.production?.scriptStatus??'none',
        scene,playheadSeconds:time,selectedClip:selected,
        selection,selectedActor,selectedProp,camera,
        actors:cast,props:scene.objects.map(o=>({id:o.id,name:o.name,kind:o.kind,x:o.x,y:o.y})),
        characters:project.characters.map(c=>({id:c.id,name:c.name,voicePreset:c.voicePreset})),
        availableAudioAssets:assets,
        actions:'Use supported action and expression enum values from the schema.',
        recentChat:history.slice(-12)
      };
      let response:TimelineEditProposal|undefined,issue='';
      for(let attempt=0;attempt<2;attempt++){
        response=await filmmaker(ai,'timeline',attempt===0?request:
          `${request}\nYour previous proposed operations were invalid: ${issue}. Fix all IDs, collisions and timeline constraints. Return a valid fresh proposal.`,context);
        try{
          const next=applyTimelineEdits(project,scene,response,{deferSpeech:true});
          if(snapshot!==sceneToCode(scene))throw new Error('The scene changed while requesting direction.');
          const unresolved=countPendingSpeech(response);
          if(!response.edits.length){
            setHistory(old=>[...old,{role:'user',text:request},{role:'assistant',text:response!.message}].slice(-24));
            setPrompt('');return;
          }
          setPending({base,characters:characterStamp,next,proposal:response,request,unresolved});
          preview(next);
          return;
        }catch(cause){
          issue=cause instanceof Error?cause.message:'Invalid scene edit';
          if(attempt===1)throw cause;
        }
      }
    }catch(cause){setError(cause instanceof Error?cause.message:'The director could not create a safe proposal.');}
    finally{setLoading(false);}
  }
  async function commit(){
    if(!pending||applying||loading||busy)return;
    if(snapshot!==pending.base||characterStamp!==pending.characters){
      setError('The scene or cast changed. Discard this proposal and request a new edit.');return;
    }
    setError('');setApplying(true);
    try{
      const prepared=pending.unresolved?await prepareDirectorSpeech(project,scene,pending.proposal,async(text,voice,actorId)=>{
        const actor=scene.actors.find(a=>a.id===actorId);
        const character=project.characters.find(c=>c.id===actor?.characterId);
        const audio=await synthesizeCached(speechProvider(ai.account),text,voice,character?.hostedVoiceId);
        const seconds=await audioLength(audio);
        const analysis=await analyzeLipSync(audio,text,seconds,{
          token:await ai.account?.getIdToken().catch(()=>undefined)
        });
        const id=uid();
        await putAudio(id,audio);
        return {asset:`asset:${id}` as const,length:seconds,visemes:analysis.cues,
          lipSync:{source:analysis.source,engine:analysis.engine,analyzedDuration:analysis.analyzedDuration,
            ...(analysis.cacheKey?{cacheKey:analysis.cacheKey}:{})}};
      }):{next:pending.next,generatedAssets:[]};
      // Apply performs the canonical store comparison and creates one undo snapshot.
      apply(prepared.next,pending.base,prepared.generatedAssets);
      preview(undefined);
      setHistory(old=>[...old,{role:'user',text:pending.request},{role:'assistant',text:pending.proposal.message+
        (pending.unresolved?' Speech audio was generated for the accepted dialogue.':' Changes applied to the live timeline.')}].slice(-24));
      setPending(undefined);setPrompt('');
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not apply this proposal. The original timeline is preserved.');}
    finally{setApplying(false);}
  }
  function discard(){
    if(!pending)return;
    setHistory(old=>[...old,{role:'user',text:pending.request},
      {role:'assistant',text:'Proposal discarded. The movie was not changed.'}].slice(-24));
    clear();
  }
  async function copyContext(){
    try{
      await navigator.clipboard.writeText(sceneBuildingContext(project,pending?.next??scene));
      setCopied('Valid scene JSON schema and live AI context copied.');
    }catch{setError('Clipboard unavailable. Open Timeline Code Mode to copy context manually.');}
  }
  return <aside className="inspector director-panel" aria-label="AI Director">
    <div className="inspector-top"><Sparkles size={17}/><h2>AI Director</h2></div>
    <div className="director-body">
      <p className="small-text">Direct the film in conversation. Camera, dialogue, performance, props and timing become real timeline edits after you approve them.</p>
      <p className="small-text">Scene: <strong>{scene.name}</strong> · {scene.clips.length} clips · playhead {time.toFixed(2)}s
        {selection?' · Selected '+selection.kind:''}</p>
      {!!history.length&&<div className="director-messages" aria-label="Director conversation">
        {history.map((message,index)=><p key={index} className={message.role==='user'?'director-user-message':'director-ai-message'}>
          <strong>{message.role==='user'?'You':'Director'}</strong> {message.text}
        </p>)}
      </div>}
      <form onSubmit={event=>{event.preventDefault();void propose();}}>
        <label>Ask AI to direct your scene
          <textarea value={prompt} onChange={event=>setPrompt(event.target.value)} maxLength={3500}
            disabled={loading||applying}
            placeholder="Make Zee look at Sbu while he speaks. Then show a close-up of Zee looking annoyed."
            aria-label="Ask the AI Director"/>
        </label>
        <div className="film-tools">
          <button type="button" className="quiet" onClick={openCode}><Code2 size={15}/> Timeline Code</button>
          <button type="button" className="quiet" onClick={()=>void copyContext()}><ClipboardCopy size={15}/> Copy AI context</button>
        </div>
        <div className="film-tools">
          <button type="button" className="quiet" disabled={!canUndo||loading||applying||busy} onClick={()=>{clear();undo();}}>
            <Undo2 size={15}/> Undo last edit
          </button>
          <button type="submit" className="primary" disabled={!canUseAI(ai)||busy||loading||applying||!prompt.trim()}>
            {loading?<WandSparkles size={15}/>:<Send size={15}/>}
            {loading?'Planning edits…':'Propose edits'}
          </button>
        </div>
        {!canUseAI(ai)&&<p className="small-text">Connect your model or sign in to enable AI. Timeline Code Mode remains available without AI.</p>}
      </form>
      {!!copied&&<p role="status" className="small-text">{copied}</p>}
      {!!error&&<p role="alert" className="film-error">{error}</p>}
      {pending&&<div className="script-diff director-proposal" role="region" aria-label="Review AI timeline changes">
        <h3><Eye size={15}/> Previewing proposed direction</h3>
        <p>{pending.proposal.message}</p>
        <p className="small-text">{pending.proposal.edits.length} operation(s) · {pending.next.clips.length} preview clips
          {pending.unresolved>0?` · ${pending.unresolved} dialogue recording(s) will generate only after Apply`:''}</p>
        <ol aria-label="Proposed timeline operations" className="director-edit-list">
          {pending.proposal.edits.map((edit,index)=><li key={index}>{description(edit)}</li>)}
        </ol>
        <p className="small-text">The stage shows a temporary preview. Existing project data and Undo history remain unchanged until Apply. New speech is synthesized only after acceptance.</p>
        <div className="film-tools">
          <button type="button" className="primary" disabled={busy||applying} onClick={()=>void commit()}>
            <Check size={15}/>{applying?'Generating voice & applying…':'Apply to timeline'}
          </button>
          <button type="button" className="quiet" disabled={applying} onClick={discard}><X size={15}/> Reject</button>
        </div>
      </div>}
    </div>
  </aside>;
}
