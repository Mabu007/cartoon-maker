import type { Project } from './schema.ts';

/** Pure movie-card metadata shared by the library and its regression tests. */
export function projectPreviewInfo(project:Project){
  const scene=project.scenes.find(item=>item.actors.length||item.backgroundImage||item.clips.length)??project.scenes[0];
  return {
    scene,seconds:project.scenes.reduce((total,item)=>total+item.duration,0),
    sceneCount:project.scenes.length,
    characterCount:new Set(project.scenes.flatMap(item=>item.actors.map(actor=>actor.characterId))).size,
    clipCount:project.scenes.reduce((total,item)=>total+item.clips.length,0)
  };
}
