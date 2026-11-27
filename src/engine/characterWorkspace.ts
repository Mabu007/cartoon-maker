import {CharacterDefinition,SceneDefinition,identityLockGroups,type Character,type Action,type Expression,type Scene,type View,type Clip} from './schema.ts';
import {characterIdentity,randomizeCharacterIdentity,type IdentityLock} from './characterIdentity.ts';
import {animations} from './animation.ts';
import {fitCharacterPreview} from './previewLayout.ts';
import {conversationAudition} from './dialogueGestures.ts';
import {sceneSecondaryDefaults} from './secondaryMotionSchema.ts';
export type DraftHistory={past:Character[];present:Character;future:Character[];lastKey?:string;lastTime:number};
export type DraftAction={type:'edit';update:Character|((c:Character)=>Character);key?:string;time:number}|{type:'undo'|'redo'|'reset';value?:Character};
export const startDraft=(c:Character):DraftHistory=>({past:[],present:c,future:[],lastTime:0});
export function draftHistory(s:DraftHistory,a:DraftAction):DraftHistory{
 if(a.type==='undo'){if(!s.past.length)return s;return {past:s.past.slice(0,-1),present:s.past.at(-1)!,future:[s.present,...s.future].slice(0,32),lastTime:0};}
 if(a.type==='redo'){if(!s.future.length)return s;return {past:[...s.past,s.present].slice(-32),present:s.future[0],future:s.future.slice(1),lastTime:0};}
 if(a.type==='reset')return a.value?{past:[...s.past,s.present].slice(-32),present:a.value,future:[],lastTime:0}:s;
 if(a.type!=='edit')return s;
 const next=typeof a.update==='function'?a.update(s.present):a.update;if(next===s.present)return s;
 // Coalesce consecutive edits to one control, never unrelated controls or
 // imports. Shallow immutable snapshots share unchanged large asset strings.
 const merge=Boolean(a.key&&a.key===s.lastKey&&a.time-s.lastTime<350&&s.past.length);
 return {past:merge?s.past:[...s.past,s.present].slice(-32),present:next,future:[],lastKey:a.key,lastTime:a.time};
}
export function randomizeWorkspace(c:Character,seed:number,group:IdentityLock|'all'='all'){
 const identity=characterIdentity(c);
 const temp=group==='all'?c:{...c,identity:{...identity,locks:identityLockGroups.filter(k=>k!==group||identity.locks.includes(k))}};
 const next=randomizeCharacterIdentity(temp,seed);
 return CharacterDefinition.parse({...next,identity:{...identity,seed}});
}
export type PreviewPhysics='off'|'subtle'|'expressive';
export function characterAudition(c:Character,action:Action,expression:Expression,view:View,flip:boolean,physics:PreviewPhysics,wind:number,take:readonly Clip[]=[]):{scene:Scene;span:number}{
 const layout=fitCharacterPreview(c,1.4,action),performance=animations[action];let span=action==='stand'?4:performance.loop||action==='sit'?8:Math.min(8,performance.duration+.75);
 const scene:Scene={id:'character-preview',name:'Character audition',environment:'Podcast studio',duration:8,actors:[{id:'preview',characterId:c.id,x:layout.x,y:layout.y,scale:layout.scale,rotation:0,depth:0,view,flip,expression}],objects:[],clips:[]};
 // Idle and dialogue deliberately leave body channels unclaimed. Other
 // actions retain the real timeline authority.
 if(action!=='idle'&&action!=='talk')scene.clips.push({id:'pose',track:'body',layer:'body',actor:'preview',action:action==='stand'?'sit':action,start:0,length:action==='stand'?1.8:action==='sit'||performance.loop?8:Math.min(8,performance.duration+.22)});
 if(expression!=='neutral')scene.clips.push({id:'expression',track:'face',actor:'preview',expression,start:0,length:8});
 if(action==='talk')scene.clips.push({id:'example-speech',track:'dialogue',actor:'preview',text:conversationAudition.text,asset:'builtin:sbu-food',start:conversationAudition.start,length:conversationAudition.duration,muted:false,volume:1,offset:0});
 if(action==='stand')scene.clips.push({id:'rise',track:'body',layer:'body',actor:'preview',action:'stand',start:1.8,length:animations.stand.duration});
 if(physics!=='off')scene.visual={version:1,quality:'eco',secondaryMotion:{...sceneSecondaryDefaults,enabled:true,quality:'eco',strength:physics==='subtle'?.45:1,windX:Math.max(-80,Math.min(80,wind))}};
 if(take.length){span=Math.max(1,...take.map(c=>c.start+c.length));scene.duration=span;scene.clips=[...take];}
 return {scene:SceneDefinition.parse(scene),span};
}
