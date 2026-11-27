import {makeProject} from './presets.ts';
import {flagshipCharacters} from './visualPresets.ts';
import {ProjectDocument,type Project,type Character} from './schema.ts';
export const auditionProfiles=['confident','nervous','relaxed'] as const;
export type AuditionProfile=typeof auditionProfiles[number];
/** Same line, same timeline, same two actors. Never mutates a user project. */
export function actingAudition(profile:AuditionProfile='confident',enabled=true):Project{
 const p=makeProject(true),s=p.scenes[0],a=s.actors[0],b=s.actors[1];
 p.name='Acting audition · '+profile;s.name='Same dialogue / different delivery';s.duration=10;
 s.actors=[{...a,x:335,y:450,view:'three-quarter',flip:false,expression:'neutral'},{...b,x:625,y:450,view:'three-quarter',flip:true,expression:'neutral'}];
 p.characters=p.characters.map((c,i)=>i<2?{...flagshipCharacters[i],id:c.id,personality:{preset:i===0?profile:'relaxed',autoActing:enabled?'full':'off',actingModel:'coherent-v1',behaviorSeed:2026}} as Character:c);
 s.clips=[{id:'acting-visible-a',track:'actors',actor:a.id,start:0,length:10},{id:'acting-visible-b',track:'actors',actor:b.id,start:0,length:10},
 {id:'acting-line-a',track:'dialogue',actor:a.id,text:'Hey! Who ate my food?',asset:'builtin:sbu-food',start:1,length:3.1,volume:.92,muted:false,offset:0},
 {id:'acting-line-b',track:'dialogue',actor:b.id,text:'I was just checking if it was safe.',asset:'builtin:zee-safe',start:5,length:3.45,volume:.92,muted:false,offset:0}];
 return ProjectDocument.parse(p);
}
