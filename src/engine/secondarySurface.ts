/** Deform only lower lateral cheek control points, preserving head crown,
 * central chin, eyes and lip anchors. Trusted absolute built-in paths. */
export function deformCheekOutline(path:string,h:number,offset:readonly [number,number]){
 if(![h,...offset].every(Number.isFinite)||h<=0||!offset.some(Boolean))return path;
 const tokens=path.match(/[A-Za-z]|-?(?:\d+(?:\.\d*)?|\.\d+)/g);if(!tokens||tokens.some(t=>/^[A-Za-z]$/.test(t)&&!['M','L','Q','C','Z'].includes(t)))return path;
 const out:string[]=[];for(let i=0;i<tokens.length;){const cmd=tokens[i++];out.push(cmd);if(cmd==='Z')continue;const count=cmd==='C'?3:cmd==='Q'?2:1;
 for(let j=0;j<count;j++){const x=Number(tokens[i++]),y=Number(tokens[i++]);if(!Number.isFinite(x+y))return path;
 const w=Math.max(0,1-Math.abs(y-h*.36)/(h*.36))*Math.min(1,Math.abs(x)/20);
 out.push(String(Math.round((x+Math.max(-.55,Math.min(.55,offset[0]))*w)*1000)/1000),String(Math.round((y+Math.max(-.55,Math.min(.55,offset[1]))*w)*1000)/1000));}}
 return out.join(' ');
}

/** Bounded transverse soft-surface displacement in normalized bone artwork.
 * Same control-point topology; axial coordinates and endpoints stay fixed. */
export function deformBoneSurface(path:string,normalOffset:number,width:number){
 if(!Number.isFinite(normalOffset)||!Number.isFinite(width)||width<=0||normalOffset===0)return path;
 const tokens=path.match(/[A-Za-z]|-?(?:\d+(?:\.\d*)?|\.\d+)/g);if(!tokens||tokens.some(t=>/^[A-Za-z]$/.test(t)&&!['M','L','Q','C','Z'].includes(t)))return path;
 const amount=Math.max(-.8,Math.min(.8,normalOffset))/width,out:string[]=[];
 for(let i=0;i<tokens.length;){const cmd=tokens[i++];out.push(cmd);if(cmd==='Z')continue;
 const count=cmd==='C'?3:cmd==='Q'?2:1;
 for(let j=0;j<count;j++){const x=Number(tokens[i++]),y=Number(tokens[i++]);if(!Number.isFinite(x+y))return path;
 const w=Math.sin(Math.PI*Math.max(0,Math.min(1,x)))**2;
 out.push(String(x),String(Math.round((y+amount*w)*10000)/10000));}}
 return out.join(' ');
}
