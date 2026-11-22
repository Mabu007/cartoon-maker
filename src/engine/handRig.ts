/**
 * One wrist-anchored, deterministic five-digit geometry for Pixi and SVG.
 * Local +Y points from knuckles back to the cuff; -Y points outward.
 */
export type HandPose = 'relaxed'|'open'|'point'|'grip'|'fist'|'pinch'|'palm-up'|'thumbs-up'|'count';
export type HandPoint = [number,number];
export type FingerPath = [HandPoint,HandPoint,HandPoint];
type FingerStyle = {curl:[number,number,number,number];thumb:number;spread:number};
const styles:Record<HandPose,FingerStyle>={
  relaxed:{curl:[.18,.20,.24,.29],thumb:.25,spread:.14},
  open:{curl:[0,0,0,0],thumb:0,spread:.31},
  'palm-up':{curl:[.05,.04,.05,.08],thumb:0,spread:.25},
  point:{curl:[0,.95,.96,.98],thumb:.65,spread:.045},
  grip:{curl:[.79,.83,.84,.83],thumb:.75,spread:.02},
  fist:{curl:[1,1,1,1],thumb:.94,spread:0},
  pinch:{curl:[.19,.8,.82,.83],thumb:.25,spread:.02},
  'thumbs-up':{curl:[.96,.98,.98,.95],thumb:-.5,spread:0},
  count:{curl:[0,0,.97,.97],thumb:.73,spread:.1}
};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export function sampleHandRig(pose:HandPose='relaxed',blend=1):{fingers:FingerPath[];thumb:FingerPath}{
  const t=Math.max(0,Math.min(1,blend)),rest=styles.relaxed,target=styles[pose];
  const fingers:FingerPath[]=[0,1,2,3].map(i=>{
    const curl=lerp(rest.curl[i],target.curl[i],t);
    const spread=lerp(rest.spread,target.spread,t);
    const direction=i<2?-1:1;
    const length=[13.5,16.7,15.9,12.6][i];
    const root:HandPoint=[-5.6+i*3.85,-7+Math.abs(i-1.5)*.45];
    const a=direction*(Math.abs(i-1.5)*spread*.7+curl*.58);
    const b=direction*(Math.abs(i-1.5)*spread+curl*2.48);
    const mid:HandPoint=[root[0]+Math.sin(a)*length*.58,root[1]-Math.cos(a)*length*.58];
    const tip:HandPoint=[mid[0]+Math.sin(b)*length*.42,mid[1]-Math.cos(b)*length*.42];
    return [root,mid,tip];
  });
  const curl=lerp(rest.thumb,target.thumb,t);
  const thumb:FingerPath=[[-7.8,2.1],[-11.8+curl*5.8,-2.7-curl*1.2],
    curl<0?[-8.8,-19]:[-14+curl*13.6,-8+curl*4.8]];
  return {fingers,thumb};
}
/** A local fingertip points -Y, so +90 degrees aligns it with the forearm
 * (elbow -> wrist), including horizontal points and downward resting palms. */
export function handRotation(forearmRadians:number,wristDegrees=0,pose:HandPose='relaxed'){
  const wrist=Math.max(-65,Math.min(65,wristDegrees))*Math.PI/180*.46;
  return forearmRadians+Math.PI/2+wrist+(pose==='palm-up'?.12:0);
}
