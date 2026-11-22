import { useEffect, useId, useState } from 'react';
import { bodyProportions } from '../engine/bodyBuild.ts';
import { animations, gaitLeg, rig, sample, seatedLeg, viewForward } from '../engine/animation.ts';
import { fingerPath, handRotation, handSize, handWidthScale, sampleHandRig } from '../engine/handRig.ts';
import { conversationAudition } from '../engine/dialogueGestures.ts';
import { gestureAt, livingPose, type ActingContext } from '../engine/livingCharacter.ts';
import { handPerformance, occupiedHands } from '../engine/handPerformance.ts';
import { sampleViseme, type Viseme } from '../engine/visemes.ts';
import { facialPerformance } from '../engine/facialAnimation.ts';
import { SvgMouthRig } from './SvgMouthRig.tsx';
import type { Action, Character, Expression, View } from '../engine/schema.ts';

/**
 * Browser-native SVG is deliberately independent of Pixi and WebGL. If the
 * accelerated stage can't initialize or loses its graphics context, character
 * creation stays available using this lightweight, parametric preview.
 */
export function NativeCharacterPreview({ character: c, view, action, expression, flip, scale, focus, mouthTest, mouthSample, faceOnly, frozenTime }: {
  character: Character; view: View; action: Action; expression: Expression; flip: boolean; scale: number; focus?: { x: number; y: number }; mouthTest?: Viseme; mouthSample?: import('../engine/visemes.ts').VisemeSample; faceOnly?: boolean; frozenTime?: number;
}) {
  const [animatedElapsed, setElapsed] = useState(0);
  const elapsed = frozenTime ?? animatedElapsed;
  useEffect(() => {
    if (frozenTime !== undefined) return;
    let frame = 0, start = 0, last = -200;
    const animate = (time: number) => {
      if (!start) start = time;
      if (!document.hidden && time - last >= 60) { setElapsed((time - start) / 1000); last = time; }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [frozenTime !== undefined]);
  const mouthMask = 'toon-mouth-' + useId().replace(/:/g, '');
  const speech = mouthSample ?? (mouthTest ? {shape:mouthTest,weight:mouthTest==='rest'?0:1} :
    action === 'talk'
      ? sampleViseme(conversationAudition.text, conversationAudition.duration, elapsed % conversationAudition.duration) : undefined);
  const mood = facialPerformance(elapsed, c.id, action, expression, mouthSample?.weight??0, speech, focus, c.personality);
  const emotion = mood.expression;
  const rear = view === 'back' || view === 'back-quarter';
  const profile = view === 'side';
  const q = view === 'three-quarter' || view === 'back-quarter';
  const width = profile ? .65 : q ? .9 : 1;
  const headW = (c.shape === 'square' ? 41 : 44) * (profile ? .83 : 1) * c.head;
  const headH = (c.shape === 'round' ? 42 : 46) * c.head;
  const headY = -(142 * c.height + 11 * c.torso);
  const shirtBottom = -(71 * c.legs);
  const shoulderY = headY + headH + 17;
  const shirtTop = shoulderY - 5;
  const build=bodyProportions(c), swim=c.outfit==='bikini', bare=swim||c.outfit==='shirtless';
  // Native fallback shares the same deterministic elbow/wrist poses as Pixi.
  const locomotion=action==='walk'||action==='run'?action:'idle';
  // Mirror the accelerated creator's full Sit -> hold -> Stand audition.
  const auditionTime=action==='stand'?elapsed%4:action==='talk'?elapsed%conversationAudition.duration:elapsed;
  const auditionAction=action==='stand'&&auditionTime<1.8?'sit':action;
  const actionTime=action==='stand'&&auditionTime>=1.8?auditionTime-1.8:auditionTime;
  const base=sample(animations[auditionAction],actionTime);
  const occupying = occupiedHands(c, false, action);
  const acting: ActingContext = {
    time: auditionTime, actorId: 'preview',
    action, locomotion, expression, speaking: action === 'talk', listening: action === 'listen',
    occupiedHands: occupying, phrase: action === 'talk' ? conversationAudition : undefined
  };
  const gesture = gestureAt(c, acting);
  const live = livingPose(c, acting, base.pose, gesture);
  const bodyRig = rig(c, live, profile ? .57 : view === 'back-quarter' ? .81 : q ? .88 : 1);
  const armParts = (['left', 'right'] as const).map(side => {
    const hand = handPerformance({ action, locomotion, side, carrying: occupying === side, gesture });
    return { side, ...bodyRig[side], performance: hand };
  });

  const left = -24 * width * c.thickness*build.shoulder;
  const right = -left;
  const hips=19*width*build.hip;
  const chest=build.chest*7;
  const eyeY = headY - 5;
  const faceShift = q ? 8 * viewForward(view) : profile ? 16 : 0;
  const noseX = faceShift + (profile ? 13 : 0);
  const animated = ['wave', 'jump', 'celebrate', 'talk', 'laugh'].includes(action);
  const moving = action === 'walk' || action === 'run';
  const forward = viewForward(view);
  const lift = moving || action==='sit' || action==='stand' ? base.lift : 0;
  const legs = (['left', 'right'] as const).map((side, index) => {
    const upper = { x: (index ? 15 : -15) * width*build.hip, y: shirtBottom };
    const scale = -shirtBottom / 76;
    const [knee, foot] = moving
      ? gaitLeg(upper, scale, elapsed, action, side, forward, lift)
      : action==='sit'||action==='stand'
        ? seatedLeg(upper,scale,lift,side)
        : [{ x: upper.x + (index ? 6 : -5), y: -29 }, { x: upper.x + (index ? 3 : -3), y: -3 }];
    const shoe = moving || q || profile ? forward * 6 : index ? 4 : -4;
    return { side, foot, shoe, path: `M ${upper.x} ${upper.y} L ${knee.x} ${knee.y} L ${foot.x} ${foot.y}` };
  });
  const eyeH = (emotion === 'surprised' || emotion === 'excited' ? 11 : emotion==='nervous'?10 : emotion === 'sleepy' ? 3 : emotion === 'angry' || emotion === 'smug' ? 5 : c.eyes === 'relaxed' ? 5 : 8) * Math.max(.07, 1 - mood.blink);
  const faceCenter = Math.max(-headW * .12, Math.min(headW * .16, faceShift));
  const silhouette = c.shape === 'square'
    ? 'M ' + (-headW + 14) + ' ' + (headY - headH) + ' Q ' + (-headW - 5) + ' ' + (headY - headH) + ' ' + (-headW) + ' ' + (headY - 9) + ' Q ' + (-headW - 4) + ' ' + (headY + headH) + ' 0 ' + (headY + headH) + ' Q ' + headW + ' ' + (headY + headH) + ' ' + headW + ' ' + (headY - 9) + ' Q ' + headW + ' ' + (headY - headH) + ' ' + (headW - 15) + ' ' + (headY - headH) + ' Z'
    : 'M 0 ' + (headY - headH) + ' C ' + (-headW * 1.3) + ' ' + (headY - headH) + ' ' + (-headW * 1.3) + ' ' + (headY + headH * .75) + ' 0 ' + (headY + headH) + ' C ' + (headW * 1.3) + ' ' + (headY + headH * 1.15) + ' ' + (headW * 1.3) + ' ' + (headY - headH) + ' 0 ' + (headY - headH) + ' Z';
  const mainHair = 'M ' + (-headW) + ' ' + (headY - 5) + ' C ' + (-headW - 13) + ' ' + (headY - headH - 9) + ' ' + (-headW / 2) + ' ' + (headY - headH - 13) + ' 2 ' + (headY - headH - 8) + ' C ' + headW + ' ' + (headY - headH - 14) + ' ' + (headW + 6) + ' ' + (headY - headH + 7) + ' ' + headW + ' ' + (headY - 6) + (rear ? ' Q 0 ' + (headY + headH) + ' ' + (-headW) + ' ' + (headY - 5) : ' Q 12 ' + (headY - 22) + ' -3 ' + (headY - 19) + ' Q ' + (-headW + 8) + ' ' + (headY - 10) + ' ' + (-headW) + ' ' + (headY - 5)) + ' Z';
  return <svg className="native-character-svg" viewBox={faceOnly?"175 215 190 145":"0 0 540 540"} role="img" aria-label={'Character preview: ' + c.name + ', ' + view + ' view'}>
    <rect width="540" height="540" fill="#665777"/>
    {Array.from({ length: 6 }, (_, i) => <rect key={i} x={16 + i * 91} y="24" width="65" height="404" rx="31" fill={i % 2 ? '#7c6a90' : '#705f83'}/>)}
    <path d="M 0 443 H 540 V 540 H 0 Z" fill="#4b3c56"/>
    <path d="M 0 443 H 540" stroke="#b99ac7" strokeWidth="3"/>
    <ellipse cx="270" cy="443" rx={37 * scale} ry="7" fill="#382d45" opacity=".4"/>
    <g transform={'translate(270 443) scale(' + (flip ? -scale : scale) + ' ' + scale + ')'}>
      <g className={animated ? 'native-actor native-actor-' + action : ''} transform={lift ? `translate(0 ${-lift})` : undefined}>
        {legs.map(({ side, path, foot, shoe }) => <g key={side}>
          <path d={path} stroke="#211e33" strokeWidth={13 * c.thickness*build.leg} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <path d={path} stroke={swim?c.skin:c.pants} strokeWidth={9 * c.thickness*build.leg} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <ellipse cx={foot.x + shoe} cy={foot.y + 1} rx={13 * c.thickness} ry="6.5" fill={c.shoes} stroke="#242037" strokeWidth="3"/>
        </g>)}
        {armParts.map(({side,shoulder,elbow,hand})=><g key={side}>
          <path d={`M ${shoulder.x} ${shoulder.y} L ${elbow.x} ${elbow.y} L ${hand.x} ${hand.y}`}
            stroke="#242037" strokeWidth={16*c.thickness*build.arm} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <path d={`M ${shoulder.x} ${shoulder.y} L ${elbow.x} ${elbow.y} L ${hand.x} ${hand.y}`}
            stroke={c.skin} strokeWidth={11*c.thickness*build.arm} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          {!bare&&<path d={`M ${shoulder.x} ${shoulder.y} L ${elbow.x} ${elbow.y}`}
            stroke={c.shirt} strokeWidth={16*c.thickness} strokeLinecap="round" fill="none"/>}
        </g>)}
        <path d={'M ' + left + ' ' + shirtTop + ' Q ' + (left - 8 - (profile?0:chest)) + ' ' + shoulderY + ' ' + (left + 3 - (build.waist-1)*14) + ' ' + (shoulderY + 34) + ' L ' + (-hips) + ' ' + shirtBottom + ' Q 0 ' + (shirtBottom + 7) + ' ' + hips + ' ' + shirtBottom + ' L ' + (right - 3 + (build.waist-1)*14) + ' ' + (shoulderY + 34) + ' Q ' + (right + 8 + (rear?0:chest)) + ' ' + shoulderY + ' ' + right + ' ' + shirtTop + ' Q 0 ' + (shirtTop - 12) + ' ' + left + ' ' + shirtTop + ' Z'} fill={bare?c.skin:c.shirt} stroke="#242037" strokeWidth="3"/>
        {swim&&<><path d={`M ${left*.8} ${shirtTop+15} Q 0 ${shirtTop+(rear?20:7)} ${right*.8} ${shirtTop+15} v12 Q0 ${shirtTop+34} ${left*.8} ${shirtTop+27}Z`} fill={c.shirt} stroke="#242037" strokeWidth="2"/>
          <path d={`M ${-hips} ${shirtBottom-5} Q0 ${shirtBottom-2} ${hips} ${shirtBottom-5} L7 ${shirtBottom+13} H-7 Z`} fill={c.pants} stroke="#242037" strokeWidth="2"/></>}
        {c.outfit==='shirtless'&&c.bodyBuild?.abs&&!rear&&<path d={`M0 ${shirtTop+24} V${shirtBottom-5} ${[0,1,2].map(offset=>`M-8 ${shirtTop+29+offset*5} q2 4 6 3 m4-3 q4 1 6-3`).join(' ')}`} fill="none" stroke="#754634" opacity=".58" strokeWidth="1.4"/>}
        {c.outfit === 'hoodie' ? <><path d={'M -15 ' + (shirtTop - 4) + ' Q 0 ' + (shirtTop + 26) + ' 15 ' + (shirtTop - 4)} fill="none" stroke="#41334b" strokeWidth="3"/><path d={'M -5 ' + (shirtTop + 15) + ' v 14 M 5 ' + (shirtTop + 15) + ' v 14'} stroke="#ffebcf" strokeWidth="2"/><path d={'M -14 ' + (shirtBottom - 19) + ' Q 0 ' + (shirtBottom - 11) + ' 14 ' + (shirtBottom - 19) + ' L 14 ' + (shirtBottom - 7) + ' L -14 ' + (shirtBottom - 7) + ' Z'} fill="none" stroke="#423248" strokeWidth="1.5"/></> : null}

        {armParts.map(({ side, hand, elbow, performance }) => {
          const forearm = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
          const rotation = handRotation(forearm, live[`${side}Wrist`] ?? 0, performance.pose, performance.blend, side) * 180 / Math.PI;
          const handRig = sampleHandRig(performance.pose, performance.blend);
          const size = handSize(c.thickness);
          const widthScale = handWidthScale(view, side, handRig.params.wristTwist);
          const fingers = handRig.fingers.map(fingerPath);
          const thumb = fingerPath(handRig.thumb);
          return <g key={side} transform={`translate(${hand.x} ${hand.y}) rotate(${rotation}) scale(${size * widthScale} ${size})`}>
            <g strokeLinecap="round" strokeLinejoin="round" fill="none">
              {fingers.map((d, i) => <path key={i} d={d} stroke="#242037" strokeWidth={handRig.digitWidths[i] + 1.65}/>)}
              {fingers.map((d, i) => <path key={i} d={d} stroke={c.skin} strokeWidth={handRig.digitWidths[i]}/>)}
            </g>
            <path d={handRig.palm} fill={c.skin} stroke="#242037" strokeWidth="1.7"/>
            <path d={thumb} stroke="#242037" strokeWidth={handRig.digitWidths[4] + 1.65} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d={thumb} stroke={c.skin} strokeWidth={handRig.digitWidths[4]} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </g>;
        })}
        {(c.outfit === 'jacket' || c.outfit === 'uniform') && <path d={'M 0 ' + shirtTop + ' V ' + shirtBottom + ' M -11 ' + shirtTop + ' l 11 21 l -17 3 M 11 ' + shirtTop + ' l -11 21 l 17 3'} fill="none" stroke="#33263c" strokeWidth="2"/>}
        {c.accessory === 'chain' && <path d={'M -13 ' + (shirtTop + 6) + ' Q 0 ' + (shirtTop + 36) + ' 13 ' + (shirtTop + 6)} fill="none" stroke="#f8d06d" strokeWidth="3"/>}
        <ellipse cx={-headW + 3} cy={headY + 8} rx="8" ry="9" fill={c.skin} stroke="#252037" strokeWidth="3"/>
        {!profile && <ellipse cx={headW - 3} cy={headY + 8} rx="8" ry="9" fill={c.skin} stroke="#252037" strokeWidth="3"/>}
        <path d={silhouette} fill={c.skin} stroke="#252037" strokeWidth="4"/>
        <path d={'M ' + (-headW + 9) + ' ' + (headY + 8) + ' Q ' + (-headW + 6) + ' ' + (headY + 22) + ' ' + (-headW + 19) + ' ' + (headY + 32)} fill="none" stroke="#754634" strokeWidth="2" opacity=".4"/>
        {c.hair !== 'bald' && <path d={mainHair} fill={c.hairColor} stroke="#282036" strokeWidth="3"/>}
        {(c.hair === 'fade' || c.hair === 'buzz') && <g>
          <path d={'M ' + (-headW+3) + ' ' + (headY-6) + ' Q ' + (-headW+3) + ' ' + (headY-26) + ' ' + (-headW+17) + ' ' + (headY-25) + ' Q ' + (-headW+19) + ' ' + (headY-12) + ' ' + (-headW+3) + ' ' + (headY-6) + ' Z'} fill={c.hair === 'fade' ? c.skin : c.hairColor} opacity={c.hair==='fade' ? .64 : 1}/>
          {Array.from({ length: 7 }, (_, i) => {
            const x=-headW*.66+i*headW*.23, y=headY-headH-8+Math.abs(i-3)*1.5;
            return <path key={i} d={'M ' + x + ' ' + y + ' q 3 -4 6 0'} stroke="#96879f" strokeWidth="1.5" opacity=".5" fill="none"/>;
          })}
          {c.hair === 'fade' && <path d={'M ' + (-headW+7) + ' ' + (headY-18) + ' q 5 -9 12 -7'} stroke="#c1a298" strokeWidth="2" fill="none"/>}
        </g>}
        {c.hair === 'afro' && <path d={'M ' + (-headW-7) + ' ' + (headY-12) + ' C ' + (-headW-25) + ' ' + (headY-35) + ' ' + (-headW-15) + ' ' + (headY-headH-20) + ' ' + (-headW+2) + ' ' + (headY-headH-22) + ' C ' + (-headW+8) + ' ' + (headY-headH-49) + ' 0 ' + (headY-headH-50) + ' 19 ' + (headY-headH-36) + ' C ' + (headW+34) + ' ' + (headY-headH-42) + ' ' + (headW+30) + ' ' + (headY-headH-4) + ' ' + (headW+10) + ' ' + (headY-12) + ' Q 0 ' + (headY-25) + ' ' + (-headW-7) + ' ' + (headY-12) + ' Z'} fill={c.hairColor} stroke="#282036" strokeWidth="3"/>}
        {c.hair === 'puff' && <><path d={'M ' + (-headW*.5-32) + ' ' + (headY-headH-36) + ' C ' + (-headW*.5-48) + ' ' + (headY-headH-66) + ' ' + (-headW*.5-16) + ' ' + (headY-headH-90) + ' ' + (-headW*.5+3) + ' ' + (headY-headH-78) + ' C ' + (-headW*.5+35) + ' ' + (headY-headH-90) + ' ' + (-headW*.5+44) + ' ' + (headY-headH-41) + ' ' + (-headW*.5+20) + ' ' + (headY-headH-31) + ' Q ' + (-headW*.5-5) + ' ' + (headY-headH-21) + ' ' + (-headW*.5-32) + ' ' + (headY-headH-36) + ' Z'} fill={c.hairColor} stroke="#282036" strokeWidth="3"/><path d={'M ' + (-headW*.5-13) + ' ' + (headY-headH-16) + ' q 16 8 27 -1'} stroke="#c2a28a" strokeWidth="3" fill="none"/></>}
        {c.hair === 'curls' && <path d={'M ' + (-headW-6) + ' ' + (headY-13) + ' Q ' + (-headW-22) + ' ' + (headY-headH-11) + ' ' + (-headW+3) + ' ' + (headY-headH-25) + ' Q ' + (-headW+16) + ' ' + (headY-headH-49) + ' -9 ' + (headY-headH-37) + ' Q 10 ' + (headY-headH-63) + ' 25 ' + (headY-headH-36) + ' Q ' + (headW+26) + ' ' + (headY-headH-28) + ' ' + (headW+8) + ' ' + (headY-12) + ' Z'} fill={c.hairColor} stroke="#282036" strokeWidth="3"/>}
        {(['afro', 'curls', 'puff'].includes(c.hair)) && Array.from({ length: 7 }, (_, i) => {
          const x = -30 + (i % 4)*20, y = headY-headH-18-Math.floor(i/4)*17;
          return <path key={i} d={'M ' + (x-7) + ' ' + (y+2) + ' q -1 -9 9 -6 q 5 2 3 7'} stroke="#8b8294" opacity=".46" strokeWidth="1.7" strokeLinecap="round" fill="none"/>;
        })}
        {(['locs', 'braids'].includes(c.hair)) && [-1, 1].flatMap(side => [0, 1].map(i => {
          const x = side * (headW - 4 - i*8);
          const end = headY + 26 + i*8;
          const path = 'M ' + x + ' ' + (headY-headH+6) + ' Q ' + (x+side*9) + ' ' + (headY-12) + ' ' + (x+side*3) + ' ' + end;
          return <g key={side + '-' + i}><path d={path} stroke="#292437" strokeWidth={c.hair === 'braids' ? 9 : 12} strokeLinecap="round" fill="none"/><path d={path} stroke={c.hairColor} strokeWidth={c.hair === 'braids' ? 5.5 : 8} strokeLinecap="round" fill="none"/>{c.hair === 'braids' && Array.from({ length: 5 }, (_, n) => <path key={n} d={'M ' + (x-3) + ' ' + (headY-23+n*8) + ' l 6 4'} stroke="#928093" opacity=".6" strokeWidth="1.5"/>)}</g>;
        }))}
        {c.hat !== 'none' && <><path d={'M ' + (-headW - 3) + ' ' + (headY - headH + 10) + ' Q 0 ' + (headY - headH - 35) + ' ' + (headW + 3) + ' ' + (headY - headH + 10) + ' Z'} fill={c.shirt} stroke="#252037" strokeWidth="3"/><path d={'M ' + (-headW - 3) + ' ' + (headY - headH + 10) + ' H ' + (headW + 3)} stroke="#252037" strokeWidth="5"/></>}
        {!rear && <g>
          {(emotion === 'happy' || emotion === 'excited' || emotion === 'sad') && !profile && [-24,24].map(offset => <ellipse key={offset} cx={Math.max(-headW+12,Math.min(headW-12,faceCenter+offset))} cy={headY+15} rx="6.5" ry="3.5" fill={emotion === 'happy' || emotion === 'excited' ? '#dc8877' : '#897195'} opacity=".22"/>)}
          {[profile ? faceShift : faceShift - 15 * c.eyeSpacing, ...(!profile ? [faceShift + 15 * c.eyeSpacing] : [])].map((x, i) => <g key={i}>
            {eyeH < 1.4 ? <path d={'M ' + (x-7) + ' ' + eyeY + ' q 7 3 14 0'} stroke="#27213a" strokeWidth="2.5" fill="none"/> : <><ellipse cx={x} cy={eyeY} rx="7" ry={eyeH} fill="#fff5e7" stroke="#27213a" strokeWidth="2"/><circle cx={x+Math.max(-4, Math.min(4, mood.gazeX))} cy={eyeY+Math.max(-eyeH+2, Math.min(eyeH-2, mood.gazeY))} r="3" fill="#27213a"/>{eyeH > 3 && <circle cx={x-1+Math.max(-4, Math.min(4, mood.gazeX))} cy={eyeY-1.5+mood.gazeY} r="1.3" fill="white"/>}</>}
            <path d={'M ' + (x-7) + ' ' + (eyeY-eyeH-5) + ' Q ' + x + ' ' + (eyeY-eyeH-(c.brows==='arched'?11:5)) + ' ' + (x+7) + ' ' + (eyeY-eyeH-(emotion==='angry'?2:emotion==='nervous'?(i===0?10:1):5))} stroke="#242036" strokeWidth={c.brows==='bold'?4:2.5} fill="none" strokeLinecap="round"/>
          </g>)}
          <ellipse cx={noseX} cy={headY + 11} rx={c.nose === 'long' ? 7 : 5} ry={c.nose === 'long' ? 6 : 3.5} fill={c.skin} stroke="#2a2339" strokeWidth="2"/>
          {c.beard !== 'none' && <g fill={c.hairColor}>
            <path d={'M ' + (noseX-1) + ' ' + (headY+17) + ' q -6 -5 -15 -1 q 4 7 13 4 Z'}/>
            {!profile && <path d={'M ' + (noseX+1) + ' ' + (headY+17) + ' q 7 -5 15 -1 q -4 7 -13 4 Z'}/>}
            {c.beard === 'goatee' ? <path d={'M ' + (noseX-8) + ' ' + (headY+33) + ' Q ' + noseX + ' ' + (headY+53) + ' ' + (noseX+8) + ' ' + (headY+33) + ' Q ' + noseX + ' ' + (headY+43) + ' ' + (noseX-8) + ' ' + (headY+33) + ' Z'}/> : <path d={'M ' + (-headW+4) + ' ' + (headY+13) + ' Q ' + (-headW+2) + ' ' + (headY+37) + ' 0 ' + (headY+54) + ' Q ' + (headW-2) + ' ' + (headY+37) + ' ' + (headW-4) + ' ' + (headY+13) + ' L ' + (headW-11) + ' ' + (headY+27) + ' Q 0 ' + (headY+50) + ' ' + (-headW+11) + ' ' + (headY+27) + ' Z'}/>}
          </g>}
          <SvgMouthRig character={c} mood={mood} view={view}
            x={noseX} y={headY+27} clipId={mouthMask}/>
          {c.glasses && <><ellipse cx={faceShift - 15} cy={eyeY} rx="14" ry="13" stroke="#30253b" strokeWidth="3" fill="none"/>{!profile && <ellipse cx={faceShift + 15} cy={eyeY} rx="14" ry="13" stroke="#30253b" strokeWidth="3" fill="none"/>}</>}
          {action==='cry'&&<g fill={c.skin} stroke="#27213a" strokeWidth="2.1"><ellipse cx={faceCenter+12} cy={eyeY+2} rx="7" ry="8"/>{!profile&&<ellipse cx={faceCenter-12} cy={eyeY+2} rx="7" ry="8"/>}<ellipse fill="#80d8f3" stroke="none" cx={faceCenter+13} cy={eyeY+15+elapsed*23%16} rx="2" ry="4"/></g>}
          {c.earrings && <circle cx={-headW + 2} cy={headY + 18} r="5" fill="none" stroke="#f5cf6b" strokeWidth="3"/>}
        </g>}
      </g>
    </g>
  </svg>;
}
