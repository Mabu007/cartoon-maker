import { smoothPath } from './stagePath.ts';
import { propPlacement, throwArc, transferFraction, type PropPose } from './propMotion.ts';
import { resolveHandCustody,mayAttachProp,type HandSide } from './objectInteractionEngine.ts';
import { gaitProfiles, usesSeat, type GaitStyle } from './performanceCatalog.ts';
import { animations, armIK, blend, clamp, ease, mix, rig, sample, viewForward, travelProgress, motionBlend, turnHeadScale } from './animation.ts';
import { actorWorldPoint, eyeWorldPoint, aimEyes } from './gaze.ts';
import { anchorFor, compatibleObject } from './interactions.ts';
import { audibleAudioTrack } from './audioMix.ts';
import { effectiveCues } from './dspLipSync.ts';
import { sampleViseme, sampleTimedViseme, type Viseme } from './visemes.ts';
import { gestureAt, livingPose, type ActingContext, type GestureSample } from './livingCharacter.ts';
import { occupiedHands } from './handPerformance.ts';
import { directCamera } from './cameraDirector.ts';
import { samplePerformance, samplePerformanceHands } from './performanceCapture.ts';
import { performanceFacingView } from './performanceFacing.ts';
import { constrainCapturedHead } from './performanceHeadEye.ts';
import { capturedMicroMotion } from './performanceMicroMotion.ts';
import { directedActingPosture } from './actingPosture.ts';
import type { HandPose } from './handRig.ts';
import type { FingerCurls, CapturedContact } from './performanceHandIntelligence.ts';
import type { ArmTargets, ArmBends, ArmDepths, ArmSide } from './performanceArmIntelligence.ts';
import type { FacialControls } from './facialIntelligence.ts';
import { HEIGHT, WIDTH, views, type EmotionSpace, type ActingIntent, type Action, type ActorData, type Character, type Clip, type Expression, type JointPose, type Prop, type Scene, type SoundClip, type View } from './schema.ts';

export type CharacterState = ActorData & { pose: JointPose; lift: number; visible: boolean; expression: Expression; action: Action;
  speaking: boolean; actionTime: number; actionWeight:number; expressionIntensity:number; actingIntent?:ActingIntent; emotion?:EmotionSpace; locomotion: Action; gaitTime: number; gaitVelocity?: number;
  gaitStyle:GaitStyle; gaitWeight:number; turnScale:number; listening?:boolean; viseme?: { shape: Viseme; weight: number; from?:Viseme; blend?:number };
  focus?: { x: number; y: number }; gazePoint?: { x: number; y: number }; held?: Prop; heldHand?:HandSide; heldItems?:{left?:Prop;right?:Prop}; propPose?:PropPose; sitting:boolean; seat?:string;
  facialCapture?: {controls:FacialControls;influence:number};
  handGesture?: GestureSample; capturedArms?:{left:boolean;right:boolean}; capturedFocus?:{x:number;y:number};
  capturedFingers?:{left?:FingerCurls;right?:FingerCurls;influence:number;confidence?:{left?:number;right?:number}};
  capturedRig?:{targets:ArmTargets;bends:ArmBends;depths:ArmDepths;near?:ArmSide;influence:number;confidence?:{left?:number;right?:number}};
  capturedHeadFacing?:import('./schema.ts').PerformanceFacing;
  capturedContact?:{type:CapturedContact;influence:number};
  capturedFacing?:import('./schema.ts').PerformanceFacing; handOverride?: {
    left:HandPose;right:HandPose;
    from:{left:HandPose;right:HandPose};
    progress:number;influence:number;
    /** Current capture only owns observed hands; legacy captures own both. */
    observed?:{left:boolean;right:boolean}
  } };
