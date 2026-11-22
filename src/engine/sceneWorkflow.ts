import { ProjectDocument, uid, type Project, type Scene } from './schema.ts';
import { makeScene } from './presets.ts';
import { makeStoryScene, fromOutline, reviseScript } from './production.ts';

const nameOf=(scene:Scene,suffix='')=>(scene.name.slice(0,70-suffix.length)+suffix).trim();
function insertAfter<T extends {id:string}>(items:T[],afterId:string,value:T) {
  const index=items.findIndex(item=>item.id===afterId);
  const result=[...items];
  result.splice(index<0?items.length:index+1,0,value);
  return result;
}
export function addMovieScene(project:Project):{project:Project;scene:Scene}{
  if(project.scenes.length>=30)throw new Error('Movies can contain up to 30 scenes.');
  const scene=makeScene();
  const created={...scene,name:`Scene ${String(project.scenes.length+1).padStart(2,'0')} · ${scene.environment}`};
  const outline={...makeStoryScene(created.name),id:created.id,environment:created.environment,
    location:created.environment,seconds:created.duration};
  const original=project.production;
  const production=original?{
    ...reviseScript(original,[...original.screenplay.scenes,fromOutline(outline)]),
    bible:{...original.bible,scenes:[...original.bible.scenes,outline]}
  }:undefined;
  return {project:ProjectDocument.parse({...project,scenes:[...project.scenes,created],
    ...(production?{production}:{})}),scene:created};
}
export function duplicateMovieScene(project:Project,id:string):{project:Project;scene:Scene}{
  if(project.scenes.length>=30)throw new Error('Movies can contain up to 30 scenes.');
  const original=project.scenes.find(item=>item.id===id);
  if(!original)throw new Error('The scene no longer exists.');
  const copy={...structuredClone(original),id:uid(),name:nameOf(original,' copy')};
  const source=project.production;
  let production=source;
  if(source){
    const originScript=source.screenplay.scenes.find(item=>item.id===id);
    const originOutline=source.bible.scenes.find(item=>item.id===id);
    const outline=originOutline?{...structuredClone(originOutline),id:copy.id,
      title:copy.name,status:'proposed' as const}:
      {...makeStoryScene(copy.name),id:copy.id,environment:copy.environment,
        location:copy.environment,seconds:copy.duration,
        cast:[...new Set(copy.actors.map(actor=>actor.characterId))]};
    const script=originScript?{
      ...structuredClone(originScript),id:copy.id,title:copy.name,
      elements:originScript.elements.map(line=>({...structuredClone(line),id:uid(),
        directions:line.directions.map(direction=>({...structuredClone(direction),id:uid()}))}))
    }:fromOutline(outline);
    production={
      ...reviseScript(source,insertAfter(source.screenplay.scenes,id,script)),
      bible:{...source.bible,scenes:insertAfter(source.bible.scenes,id,outline)}
    };
  }
  return {project:ProjectDocument.parse({
    ...project,scenes:insertAfter(project.scenes,id,copy),...(production?{production}:{})
  }),scene:copy};
}
export function renameMovieScene(project:Project,id:string,name:string):Project{
  const trimmed=name.trim();
  if(!trimmed||trimmed.length>70)throw new Error('Scene name must be between 1 and 70 characters.');
  if(!project.scenes.some(scene=>scene.id===id))throw new Error('The scene is missing.');
  const production=project.production;
  const updated=production?{
    ...production,
    screenplay:{scenes:production.screenplay.scenes.map(scene=>scene.id===id?{
      ...scene,title:trimmed
    }:scene)},
    bible:{...production.bible,scenes:production.bible.scenes.map(scene=>
      scene.id===id&&scene.status!=='locked'?{...scene,title:trimmed}:scene)}
  }:undefined;
  return ProjectDocument.parse({
    ...project,scenes:project.scenes.map(scene=>scene.id===id?{...scene,name:trimmed}:scene),
    ...(updated?{production:updated}:{})
  });
}
export function reorderMovieScene(project:Project,id:string,step:number):Project{
  const scenes=[...project.scenes],index=scenes.findIndex(scene=>scene.id===id);
  if(index<0||!scenes[index+step])return project;
  [scenes[index],scenes[index+step]]=[scenes[index+step],scenes[index]];
  if(!project.production)return ProjectDocument.parse({...project,scenes});
  const rank=new Map(scenes.map((scene,index)=>[scene.id,index]));
  const ordered=<T extends {id:string}>(items:T[])=>[...items].sort((a,b)=>
    (rank.get(a.id)??999)-(rank.get(b.id)??999));
  const production=project.production;
  return ProjectDocument.parse({
    ...project,scenes,production:{
      ...reviseScript(production,ordered(production.screenplay.scenes)),
      bible:{...production.bible,scenes:ordered(production.bible.scenes)}
    }
  });
}
export function removeMovieScene(project:Project,id:string):Project{
  if(!project.scenes.some(scene=>scene.id===id))throw new Error('The scene no longer exists.');
  // A movie needs one scene to remain valid. Deleting the final scene leaves a
  // completely empty replacement rather than trapping the creator in that scene.
  const scenes=project.scenes.length===1
    ? [{...makeScene('Living room',false),name:'Scene 01'}]
    : project.scenes.filter(scene=>scene.id!==id);
  const production=project.production;
  const updated=production?{
    ...reviseScript(production,production.screenplay.scenes.filter(scene=>scene.id!==id)),
    bible:{...production.bible,scenes:production.bible.scenes.filter(scene=>scene.id!==id)},
    graph:production.graph.filter(record=>record.sceneId!==id)
  }:undefined;
  return ProjectDocument.parse({
    ...project,scenes,
    ...(updated?{production:updated}:{})
  });
}
