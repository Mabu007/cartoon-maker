/** Geometry boundary after the timeline evaluator, existing IK and contact
 * authority. No animation state or renderer dependency; never re-target raw
 * landmarks. Coordinates are actor-local before global mirror/lift. */
import {armIK,gaitLeg,mix,rig,seatedLeg,type Point} from './animation.ts';
import {propArm,type PropPose} from './propMotion.ts';
import {gaitProfiles,type GaitStyle} from './performanceCatalog.ts';
import {solveStrictCapturedArm,type ArmSide,type ArmTargets,type ArmBends,type ArmDepths} from './performanceArmIntelligence.ts';
import type {CapturedContact} from './performanceHandIntelligence.ts';
import type {Action,Character,View,JointPose} from './schema.ts';
export type ResolvedRig=ReturnType<typeof rig>;
export type ArtworkPoseAuthority={
 propPose?:PropPose;actionWeight?:number;gaitStyle?:GaitStyle;
 capturedArms?:{left:boolean;right:boolean};
 capturedRig?:{targets:ArmTargets;bends:ArmBends;extensions?:ArmBends;depths:ArmDepths;near?:ArmSide;influence:number;confidence?:{left?:number;right?:number}};
 capturedContact?:{type:CapturedContact;influence:number};
};
export type ResolvedArm={shoulder:Point;elbow:Point;hand:Point};
export type ResolvedLeg={upper:Point;knee:Point;foot:Point;moving:boolean};
export function resolveArtworkArm(c:Character,r:ResolvedRig,side:ArmSide,art:{rear:boolean;profile:boolean;face:number},action:Action,actionTime:number,carrying:boolean,holdsCostume:boolean,capturedFront:boolean,reachesFace:boolean,appearance?:ArtworkPoseAuthority):ResolvedArm{
 const joint=r[side];
      const propPose=appearance?.propPose??{action,time:actionTime,weight:appearance?.actionWeight??1};
      let [elbow,hand]=propArm(c,r,side,propPose,carrying,art.rear);
      const guidance=appearance?.capturedRig;
      const target=guidance?.targets[side];
      if(target&&guidance&&capturedFront&&!carrying&&!holdsCostume){
        // Solve in the existing character's shoulder-local coordinate system,
        // not by forcing raw MediaPipe angles onto the elbow.
        const pole=guidance.bends[side]??(side==='left'?-1:1);
        const weight=Math.max(0,Math.min(1,guidance.influence*(guidance.confidence?.[side]??1)));
        const solved=solveStrictCapturedArm(joint.shoulder,target,c.arms,side,pole);
        // Blend wrist targets, then solve once to preserve both bone lengths.
        const blended={x:(mix(hand.x,solved.hand.x,weight)-joint.shoulder.x)/c.arms,y:(mix(hand.y,solved.hand.y,weight)-joint.shoulder.y)/c.arms};
        const final=weight>=.999?solved:solveStrictCapturedArm(joint.shoulder,blended,c.arms,side,pole);
        elbow=final.elbow;hand=final.hand;
      }
      // Correct contact points by moving the wrist TARGET and re-solving
      // both arm bones. Lerp of unrelated elbows creates impossible lengths.
      const contact=appearance?.capturedContact;
      if(contact&&appearance?.capturedArms?.[side]&&!carrying&&!holdsCostume){
        const sign=side==='left'?-1:1;
        const headX=r.head.x,headY=r.head.y;
        let goal:Point|undefined;
        switch(contact.type){
          case 'prayer':goal={x:r.neck.x+sign*5.8,y:r.neck.y+27};break;
          case 'hands-on-head':goal={x:headX+sign*15*c.head,y:headY-15*c.head};break;
          case 'chin-left':case 'chin-right':
            if(contact.type===`chin-${side}`)goal={x:headX+sign*7*c.head,y:headY+23*c.head};break;
          case 'forehead-left':case 'forehead-right':
            if(contact.type===`forehead-${side}`)goal={x:headX+sign*9*c.head,y:headY-15*c.head};break;
          case 'hip-left':case 'hip-right':
            if(contact.type===`hip-${side}`)goal={x:r.hip.x+sign*20,y:r.hip.y};break;
          case 'guard':goal={x:headX+sign*25*c.head,y:headY+22*c.head};break;
          case 'punch-left':case 'punch-right':
            if(contact.type===`punch-${side}`)
              goal={x:joint.shoulder.x+sign*52*c.arms,y:joint.shoulder.y-11*c.arms};
            break;
        }
        if(goal&&!(guidance?.extensions?.[side]!==undefined&&guidance.extensions[side]!>.94)){
          // A heuristic contact may refine an observed bend, never manufacture
          // one by moving a distant hand across the body.
          if(guidance?.extensions?.[side]!==undefined){
            const currentReach=Math.hypot(hand.x-joint.shoulder.x,hand.y-joint.shoulder.y);
            const contactReach=Math.hypot(goal.x-joint.shoulder.x,goal.y-joint.shoulder.y);
            if(Math.hypot(goal.x-hand.x,goal.y-hand.y)>12*c.arms||Math.abs(contactReach-currentReach)>3*c.arms)goal=undefined;
          }
        }
        if(goal&&!(guidance?.extensions?.[side]!==undefined&&guidance.extensions[side]!>.94)){
          const weight=Math.min(1,Math.max(0,contact.influence)*.95);
          const blended={x:mix(hand.x,goal.x,weight),y:mix(hand.y,goal.y,weight)};
          const contactTarget={x:(blended.x-joint.shoulder.x)/c.arms,y:(blended.y-joint.shoulder.y)/c.arms};
          const pole=guidance?.bends[side]??sign;
          const solved=solveStrictCapturedArm(joint.shoulder,contactTarget,c.arms,side,pole);
          elbow=solved.elbow;hand=solved.hand;
        }
      }
      if(reachesFace){
        const sign=side==='right'?1:-1,weight=appearance?.actionWeight??1;
        const eyeX=r.head.x+(art.profile?15:art.face*.38+sign*12)*c.head;
        const rub=Math.sin(actionTime*17+sign*.5)*2.5;
        [elbow,hand]=armIK(joint.shoulder,{
          x:mix(hand.x,eyeX+sign*1.6,weight),
          y:mix(hand.y,r.head.y+(-3+rub)*c.head,weight)
        },28*c.arms,28*c.arms,sign);
      }
      // Final safety gate also covers old takes with joint angles only and
      // contact/action overrides. Authored animations and held props remain intact.
      if(appearance?.capturedArms?.[side]&&!carrying&&!holdsCostume){
        const safe=solveStrictCapturedArm(joint.shoulder,{x:(hand.x-joint.shoulder.x)/c.arms,y:(hand.y-joint.shoulder.y)/c.arms},c.arms,side,guidance?.bends[side]);
        elbow=safe.elbow;hand=safe.hand;
      }

 return {shoulder:joint.shoulder,elbow,hand};
}
export function resolveArtworkLeg(c:Character,r:ResolvedRig,side:ArmSide,action:Action,locomotion:Action,lift:number,gaitTime:number,forward:number,gaitWeight=1,velocity?:number,appearance?:ArtworkPoseAuthority):ResolvedLeg{
 const joint=r[side];
    let knee = joint.knee, foot = joint.foot;
    const moving = locomotion === 'walk' || locomotion === 'run';
    if (moving) {
      const [walkingKnee,walkingFoot]=gaitLeg(joint.upper,c.legs*c.height,gaitTime,
        locomotion,side,forward,lift,velocity,gaitProfiles[appearance?.gaitStyle??'natural'].lift);
      knee={x:joint.knee.x+(walkingKnee.x-joint.knee.x)*gaitWeight,
        y:joint.knee.y+(walkingKnee.y-joint.knee.y)*gaitWeight};
      foot={x:joint.foot.x+(walkingFoot.x-joint.foot.x)*gaitWeight,
        y:joint.foot.y+(walkingFoot.y-joint.foot.y)*gaitWeight};
    }
    // Sit and Stand transfer the torso over feet planted at actor-floor y=0.
    if(!moving&&(action==='sit'||action==='stand')){
      [knee,foot]=seatedLeg(joint.upper,c.legs*c.height,lift,side);
    }

 return {upper:joint.upper,knee,foot,moving};
}
export type ResolvedHandArtwork={position:Point;rotationRadians:number;scale:Point;geometry:ReturnType<typeof import('./handRig.ts').sampleHandRig>;occupied:boolean};
export type ResolvedArtworkPose={actorId:string;view:View;headView:View;mirrored:boolean;lift:number;rig:ResolvedRig;arms:Readonly<Record<ArmSide,ResolvedArm>>;legs:Readonly<Record<ArmSide,ResolvedLeg>>;head:{position:Point;angle:number;scale:Point};nearArm:ArmSide;hands:Readonly<Partial<Record<ArmSide,ResolvedHandArtwork>>>;facial:import('./facialAnimation.ts').FacialPerformance;action:Action;locomotion:Action;time:number};