export type CameraState = { x: number; y: number; zoom: number; roll?:number; view?: View };
const active = (clip: Clip, time: number) => clip.start <= time && time < clip.start + clip.length;
const latest = <T extends Clip>(clips: T[]) => clips.reduce<T | undefined>((found, clip) => !found || found.start <= clip.start ? clip : found, undefined);
const frameWeight = (clip: Clip, t: number) => ease(clamp(Math.min((t - clip.start) / .16, (clip.start + clip.length - t) / .15)));
/** Pure deterministic sampler shared by preview, props and imported JSON playback. */
export function movementPosition(clip: Extract<Clip, { track: 'movement' }>, progress: number): { x: number; y: number } {
  const t = clamp(progress);
  const keys = clip.keyframes;
  if (!keys) {
    const weight = clip.gait ? travelProgress(t) : ease(t);
    return { x: mix(clip.fromX, clip.toX, weight), y: mix(clip.fromY, clip.toY, weight) };
  }
  if(clip.style)return smoothPath(keys,t);
  const rightIndex = keys.findIndex(key => key.time >= t);
  const right = keys[Math.max(1, rightIndex < 0 ? keys.length - 1 : rightIndex)];
  const left = keys[Math.max(0, (rightIndex < 0 ? keys.length - 1 : rightIndex) - 1)];
  const weight = clamp((t - left.time) / Math.max(1e-9, right.time - left.time));
  return { x: mix(left.x, right.x, weight), y: mix(left.y, right.y, weight) };
}
export function evaluate(scene: Scene, time: number, characters?: ReadonlyMap<string,Character>, viewportWidth: number = WIDTH) {
  const t = clamp(time, 0, Math.max(0, scene.duration - .000001));
  const timelineClips = scene.clips.filter(clip => !scene.trackSettings?.[clip.track]?.muted);
  const sounds = timelineClips.filter((clip): clip is SoundClip => (clip.track === 'audio' || clip.track === 'music' || clip.track === 'dialogue') && audibleAudioTrack(scene,clip.track) && active(clip, t));
  // Index timeline clips once rather than repeatedly scanning all 600 clips
  // for each actor on every animation frame. Preserve clip iteration order.
  const byActor=new Map<string,Clip[]>();
  for(const clip of timelineClips){
    if(!('actor' in clip))continue;
    const group=byActor.get(clip.actor);
    if(group)group.push(clip);else byActor.set(clip.actor,[clip]);
  }
  const objectsById=new Map(scene.objects.map(object=>[object.id,object]));
  const handCustody=resolveHandCustody(scene,t);
  type BodyClip=Extract<Clip,{track:'body'}>;
  type PropEvent={clip:BodyClip;at:number};
  const propEvents=new Map<string,PropEvent>();
  const propDrops=new Map<string,PropEvent>();
  const transfersByActor=new Map<string,PropEvent[]>();
  for(const clip of timelineClips){
    if(clip.track!=='body'||!clip.target)continue;
    const fraction=transferFraction(clip.action);
    const object=objectsById.get(clip.target);
    if(fraction===undefined||!object||!compatibleObject(object,clip.action))continue;
    const at=clip.start+clip.length*fraction;
    if(at>t)continue;
    const event={clip,at}, prior=propEvents.get(clip.target);
    if(!prior||at>=prior.at)propEvents.set(clip.target,event);
    if(clip.action!=='pick-up'&&at>=(propDrops.get(clip.target)?.at??-1))propDrops.set(clip.target,event);
    const transfers=transfersByActor.get(clip.actor)??[];
    transfers.push(event);
    transfersByActor.set(clip.actor,transfers);
  }
  const byId=new Map(scene.actors.map(actor=>[actor.id,actor]));
  function placedProp(object:Prop,event:PropEvent){
    const {clip,at}=event;
    const owner=byId.get(clip.actor);
    if(owner){
      const motion=latest((byActor.get(owner.id)??[]).filter((item):item is Extract<Clip,{track:'movement'}>=>item.track==='movement'&&item.start<=at));
      const position=motion?movementPosition(motion,(at-motion.start)/motion.length):owner;
      const facing=viewForward(owner.view)*(owner.flip?-1:1);
      if(clip.action==='put-down')return {...object,x:position.x+28*facing*owner.scale,y:position.y};
      if(clip.action!=='throw-prop')return object;
      const time=animations['throw-prop'].duration*transferFraction('throw-prop')!;
      const character=characters?.get(owner.characterId);
      const release=sample(animations['throw-prop'],time);
      const forward=Math.sign((clip.pointAt?.x??position.x+facing*140)-position.x)||1;
      const flip=clip.pointAt?forward!==viewForward(owner.view):owner.flip;
      const heldPos=character?propPlacement(character,rig(character,release.pose,owner.view==='side'?.57:owner.view==='three-quarter'?.88:owner.view==='back-quarter'?.81:1),{action:'throw-prop',time,weight:1},object,false):{x:51,y:-135};
      const from=actorWorldPoint({...owner,...position,pose:release.pose,lift:release.lift,flip},heldPos);
      const to=clip.pointAt??{x:clamp(position.x+forward*210,0,WIDTH),y:position.y};
      const p=clamp((t-at)/Math.max(.06,clip.start+clip.length-at));
      return {...object,...throwArc(from,to,p),rotation:object.rotation+forward*300*p};
    }
    return object;
  }
  function visibleAt(clips: Clip[]) {
    const toggle = latest(clips.filter(clip => clip.track === 'actors' && clip.visible !== undefined && clip.start <= t));
    if (toggle?.track === 'actors' && toggle.visible !== undefined) return toggle.visible;
    const spans = clips.filter(clip => clip.track === 'actors' && clip.visible === undefined);
    return !spans.length || spans.some(clip => active(clip, t));
  }
  const actors = scene.actors.map((actor): CharacterState => {
    const clips = byActor.get(actor.id)??[];
    // One deterministic custody model handles both explicit Equip/Release
    // and body pick-up/put-down actions. Unreachable props never teleport
    // into an actor's hand, even in imported historical projects.
    const gaze = latest(clips.filter(clip => clip.track === 'gaze' && active(clip, t)));
    const movement = latest(clips.filter((clip): clip is Extract<Clip, { track: 'movement' }> => clip.track === 'movement' && clip.start <= t));
    const progress = movement ? clamp((t - movement.start) / movement.length) : 0;
    const position = movement ? movementPosition(movement, progress) : actor;
    let x = position.x;
    let y = position.y;
    const travelling = movement && active(movement, t) ? movement : undefined;
    const lead = movement ? movementPosition(movement,clamp(progress+.003)) : undefined;
    const trail = movement ? movementPosition(movement,clamp(progress-.003)) : undefined;
    const deltaX = lead && trail ? lead.x-trail.x : 0;
    const direction = Math.abs(deltaX)>.0001 ? Math.sign(deltaX) : movement ? Math.sign(movement.toX-movement.fromX) : 0;
    let flip = direction ? direction !== viewForward(actor.view) : actor.flip;
    let view = actor.view;
    const body = latest(clips.filter((clip): clip is Extract<Clip, { track: 'body' }> => clip.track === 'body' && clip.layer === 'body' && active(clip, t)));
    const gesture = latest(clips.filter((clip): clip is Extract<Clip, { track: 'body' }> => clip.track === 'body' && clip.layer === 'gesture' && active(clip, t)));
    const idle = sample(animations.idle, t);
    let { pose, lift } = idle;
    let expression = actor.expression;
    let held: Prop | undefined, propPose:PropPose|undefined;
    const sitting=Boolean(body&&(usesSeat(body.action)||body.action==='drive'));
    const seat=body&&usesSeat(body.action)?body.target:undefined;
    const locomotion: Action = body?.action ?? travelling?.gait ?? (travelling ? 'walk' : 'idle');
    let action: Action = locomotion;
    const gaitStyle=travelling?.style??'natural';
    const profile=gaitProfiles[gaitStyle];
    const gaitTime=(t - (travelling?.start ?? body?.start ?? t))/profile.step;
    const gaitVelocity = travelling ? (() => {
      // Finite difference samples the actual authored path, including user
      // keyframes and the same ease ramp used by visual position.
      const sampleWindow=.001;
      const p1=movementPosition(travelling,clamp(progress+sampleWindow));
      const p0=movementPosition(travelling,clamp(progress-sampleWindow));
      const delta=Math.max(.00001,(clamp(progress+sampleWindow)-clamp(progress-sampleWindow))*travelling.length);
      return Math.hypot(p1.x-p0.x,p1.y-p0.y)/delta/actor.scale;
    })() : undefined;
    const gaitWeight = travelling ? motionBlend(t,travelling.start,travelling.length) : 1;
    const turnScale = body?.action==='turn' ? turnHeadScale((t-body.start)/body.length) : 1;
    if (travelling && (view === 'front' || view === 'back') && direction && (locomotion === 'walk' || locomotion === 'run')) {
      view = view === 'front' ? 'side' : 'back-quarter';
      flip = direction !== viewForward(view);
    }
    if (!body && (locomotion === 'walk' || locomotion === 'run')) {
      const step=sample(animations[locomotion],gaitTime);
      const styled={...step.pose,torso:(step.pose.torso??0)+profile.lean,
        leftShoulder:(step.pose.leftShoulder??0)*profile.arm+profile.reach,
        rightShoulder:(step.pose.rightShoulder??0)*profile.arm+profile.reach,
        head:(step.pose.head??0)-profile.lean*.4};
      pose=blend(idle.pose,styled,gaitWeight);
      lift=mix(idle.lift,step.lift*profile.lift,gaitWeight);
    }
    for (const clip of [body, gesture]) {
      // Captured acting is a pure pose layer, not an explicit action.
      // Do not replace sitting, walking, talking or prop-action state with
      // the capture placeholder action ('idle').
      if (!clip || clip.performance?.length) continue;
      const isGesture = clip.layer === 'gesture';
      const target = clip.target ? objectsById.get(clip.target) : undefined;
      // Body actions belong to the actor, not to props. Sit works even with
      // no seat; an optional object may influence facing, never position.
      const activeAction: Action = clip.action;
      const definition = animations[activeAction];
      if (!isGesture) action = activeAction;
      else if (!['walk','run','sit','stand','turn'].includes(activeAction)) action = activeAction;
      const supportedSitBefore = activeAction==='stand'&&clips.some(previous =>
        previous.track === 'body' && previous.action === 'sit' && previous.layer === 'body' &&
        previous.start + previous.length <= clip.start + .05);
      // A replacement Stand action must immediately put the feet on the floor,
      // not replay the seated opening pose for the first 0.8 seconds.
      const transfer=transferFraction(activeAction);
      const offsets = (activeAction === 'sit' && clip.start === 0) ||
        (activeAction === 'stand' && !supportedSitBefore) ? definition.duration : 0;
      const next = sample(definition, !isGesture && (activeAction === 'walk' || activeAction === 'run') ? gaitTime : transfer===undefined?t-clip.start+offsets:(t-clip.start)/clip.length*definition.duration);
      if ((activeAction==='point'||activeAction==='reach')&&clip.pointAt) {
        const dx=clip.pointAt.x-x, dy=clip.pointAt.y-(y-116*actor.scale);
        flip=Math.abs(dx)>5 ? dx<0 : flip;
        if(view==='back'||view==='back-quarter')view='three-quarter';
        const angle=Math.atan2(Math.abs(dx),dy)*180/Math.PI;
        next.pose={...next.pose,rightShoulder:angle-13-(pose.torso??0)-(pose.hips??0),rightElbow:5};
      }
      const weight = activeAction==='sit'||activeAction==='stand'||activeAction==='sleep-seated'||activeAction==='sleep'||activeAction==='drive'
        ? 1 : frameWeight(clip,t);
      pose = blend(pose, next.pose, weight, isGesture);
      if (!isGesture) lift = mix(lift, next.lift, weight);
      if (definition.expression) expression = definition.expression;
      if (clip.action === 'turn') {
        const progression = (t - clip.start) / clip.length;
        view = progression > .66 ? actor.view : progression > .33 ? 'side' : views[Math.max(0, views.indexOf(actor.view) - 1)];
        flip = progression > .66 ? !flip : flip;
      }
      if(target&&usesSeat(activeAction))view=anchorFor(target)?.facing??view;
      if(target&&compatibleObject(target,activeAction)&&!usesSeat(activeAction)&&
        (activeAction!=='pick-up'||mayAttachProp(scene,actor.id,target.id,
          clip.start+clip.length*(transfer??.5)))){
        const elapsed=t-clip.start, phase=elapsed/clip.length;
        const attaches=activeAction==='pick-up'?phase>=transfer!:
          activeAction==='throw-prop'||activeAction==='put-down'?phase<transfer!:true;
        held=attaches?target:undefined;
        let gripTarget:PropPose['target'];
        if(activeAction==='pick-up'||activeAction==='put-down'){
          const approach=clamp(1-Math.abs(phase-transfer!)/.42);
          const placing=activeAction==='put-down';
          const drop=propDrops.get(target.id);
          const source=drop&&drop.clip.id!==clip.id?placedProp(target,drop):target;
          const dx=placing?(flip?-1:1)*28*actor.scale:source.x-x,dy=placing?0:source.y-y;
          if(!placing&&Math.abs(dx)>7)flip=dx*viewForward(view)<0;
          const angle=-actor.rotation*Math.PI/180;
          gripTarget={x:(dx*Math.cos(angle)-dy*Math.sin(angle))*(flip?-1:1)/actor.scale,
            y:(dx*Math.sin(angle)+dy*Math.cos(angle))/actor.scale+lift-(target.kind==='ball'?14:6)};
          propPose={action:activeAction,time:elapsed,weight:weight*ease(approach),target:gripTarget};
        }else {
          if(activeAction==='throw-prop'&&clip.pointAt&&Math.abs(clip.pointAt.x-x)>7)flip=Math.sign(clip.pointAt.x-x)!==viewForward(view);
          propPose={action:activeAction,time:transfer===undefined?elapsed:phase*definition.duration,weight};
        }
      }
    }
    const face = latest(clips.filter((clip): clip is Extract<Clip, { track: 'face' }> => clip.track === 'face' && active(clip, t)));
    const captured = latest(clips.filter((clip):clip is Extract<Clip,{track:'body'}>|Extract<Clip,{track:'performance'}> =>
      (clip.track==='performance'||(clip.track==='body'&&!!clip.performance?.length)) && active(clip,t)));
    let handOverride: CharacterState['handOverride'];
    let facialCapture:CharacterState['facialCapture'];
    let capturedFocus:CharacterState['capturedFocus'];
    let capturedArms:CharacterState['capturedArms'];
    let capturedFingers:CharacterState['capturedFingers'];
    let capturedRig:CharacterState['capturedRig'];
    let capturedContact:CharacterState['capturedContact'];
    let capturedHeadFacing:CharacterState['capturedHeadFacing'];
    // A take owns its chosen facing throughout its interval, including
    // temporary tracking gaps. This does not mutate the source scene actor.
    const capturedFacing=captured?.track==='performance'?captured.facing:undefined;
    if(capturedFacing){({view,flip}=performanceFacingView(capturedFacing));}
    const authoredGesture=Boolean(gesture && !gesture.performance && gesture.id!==captured?.id);
    if(captured?.performance && !authoredGesture){
      const progress=(t-captured.start)/captured.length;
      const key=samplePerformance(captured.performance,progress);
      const weight=frameWeight(captured,t)*clamp(key.presence??1);
      capturedArms={left:weight>.02&&key.pose.leftShoulder!==undefined,
        right:weight>.02&&key.pose.rightShoulder!==undefined};
      if(weight>.02&&key.fingerCurls)capturedFingers={
        ...key.fingerCurls,influence:weight,confidence:key.handConfidence};
      if(weight>.02&&key.armTargets)capturedRig={
        targets:key.armTargets,bends:key.armBend??{},
        depths:key.armDepth??{},near:key.nearArm,influence:weight,confidence:key.armConfidence
      };
      if(weight>.02&&key.contact)capturedContact={type:key.contact,influence:weight};
      if(weight>.12&&key.headFacing)capturedHeadFacing=key.headFacing;
      if(key.focus&&!gaze&&weight>.02)capturedFocus=key.focus;
      // Preserve the lower body and its floor contact in an authored sit,
      // walk, sleep or driving animation. A recording owns only observed
      // upper-body joints in this case.
      pose=blend(pose,constrainCapturedHead(key.pose),weight,Boolean(body));
      const transition=samplePerformanceHands(captured.performance,progress);
      if(transition)handOverride={
        ...transition.to,from:transition.from,
        progress:transition.progress,influence:weight,
        ...(key.fingerCurls?{observed:{
          left:Boolean(key.fingerCurls.left&&(key.handConfidence?.left??1)>.02),
          right:Boolean(key.fingerCurls.right&&(key.handConfidence?.right??1)>.02)
        }}:{})
      };
      if(key.expression&&!face&&weight>.45)expression=key.expression;
      // Explicit face clips retain ownership when captured facial acting overlaps.
      if(key.facial&&!face)facialCapture={controls:key.facial,influence:weight};
    }
    if (face) expression = face.expression;
    const spoken = latest(sounds.filter((clip):clip is Extract<Clip,{track:'dialogue'}> =>
      clip.track==='dialogue' && clip.actor===actor.id && !clip.muted));
    // sceneTime is derived from Web Audio's currentTime in preview or the frame
    // timestamp in export. A dialogue offset shifts source *audio* time only.
    const audioTime = spoken ? t - spoken.start + spoken.offset : -1;
    const viseme = spoken?.visemes?.length
      ? sampleTimedViseme(spoken.manualVisemes?.length ? effectiveCues(spoken.visemes, spoken.manualVisemes) : spoken.visemes,audioTime)
      : spoken ? sampleViseme(spoken.text,spoken.length,t-spoken.start) : undefined;
    const heldItems:{left?:Prop;right?:Prop}={};
    for(const [propId,holder] of handCustody)
      if(holder.actor===actor.id){
        const prop=objectsById.get(propId);
        if(prop)heldItems[holder.hand]=prop;
      }
    held=heldItems.right??heldItems.left;
    const heldHand:HandSide|undefined=heldItems.right?'right':heldItems.left?'left':undefined;
    const character = characters?.get(actor.characterId);
    let handGesture: GestureSample | undefined;
    const speaking = Boolean(spoken) || action === 'talk';
    if (character) {
      // An authored gaze target can give a directional phrase a real point.
      // The conversation partner inferred for eye contact is not an aim target.
      const targetId = gaze?.track === 'gaze' ? gaze.target : actor.gazeTarget;
      const targetProp = speaking && targetId ? objectsById.get(targetId) : undefined;
      const targetActor = speaking && targetId && !targetProp ? scene.actors.find(other => other.id === targetId && other.id !== actor.id && visibleAt(byActor.get(other.id) ?? [])) : undefined;
      const targetMove = targetActor && latest((byActor.get(targetActor.id) ?? []).filter(
        (clip): clip is Extract<Clip, {track:'movement'}> => clip.track === 'movement' && clip.start <= t));
      const targetPosition = targetMove ? movementPosition(targetMove, (t - targetMove.start) / targetMove.length) : targetActor;
      const target = targetProp ? { x: targetProp.x, y: targetProp.y - (targetProp.imageHeight ?? 50) * targetProp.scale * .55 } :
        targetPosition && targetActor ? { x: targetPosition.x, y: targetPosition.y - 153 * targetActor.scale } : undefined;
      let pointToward: ActingContext['pointToward'];
      if (target) {
        const dx = target.x - x, dy = target.y - y;
        const radians = -actor.rotation * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
        const localX = (dx * cos - dy * sin) * (flip ? -1 : 1) / actor.scale;
        const localY = (dx * sin + dy * cos) / actor.scale + lift + 120 * character.height;
        if (Math.abs(localX) > 12) pointToward = { x: localX, y: localY };
      }
      const acting: ActingContext = {
        time: t, actorId: actor.id, action, locomotion, expression, speaking, pointToward,
        listening: !speaking && (action === 'listen' || sounds.some(clip => clip.track === 'dialogue' && clip.actor !== actor.id)),
        manualGesture: Boolean(gesture), occupiedHands: occupiedHands(character, Boolean(held), action),
        phrase: spoken ? {
          start: spoken.start, duration: spoken.length, text: spoken.text, offset: spoken.offset,
          sourceDuration: spoken.lipSync?.analyzedDuration, cues: spoken.visemes
        } : undefined
      };
      handGesture = gestureAt(character, acting);
      // The existing authored-action engine is unchanged when no camera
      // recording is present. During capture, only sub-degree breathing and
      // listening motion is added; generated gestures never fight the actor.
      if(captured?.performanceOrigin==='mocap' && !authoredGesture){
        pose=capturedMicroMotion(character,pose,{
          time:t,speaking, listening:Boolean(acting.listening),
          authoredGesture, intensity:frameWeight(captured,t)
        });
      }else if(!captured || authoredGesture){
        pose=livingPose(character,acting,pose,handGesture);
      }
    }
    // Small, high-level body-language offsets support facial direction.
    // Locomotion, held props, manual body gestures and mocap retain authority.
    if(face?.intent && face.intent!=='none' && !captured?.performance && !authoredGesture &&
      ['idle','talk','listen','think'].includes(action) && !['walk','run'].includes(locomotion)){
      const intensity=(face.intensity??1)*frameWeight(face,t);
      pose=directedActingPosture(pose,face.intent,intensity);
    }
    const performance=action===gesture?.action?gesture:body;
    const actionTime=performance?t-performance.start:0;
    const actionWeight=performance?frameWeight(performance,t):1;
    return { ...actor, x, y, view, flip, pose, lift, expression, expressionIntensity:face?.intensity??1,actingIntent:face?.intent,emotion:face?.emotion, action,
      gazeTarget: gaze?.track === 'gaze' ? gaze.target : actor.gazeTarget,
      speaking, handGesture, handOverride, facialCapture, capturedArms, capturedFingers, capturedRig, capturedContact, capturedFocus, capturedFacing, capturedHeadFacing, actionTime, actionWeight, locomotion, gaitTime, gaitVelocity, gaitStyle, gaitWeight, turnScale, viseme, visible: visibleAt(clips), held,heldHand,heldItems,propPose,sitting,seat };
  });
  // Directors can explicitly select a gaze target. Without one, the person
  // listening follows the current speaker, and the speaker picks a listener.
  // This evaluation is pure, so exporting frame 240 matches preview frame 240.
  const activeSpeakers = actors.filter(actor => (actor.speaking || actor.action === 'talk') && actor.visible);
  for (const actor of actors) {
    actor.listening = !actor.speaking && activeSpeakers.some(other=>other.id!==actor.id&&other.visible);
    const targetId = actor.gazeTarget;
    if(actor.capturedFocus){actor.focus=actor.capturedFocus;continue;}
    if (actor.action === 'look-away') {
      actor.focus = { x: -viewForward(actor.view), y: -.2 };
      continue;
    }
    let focusX: number | undefined, focusY: number | undefined;
    if (targetId === 'camera') {
      actor.focus = { x: 0, y: -.08 };
      continue;
    }
    const targetActor = targetId ? actors.find(item => item.id === targetId && item.visible) : undefined;
    const targetProp = targetId ? objectsById.get(targetId) : undefined;
    const implicit = !targetId && activeSpeakers.length
      ? (activeSpeakers.some(item => item.id === actor.id)
        ? actors.find(item => item.id !== actor.id && item.visible)
        : activeSpeakers.find(item => item.id !== actor.id))
      : undefined;
    const other = targetActor ?? implicit;
    if (other) {
      const character=characters?.get(other.characterId);
      const eyes=character?eyeWorldPoint(other,character):undefined;
      focusX = eyes?.x??other.x;
      focusY = eyes?.y??other.y - 150 * other.scale;
    } else if (actor.held&&(!targetId||targetId===actor.held.id)&&(!actor.speaking||targetProp)) {
      const character=characters?.get(actor.characterId);
      if(character) {
        const pose=rig(character,actor.pose,1), rear=actor.view==='back'||actor.view==='back-quarter';
        const [,hand]=armIK(pose.right.shoulder,{x:pose.head.x+(rear?-26:45),y:pose.head.y+43},28*character.arms,28*character.arms,1);
        const point=actorWorldPoint(actor,{x:hand.x+7,y:hand.y});
        focusX=point.x;focusY=point.y;
      } else {focusX=actor.held.x;focusY=actor.held.y;}
    } else if (targetProp) {
      focusX = targetProp.x;
      focusY = targetProp.y - (targetProp.imageHeight ?? 50) * targetProp.scale * .55;
    }
    if (focusX !== undefined && focusY !== undefined) {
      actor.gazePoint={x:focusX,y:focusY};
      const character=characters?.get(actor.characterId);
      if(character) {
        actor.focus=aimEyes(eyeWorldPoint(actor,character),actor.gazePoint,actor.flip,actor.rotation,actor.scale);
        continue;
      }
      const deltaX = (focusX - actor.x) * (actor.flip ? -1 : 1);
      const eyeHeight = actor.y - 153 * actor.scale - actor.lift;
      actor.focus = { x: clamp(deltaX / 190, -1, 1), y: clamp((focusY - eyeHeight) / 140, -1, 1) };
    }
  }
  const cameraClips = timelineClips.filter(clip => clip.track === 'camera');
  const cameraClip = latest(cameraClips.filter(clip => active(clip, t)));
  const previousCameraClip=cameraClip
    ?latest(cameraClips.filter(clip=>clip.start<cameraClip.start))
    :undefined;
  const camera:CameraState=directCamera(
    cameraClip,previousCameraClip,actors,scene.objects,t,viewportWidth
  );
  const transition = latest(timelineClips.filter((clip): clip is Extract<Clip, { track: 'transition' }> => clip.track === 'transition' && active(clip, t)));
  const fade = transition ? clamp((t - transition.start) / transition.length) : 0;
  const objects = scene.objects.map(object => {
    const cue = latest(timelineClips.filter(clip => clip.track === 'props' && clip.target === object.id && clip.start <= t));
    const lastDrop=propDrops.get(object.id);
    if(lastDrop&&lastDrop.at>=(cue?.start??-1))
      return placedProp(object,lastDrop);
    if(cue?.track==='props' && (cue.interaction==='open'||cue.interaction==='close')) {const progress=ease(clamp((t-cue.start)/Math.min(.7,cue.length)));return {...object,doorOpen:cue.interaction==='open'?progress:1-progress};}
    if (cue?.track !== 'props' || cue.interaction !== 'release') return object;
    const owner = scene.actors.find(actor => actor.id === cue.actor);
    const move = latest(timelineClips.filter(clip => clip.track === 'movement' && clip.actor === cue.actor && clip.start <= cue.start));
    if (move?.track !== 'movement') return owner ? { ...object, x: owner.x + 42, y: owner.y - 35 } : object;
    const at = clamp((cue.start - move.start) / move.length);
    const position = movementPosition(move, at);
    return { ...object, x: position.x + 42, y: position.y - 35 };
  });
  const effects=timelineClips.filter((clip):clip is Extract<Clip,{track:'vfx'|'text'}>=>(clip.track==='vfx'||clip.track==='text')&&active(clip,t));
  return { actors, objects, sounds, camera, effects, transition:transition?{effect:transition.effect,progress:fade}:undefined, shot: cameraClip?.shot ?? 'wide', fade: transition?.effect === 'fade-in' ? 1 - fade : fade };
}
export type SceneState = ReturnType<typeof evaluate>;
export const MOVIE_FRAME_RATE = 30;
export const projectDuration = (scenes: Scene[]) => scenes.reduce((sum, scene) => sum + scene.duration, 0);
export function locate(scenes: Scene[], time: number) {
  let start = 0;
  for (const scene of scenes) {
    if (time < start + scene.duration || scene === scenes.at(-1)) return { scene, local: clamp(time - start, 0, scene.duration), start };
    start += scene.duration;
  }
  throw new Error('A project needs a scene');
}
