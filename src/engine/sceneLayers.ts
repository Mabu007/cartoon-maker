import { renderDepth } from './cameraTransform.ts';
import type { Scene } from './schema.ts';

export type LayerMove = 'front'|'back'|'forward'|'backward' | {reference:string;side:'behind'|'ahead'};
export function orderedLayers(scene:Scene, positions?:ReadonlyMap<string,number>) {
  const y=(item:{id:string;y:number})=>positions?.get(item.id)??item.y;
  return [
    ...scene.objects.map(item=>({...item,kind:'object' as const})),
    ...scene.actors.map(item=>({...item,kind:'actor' as const}))
  ].sort((a,b)=>renderDepth(a.depth,y(a))-renderDepth(b.depth,y(b)));
}

export function moveLayer(scene:Scene,id:string,move:LayerMove,positions?:ReadonlyMap<string,number>) {
  const layers=orderedLayers(scene,positions);
  const from=layers.findIndex(item=>item.id===id);
  if(from<0)return scene;
  const [item]=layers.splice(from,1);
  const reference=typeof move==='object'?layers.findIndex(other=>other.id===move.reference):-1;
  if(typeof move==='object'&&reference===-1)return scene;
  const to=typeof move==='object'?reference+(move.side==='ahead'?1:0):
    move==='front'?layers.length:move==='back'?0:
    move==='forward'?Math.min(layers.length,from+1):Math.max(0,from-1);
  if(to===from)return scene;
  layers.splice(to,0,item);
  // Give each item a full unit of separation so foot Y never overrides an
  // authored foreground/background relationship during animation.
  const depths=new Map(layers.map((layer,index)=>[layer.id,index]));
  return {...scene,layersManual:true,
    actors:scene.actors.map(actor=>({...actor,depth:depths.get(actor.id)!})),
    objects:scene.objects.map(prop=>({...prop,depth:depths.get(prop.id)!}))};
}
export function nextLayerDepth(scene:Scene) {
  return scene.layersManual?Math.min(1000,Math.max(-1,...[...scene.objects,...scene.actors].map(item=>item.depth))+1):0;
}
