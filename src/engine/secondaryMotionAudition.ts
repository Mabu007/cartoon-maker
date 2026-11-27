import {makeProject} from './presets.ts';
import {flagshipCharacters} from './visualPresets.ts';
import {garmentDefaults} from './garmentDesignSchema.ts';
import {sceneSecondaryDefaults,characterSecondaryDefaults} from './secondaryMotionSchema.ts';
import {ProjectDocument,type Project} from './schema.ts';
/** Built-in non-destructive QA project. No private assets, no new scene clip types.
 * Existing demo covers walk/stop, dialogue, seated cup, jump, run and camera cuts. */
export function secondaryMotionAudition(cast:2|3=2):Project{
 const p=makeProject(true),s=p.scenes[0];
 p.name='LVE · Wind and movement audition';
 p.characters=p.characters.map((c,i)=>i<2?{...flagshipCharacters[i],id:c.id,garmentDesign:{...garmentDefaults,top:i?'blouse':'shirt',bottom:i?'skirt':'trousers',outer:i?'none':'jacket',outerColor:'#304a48'},secondaryMotion:{...characterSecondaryDefaults,strength:.8}}:c);
 s.visual={...s.visual,version:1,quality:'balanced',secondaryMotion:{...sceneSecondaryDefaults,enabled:true,windX:8,gusts:[{time:1,x:65,y:-8,duration:.7},{time:8,x:-65,y:0,duration:1},{time:20,x:45,y:-5,duration:.5}]}};
 if(cast===3){const first=s.actors[0],third={...first,id:'lve-audition-third',characterId:p.characters[1].id,x:160,y:425,scale:.82};s.actors.push(third);s.clips.push({id:'lve-audition-third-visible',track:'actors',actor:third.id,start:0,length:s.duration});}
 return ProjectDocument.parse(p);
}
