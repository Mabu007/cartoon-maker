import { useEffect, useId, useState } from 'react';
import { sampleViseme } from '../engine/visemes.ts';
import { facialPerformance } from '../engine/facialAnimation.ts';
import type { Action, Character, Expression, View } from '../engine/schema.ts';

/**
 * Browser-native SVG is deliberately independent of Pixi and WebGL. If the
 * accelerated stage can't initialize or loses its graphics context, character
 * creation stays available using this lightweight, parametric preview.
 */
export function NativeCharacterPreview({ character: c, view, action, expression, flip, scale, focus }: {
  character: Character; view: View; action: Action; expression: Expression; flip: boolean; scale: number; focus?: { x: number; y: number };
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    let frame = 0, start = 0, last = -200;
    const animate = (time: number) => {
      if (!start) start = time;
      if (!document.hidden && time - last >= 60) { setElapsed((time - start) / 1000); last = time; }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  const mouthMask = useId();
  const speech = action === 'talk'
    ? sampleViseme('Hello there! Let us create a cartoon. Watch my mouth moving!', 8, elapsed % 8) : undefined;
  const mood = facialPerformance(elapsed, c.id, action, expression, 0, speech, focus);
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
  const left = -24 * width * c.thickness;
  const right = 24 * width * c.thickness;
  const eyeY = headY - 5;
  const faceShift = q ? 8 : profile ? 16 : 0;
  const noseX = faceShift + (profile ? 13 : 0);
  const animated = ['walk', 'run', 'wave', 'jump', 'celebrate', 'talk', 'laugh'].includes(action);
  const mouthOpen = !speech || (speech.shape !== 'closed' && speech.shape !== 'rest')
    ? emotion === 'surprised' || emotion === 'excited' || emotion === 'happy' || mood.mouthOpen > .16
    : false;
  const mouthRadiusX = speech?.shape === 'pucker' ? 5 : speech?.shape === 'wide' ? 15 :
    speech?.shape === 'round' ? 8 : emotion === 'excited' ? 15 : 11;
  const mouthRadiusY = speech?.shape === 'pucker' ? 5.5 : speech?.shape === 'bite' ? 4 :
    speech?.shape === 'round' ? 3 + mood.mouthOpen * 10 :
    emotion === 'surprised' ? 10 : 3 + Math.max(mood.mouthOpen, emotion === 'happy' ? .6 : .1) * 8;
  const eyeH = (emotion === 'surprised' || emotion === 'excited' ? 11 : emotion === 'sleepy' ? 3 : emotion === 'angry' || emotion === 'smug' ? 5 : c.eyes === 'relaxed' ? 5 : 8) * Math.max(.07, 1 - mood.blink);
  const faceCenter = Math.max(-headW * .12, Math.min(headW * .16, faceShift));
  const silhouette = c.shape === 'square'
    ? 'M ' + (-headW + 14) + ' ' + (headY - headH) + ' Q ' + (-headW - 5) + ' ' + (headY - headH) + ' ' + (-headW) + ' ' + (headY - 9) + ' Q ' + (-headW - 4) + ' ' + (headY + headH) + ' 0 ' + (headY + headH) + ' Q ' + headW + ' ' + (headY + headH) + ' ' + headW + ' ' + (headY - 9) + ' Q ' + headW + ' ' + (headY - headH) + ' ' + (headW - 15) + ' ' + (headY - headH) + ' Z'
    : 'M 0 ' + (headY - headH) + ' C ' + (-headW * 1.3) + ' ' + (headY - headH) + ' ' + (-headW * 1.3) + ' ' + (headY + headH * .75) + ' 0 ' + (headY + headH) + ' C ' + (headW * 1.3) + ' ' + (headY + headH * 1.15) + ' ' + (headW * 1.3) + ' ' + (headY - headH) + ' 0 ' + (headY - headH) + ' Z';
  const mainHair = 'M ' + (-headW) + ' ' + (headY - 5) + ' C ' + (-headW - 13) + ' ' + (headY - headH - 9) + ' ' + (-headW / 2) + ' ' + (headY - headH - 13) + ' 2 ' + (headY - headH - 8) + ' C ' + headW + ' ' + (headY - headH - 14) + ' ' + (headW + 6) + ' ' + (headY - headH + 7) + ' ' + headW + ' ' + (headY - 6) + (rear ? ' Q 0 ' + (headY + headH) + ' ' + (-headW) + ' ' + (headY - 5) : ' Q 12 ' + (headY - 22) + ' -3 ' + (headY - 19) + ' Q ' + (-headW + 8) + ' ' + (headY - 10) + ' ' + (-headW) + ' ' + (headY - 5)) + ' Z';
  return <svg className="native-character-svg" viewBox="0 0 540 540" role="img" aria-label={'Character preview: ' + c.name + ', ' + view + ' view'}>
    <defs><clipPath id={mouthMask}><ellipse cx={noseX} cy={headY+27} rx={mouthRadiusX} ry={mouthRadiusY}/></clipPath></defs>
    <rect width="540" height="540" fill="#665777"/>
    {Array.from({ length: 6 }, (_, i) => <rect key={i} x={16 + i * 91} y="24" width="65" height="404" rx="31" fill={i % 2 ? '#7c6a90' : '#705f83'}/>)}
    <path d="M 0 443 H 540 V 540 H 0 Z" fill="#4b3c56"/>
    <path d="M 0 443 H 540" stroke="#b99ac7" strokeWidth="3"/>
    <ellipse cx="270" cy="443" rx={37 * scale} ry="7" fill="#382d45" opacity=".4"/>
    <g transform={'translate(270 443) scale(' + (flip ? -scale : scale) + ' ' + scale + ')'}>
      <g className={animated ? 'native-actor native-actor-' + action : ''}>
        <path d={'M -15 ' + shirtBottom + ' Q -20 -28 -18 -3'} stroke="#211e33" strokeWidth={13 * c.thickness} strokeLinecap="round" fill="none" className="native-leg-left"/>
        <path d={'M 15 ' + shirtBottom + ' Q 21 -31 18 -3'} stroke="#211e33" strokeWidth={13 * c.thickness} strokeLinecap="round" fill="none" className="native-leg-right"/>
        <path d={'M -15 ' + shirtBottom + ' Q -20 -28 -18 -3 M 15 ' + shirtBottom + ' Q 21 -31 18 -3'} stroke={c.pants} strokeWidth={9 * c.thickness} strokeLinecap="round" fill="none"/>
        <ellipse cx="-21" cy="-1" rx="17" ry="7" fill={c.shoes} stroke="#242037" strokeWidth="3"/>
        <ellipse cx="21" cy="-1" rx="17" ry="7" fill={c.shoes} stroke="#242037" strokeWidth="3"/>
        <path d={'M ' + (left + 2) + ' ' + shoulderY + ' Q ' + (left - 19) + ' ' + (shoulderY + 19) + ' ' + (left - 12) + ' ' + (shoulderY + 44)} stroke={c.skin} strokeWidth={12 * c.thickness} fill="none" strokeLinecap="round" className="native-arm-left"/>
        <path d={'M ' + (right - 2) + ' ' + shoulderY + ' Q ' + (right + 19) + ' ' + (shoulderY + 19) + ' ' + (right + 13) + ' ' + (shoulderY + 44)} stroke={c.skin} strokeWidth={12 * c.thickness} fill="none" strokeLinecap="round" className="native-arm-right"/>
        <path d={'M ' + (left + 2) + ' ' + shoulderY + ' Q ' + (left - 16) + ' ' + (shoulderY + 17) + ' ' + (left - 15) + ' ' + (shoulderY + 25)} stroke={c.shirt} strokeWidth={15 * c.thickness} fill="none" strokeLinecap="round"/>
        <path d={'M ' + (right - 2) + ' ' + shoulderY + ' Q ' + (right + 16) + ' ' + (shoulderY + 17) + ' ' + (right + 15) + ' ' + (shoulderY + 25)} stroke={c.shirt} strokeWidth={15 * c.thickness} fill="none" strokeLinecap="round"/>
        <path d={'M ' + left + ' ' + shirtTop + ' Q ' + (left - 8) + ' ' + shoulderY + ' ' + (left + 3) + ' ' + (shoulderY + 34) + ' L ' + (-19 * width) + ' ' + shirtBottom + ' Q 0 ' + (shirtBottom + 7) + ' ' + (19 * width) + ' ' + shirtBottom + ' L ' + (right - 3) + ' ' + (shoulderY + 34) + ' Q ' + (right + 8) + ' ' + shoulderY + ' ' + right + ' ' + shirtTop + ' Q 0 ' + (shirtTop - 12) + ' ' + left + ' ' + shirtTop + ' Z'} fill={c.shirt} stroke="#242037" strokeWidth="3"/>
        {c.outfit === 'hoodie' ? <><path d={'M -15 ' + (shirtTop - 4) + ' Q 0 ' + (shirtTop + 26) + ' 15 ' + (shirtTop - 4)} fill="none" stroke="#41334b" strokeWidth="3"/><path d={'M -5 ' + (shirtTop + 15) + ' v 14 M 5 ' + (shirtTop + 15) + ' v 14'} stroke="#ffebcf" strokeWidth="2"/><path d={'M -14 ' + (shirtBottom - 19) + ' Q 0 ' + (shirtBottom - 11) + ' 14 ' + (shirtBottom - 19) + ' L 14 ' + (shirtBottom - 7) + ' L -14 ' + (shirtBottom - 7) + ' Z'} fill="none" stroke="#423248" strokeWidth="1.5"/></> : null}
        <g stroke="#242037" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" fill={c.skin}>
          <path d={'M ' + (left-17) + ' ' + (shoulderY+41) + ' q -8 -2 -10 4 q -1 6 4 11 q 7 4 13 -3 q 6 -6 2 -12 Z'}/>
          <path d={action === 'point'
            ? 'M ' + (right+8) + ' ' + (shoulderY+40) + ' q 7 -4 13 1 l 24 -4 q 6 0 6 4 q 0 4 -5 5 l -22 4 q 1 7 -7 10 q -11 4 -15 -6 q -1 -10 6 -14 Z'
            : action === 'wave' || action === 'talk'
              ? 'M ' + (right+7) + ' ' + (shoulderY+49) + ' q -7 -9 -5 -16 l -4 -17 q 0 -5 4 -5 q 5 0 7 14 l 2 -16 q 1 -5 5 -4 q 3 1 2 6 l 0 14 l 4 -14 q 2 -5 5 -3 q 3 2 1 7 l -3 14 q 5 -8 8 -4 q 3 4 -3 10 l -9 15 q -12 8 -17 -1 Z'
              : 'M ' + (right+8) + ' ' + (shoulderY+42) + ' q -3 -8 5 -11 q 4 -3 9 0 q 5 -2 8 2 q 5 6 -1 12 q -5 9 -15 9 q -9 -2 -6 -12 Z'}/>
          <path d={'M ' + (right+15) + ' ' + (shoulderY+40) + ' q 5 -3 7 1 M ' + (left-22) + ' ' + (shoulderY+49) + ' q 7 -3 10 2'} fill="none" stroke="#815544" strokeWidth="1.2"/>
        </g>
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
            <path d={'M ' + (x-7) + ' ' + (eyeY-eyeH-5) + ' Q ' + x + ' ' + (eyeY-eyeH-(c.brows==='arched'?11:5)) + ' ' + (x+7) + ' ' + (eyeY-eyeH-(emotion==='angry'?2:5))} stroke="#242036" strokeWidth={c.brows==='bold'?4:2.5} fill="none" strokeLinecap="round"/>
          </g>)}
          <ellipse cx={noseX} cy={headY + 11} rx={c.nose === 'long' ? 7 : 5} ry={c.nose === 'long' ? 6 : 3.5} fill={c.skin} stroke="#2a2339" strokeWidth="2"/>
          {c.beard !== 'none' && <g fill={c.hairColor}>
            <path d={'M ' + (noseX-1) + ' ' + (headY+17) + ' q -6 -5 -15 -1 q 4 7 13 4 Z'}/>
            {!profile && <path d={'M ' + (noseX+1) + ' ' + (headY+17) + ' q 7 -5 15 -1 q -4 7 -13 4 Z'}/>}
            {c.beard === 'goatee' ? <path d={'M ' + (noseX-8) + ' ' + (headY+33) + ' Q ' + noseX + ' ' + (headY+53) + ' ' + (noseX+8) + ' ' + (headY+33) + ' Q ' + noseX + ' ' + (headY+43) + ' ' + (noseX-8) + ' ' + (headY+33) + ' Z'}/> : <path d={'M ' + (-headW+4) + ' ' + (headY+13) + ' Q ' + (-headW+2) + ' ' + (headY+37) + ' 0 ' + (headY+54) + ' Q ' + (headW-2) + ' ' + (headY+37) + ' ' + (headW-4) + ' ' + (headY+13) + ' L ' + (headW-11) + ' ' + (headY+27) + ' Q 0 ' + (headY+50) + ' ' + (-headW+11) + ' ' + (headY+27) + ' Z'}/>}
          </g>}
          {mouthOpen ? <>
            <ellipse cx={noseX} cy={headY+27} rx={mouthRadiusX} ry={mouthRadiusY} fill="#302033" stroke="#28223a" strokeWidth="1.7"/>
            <g clipPath={'url(#' + mouthMask + ')'}>
              {Array.from({length:6},(_,i) => {
                const step=mouthRadiusX*1.54/6;
                return <rect key={i} x={noseX-mouthRadiusX*.77+i*step+.6} y={headY+27-mouthRadiusY+.75}
                  width={Math.max(1, step-1.2)} height={mouthRadiusY*.95} rx=".5"
                  fill={(c.goldTeeth ?? []).includes(i) ? '#eac05c' : '#fff4de'}
                  stroke={(c.goldTeeth ?? []).includes(i) ? '#a77e34' : '#e2d5c7'} strokeWidth=".35"/>;
              })}
              {mouthRadiusY > 5 && <ellipse cx={noseX} cy={headY+27+mouthRadiusY*.65} rx={mouthRadiusX*.45} ry="2.5" fill="#bb687d"/>}
            </g>
            <path d={'M ' + (noseX-mouthRadiusX*.8) + ' ' + (headY+27-mouthRadiusY*.45) + ' Q ' + noseX + ' ' + (headY+27-mouthRadiusY-1) + ' ' + (noseX+mouthRadiusX*.8) + ' ' + (headY+27-mouthRadiusY*.45)} stroke="#693c4a" strokeWidth="1.4" fill="none"/>
          </> :
            emotion === 'thinking' ? <ellipse cx={noseX+3} cy={headY+27} rx="4" ry="3" fill="#302033"/> :
            emotion === 'confused' ? <path d={'M ' + (noseX-10) + ' ' + (headY+25) + ' q 8 -6 20 3'} stroke="#302033" strokeWidth="2.7" fill="none"/> :
            emotion === 'smug' ? <path d={'M ' + (noseX-10) + ' ' + (headY+27) + ' Q ' + noseX + ' ' + (headY+31) + ' ' + (noseX+10) + ' ' + (headY+23)} stroke="#302033" strokeWidth="2.7" fill="none"/> :
            emotion === 'sleepy' ? <path d={'M ' + (noseX-8) + ' ' + (headY+26) + ' q 8 3 16 0'} stroke="#302033" strokeWidth="2.1" fill="none"/> :
            <path d={'M ' + (noseX-10) + ' ' + (headY+26) + ' Q ' + noseX + ' ' + (headY+(emotion==='sad'||emotion==='angry'?19:26.5)) + ' ' + (noseX+10) + ' ' + (headY+26)} stroke="#2a2038" strokeWidth="2.7" fill="none" strokeLinecap="round"/>}
          {c.glasses && <><ellipse cx={faceShift - 15} cy={eyeY} rx="14" ry="13" stroke="#30253b" strokeWidth="3" fill="none"/>{!profile && <ellipse cx={faceShift + 15} cy={eyeY} rx="14" ry="13" stroke="#30253b" strokeWidth="3" fill="none"/>}</>}
          {c.earrings && <circle cx={-headW + 2} cy={headY + 18} r="5" fill="none" stroke="#f5cf6b" strokeWidth="3"/>}
        </g>}
      </g>
    </g>
  </svg>;
}
