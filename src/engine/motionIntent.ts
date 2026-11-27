/** Deterministic, body-local motion intent gate. Distances are in the
 * caller's units (degrees, rig units, or normalized values). One instance
 * per independent joint or arm target; no webcam data is persisted.
 */
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));
const median=(a:number,b:number,c:number)=>Math.max(Math.min(a,b),Math.min(Math.max(a,b),c));
export function createMotionIntent(){
  let anchor:number[]|undefined,previous:number[]|undefined,older:number[]|undefined;
  let candidate:number[]|undefined, candidateAt=0, quietAt=0, quietAnchor:number[]|undefined;
  let moving=false,lastTime=-Infinity;
  function reset(){
    anchor=previous=older=candidate=quietAnchor=undefined;
    moving=false;lastTime=-Infinity;
  }
  function update(raw:readonly number[],time:number,threshold:number):number[]{
    if(raw.some(v=>!Number.isFinite(v))||!Number.isFinite(time))return anchor??[...raw];
    if(!anchor||time<=lastTime||time-lastTime>1.1||anchor.length!==raw.length){
      reset();anchor=[...raw];previous=anchor;lastTime=time;return anchor;
    }
    const dt=time-lastTime;lastTime=time;
    const input=[...raw];
    const clean=previous&&older?input.map((v,i)=>median(v,previous![i],older![i])):input;
    older=previous;previous=input;
    if(threshold<=0){anchor=input;moving=false;candidate=quietAnchor=undefined;return input;}
    if(!moving){
      if(distance(input,anchor)<threshold){candidate=undefined;return anchor;}
      // Require two coherent observations outside the hold deadband. An
      // isolated spike, even a large one, can never release a locked pose.
      const coherent=candidate&&input.reduce((dot,v,i)=>dot+(v-anchor![i])*(candidate![i]-anchor![i]),0)>0;
      if(!coherent||time-candidateAt>.8){candidate=input;candidateAt=time;return anchor;}
      moving=true;candidate=undefined;quietAnchor=undefined;
      // A confirmed gesture on a slow camera must not wait another full
      // inference interval merely to traverse the median history.
      anchor=dt>.22?input:clean;return anchor;
    }
    // A causal three-sample median rejects single-frame excursions during
    // motion. A smaller exit band than entry band supplies hysteresis.
    const exit=threshold*.55;
    if(!quietAnchor||distance(clean,quietAnchor)>exit){
      quietAnchor=clean;quietAt=time;
    }else if(time-quietAt>=.14&&dt<=.8){
      moving=false;candidate=undefined;anchor=clean;return anchor;
    }
    anchor=clean;return anchor;
  }
  return {update,reset};
}
