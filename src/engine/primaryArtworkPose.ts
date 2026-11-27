import type {Point} from './animation.ts';
import type {View} from './schema.ts';
export const artworkPoseClasses=['rest','bent','raised','crossed','contact','foreshortened','seated'] as const;
export type ArtworkPoseClass=typeof artworkPoseClasses[number];
export type PrimaryArtworkPose={kind:ArtworkPoseClass;bend:number;inside:-1|1;shortening:number};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
/** Geometry-only pose description, deterministic on seeking/export. Body/head
 * view and depth hysteresis belong to the already-resolved performance state.
 * Optional previous category is for sequential clients, never needed for export. */
export function classifyArtworkPose(a:Point,b:Point,c:Point,options:{view:View;side:'left'|'right';centerX:number;contact?:boolean;seated?:boolean;confidence?:number;expectedLength?:number;previous?:ArtworkPoseClass;arm?:boolean}):PrimaryArtworkPose{
 const x=b.x-a.x,y=b.y-a.y,u=c.x-b.x,v=c.y-b.y,l=Math.hypot(x,y),m=Math.hypot(u,v);
 if(l<.01||m<.01||![l,m,options.centerX].every(Number.isFinite))return {kind:'rest',bend:0,inside:1,shortening:0};
 const bend=Math.acos(Math.max(-1,Math.min(1,(x*u+y*v)/(l*m))))/Math.PI,inside=x*v-y*u<0?-1:1;
 const shortening=options.expectedLength?clamp(1-Math.min(l,m)/options.expectedLength):0;
 const arm=options.arm!==false,prev=options.previous,sign=options.side==='left'?-1:1;
 const crossed=arm&&(c.x-options.centerX)*sign<-(prev==='crossed'?4:8);
 const raised=arm&&c.y<a.y-(prev==='raised'?4:8);
 const confident=(options.confidence??1)>.35;
 const kind:ArtworkPoseClass=options.contact&&confident?'contact':options.seated&&!arm?'seated':crossed?'crossed':raised?'raised':shortening>(prev==='foreshortened'?.18:.26)?'foreshortened':bend>(prev==='bent'?.17:.24)?'bent':'rest';
 return {kind,bend:Math.round(bend*8)/8,inside,shortening:Math.round(shortening*8)/8};
}
