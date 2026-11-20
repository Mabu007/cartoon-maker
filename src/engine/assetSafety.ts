import { ProjectDocument, type Project, type Scene } from './schema.ts';
import { removeEntity } from '../studio.ts';

/** Count references before a destructive user action so confirmations can give
 * the real impact rather than a generic "are you sure?" warning. */
export function characterUsage(project:Project,id:string) {
  const sceneActors=project.scenes.flatMap(scene=>scene.actors.filter(actor=>actor.characterId===id)
    .map(actor=>({sceneId:scene.id,actorId:actor.id})));
  const ids=new Set(sceneActors.map(item=>item.actorId));
  const actorClips=project.scenes.reduce((sum,scene)=>sum+scene.clips.filter(clip=>
    'actor' in clip && ids.has(clip.actor)).length,0);
  const screenplay=project.production?.screenplay.scenes.reduce((sum,scene)=>sum+
    scene.elements.filter(line=>line.characterId===id).length+
    (scene.cast.includes(id)?1:0),0)??0;
  const outline=project.production?.bible.scenes.filter(scene=>scene.cast.includes(id)).length??0;
  return {sceneActors:sceneActors.length,actorClips,screenplay,outline,
    total:sceneActors.length+actorClips+screenplay+outline};
}
/** Safe cascading removal leaves screenplay text for manual reassignment but
 * strips broken actor IDs, gaze targets and stale compilation graph entries.
 * No unrelated scene or media asset is touched.
 */
export function removeCharacterFromProject(project:Project,id:string):Project{
  if(!project.characters.some(item=>item.id===id))throw new Error('Character is no longer in the cast.');
  const removed=new Set(project.scenes.flatMap(scene=>scene.actors
    .filter(actor=>actor.characterId===id).map(actor=>actor.id)));
  const affected=new Set(project.scenes.filter(scene=>scene.actors.some(actor=>removed.has(actor.id))).map(scene=>scene.id));
  const scenes=project.scenes.map(scene=>scene.actors.filter(actor=>actor.characterId===id)
    .reduce((current,actor)=>removeEntity(current,actor.id),scene));
  const production=project.production;
  const nextProduction=production?{
    ...production,scriptStatus:'draft' as const,
    bible:{...production.bible,
      characters:production.bible.characters.filter(item=>item.characterId!==id),
      scenes:production.bible.scenes.map(scene=>({...scene,cast:scene.cast.filter(character=>character!==id)}))},
    screenplay:{scenes:production.screenplay.scenes.map(scene=>({
      ...scene,cast:scene.cast.filter(character=>character!==id),
      elements:scene.elements.map(line=>({
        ...line,...(line.characterId===id?{characterId:undefined}:{}),
        directions:line.directions.filter(direction=>
          !('actor' in direction && direction.actor && removed.has(direction.actor))&&
          !('target' in direction && direction.target && removed.has(direction.target)))
      }))
    }))},
    graph:production.graph.filter(record=>!affected.has(record.sceneId))
  }:undefined;
  return ProjectDocument.parse({
    ...project,characters:project.characters.filter(item=>item.id!==id),scenes,
    ...(nextProduction?{production:nextProduction}:{})
  });
}
export function propUsage(scene:Scene,id:string){
  if(!scene.objects.some(item=>item.id===id))return {clips:0,eyes:0,total:0};
  const clips=scene.clips.filter(clip=>'target' in clip && clip.target===id).length;
  const eyes=scene.actors.filter(actor=>actor.gazeTarget===id).length;
  return {clips,eyes,total:clips+eyes};
}
export function audioUsage(project:Project,asset:string){
  let active=0,versions=0;
  for(const scene of project.scenes)for(const clip of scene.clips){
    if('asset' in clip&&clip.asset===asset)active++;
    if(clip.track==='dialogue')versions+=(clip.versions??[]).filter(item=>item.asset===asset).length;
  }
  return {active,versions,total:active+versions};
}
