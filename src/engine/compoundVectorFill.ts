import type {VectorCommand} from './vectorArtwork.ts';

type Point=readonly [number,number];
type Ring={points:Point[];commands:VectorCommand[];area:number};
export type CompoundFill={outer:VectorCommand[];holes:VectorCommand[][]}[];
const epsilon=1e-9;
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const inBounds=(a:Point,b:Point,p:Point)=>p[0]>=Math.min(a[0],b[0])-epsilon&&p[0]<=Math.max(a[0],b[0])+epsilon&&p[1]>=Math.min(a[1],b[1])-epsilon&&p[1]<=Math.max(a[1],b[1])+epsilon;
function touches(a:Point,b:Point,c:Point,d:Point){
 const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);
 if(p*q<0&&r*s<0)return true;
 return Math.abs(p)<=epsilon&&inBounds(a,b,c)||Math.abs(q)<=epsilon&&inBounds(a,b,d)
   ||Math.abs(r)<=epsilon&&inBounds(c,d,a)||Math.abs(s)<=epsilon&&inBounds(c,d,b);
}
function contains(ring:Ring,point:Point){
 let inside=false;
 for(let i=0,j=ring.points.length-1;i<ring.points.length;j=i++){
  const a=ring.points[i],b=ring.points[j];
  if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
function simpleRings(commands:VectorCommand[]):Ring[]|undefined{
 const rings:Ring[]=[];
 let points:Point[]=[];
 let start=0;
 for(let i=0;i<commands.length;i++){
  const cmd=commands[i];
  if(cmd[0]==='M'){
   if(points.length)return;
   start=i;points.push([cmd[1],cmd[2]]);
  }else if(cmd[0]==='L'){
   if(!points.length)return;
   points.push([cmd[1],cmd[2]]);
  }else if(cmd[0]==='Z'){
   if(points.length<3)return;
   const first=points[0],last=points.at(-1)!;
   if(first[0]===last[0]&&first[1]===last[1])points.pop();
   if(points.length<3)return;
   let area=0;
   for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<=epsilon)return;
    area+=a[0]*b[1]-a[1]*b[0];
   }
   if(Math.abs(area)<=epsilon)return;
   rings.push({area,points,commands:commands.slice(start,i+1)});points=[];
  }else return;
 }
 if(points.length||!rings.length)return;
 const edges=rings.flatMap((ring,index)=>ring.points.map((point,i)=>({a:point,b:ring.points[(i+1)%ring.points.length],index,i,length:ring.points.length})));
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const a=edges[i],b=edges[j];
  if(a.index===b.index&&(b.i-a.i===1||b.i-a.i===a.length-1))continue;
  if(touches(a.a,a.b,b.a,b.b))return;
 }
 return rings.sort((a,b)=>Math.abs(b.area)-Math.abs(a.area));
}
/** Compile disjoint, strictly nested polygon rings for Pixi's hole API.
 * Curved compound contours and touching/intersecting rings need a separate
 * geometry implementation before they can use this path. */
export function compileCompoundFill(commands:VectorCommand[],rule:'nonzero'|'evenodd'):CompoundFill|undefined{
 const rings=simpleRings(commands);
 if(!rings)return;
 const result:CompoundFill=[];
 const visited:{ring:Ring;winding:number;owner?:CompoundFill[number]}[]=[];
 const filled=(winding:number)=>rule==='evenodd'?Math.abs(winding)%2===1:winding!==0;
 for(const ring of rings){
  let parent:typeof visited[number]|undefined;
  for(let i=visited.length-1;i>=0;i--){
   if(contains(visited[i].ring,ring.points[0])){parent=visited[i];break;}
  }
  const outside=parent?.winding??0,winding=outside+Math.sign(ring.area);
  let owner=parent?.owner;
  if(!filled(outside)&&filled(winding)){
   owner={outer:ring.commands,holes:[]};result.push(owner);
  }else if(filled(outside)&&!filled(winding)){
   owner!.holes.push(ring.commands);owner=undefined;
  }
  visited.push({ring,winding,owner});
 }
 return result;
}
