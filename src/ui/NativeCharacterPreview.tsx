import { useEffect, useState } from 'react';
import { facialPerformance } from '../engine/facialAnimation.ts';
import type { Action, Character, Expression, View } from '../engine/schema.ts';

/**
 * Browser-native SVG is deliberately independent of Pixi and WebGL. If the
 * accelerated stage can't initialize or loses its graphics context, character
 * creation stays available using this lightweight, parametric preview.
 */
export function NativeCharacterPreview({ character: c, view, action, expression, flip, scale }: {
  character: Character; view: View; action: Action; expression: Expression; flip: boolean; scale: number;
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
  const mood = facialPerformance(elapsed, c.id, action, expression);
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
  const mouthOpen = emotion === 'surprised' || mood.mouthOpen > .16;
  const eyeH = (emotion === 'surprised' ? 11 : emotion === 'angry' ? 5 : c.eyes === 'relaxed' ? 5 : 8) * Math.max(.07, 1 - mood.blink);
  const faceCenter = Math.max(-headW * .12, Math.min(headW * .16, faceShift));
  const silhouette = c.shape === 'square'
    ? 'M ' + (-headW + 14) + ' ' + (headY - headH) + ' Q ' + (-headW - 5) + ' ' + (headY - headH) + ' ' + (-headW) + ' ' + (headY - 9) + ' Q ' + (-headW - 4) + ' ' + (headY + headH) + ' 0 ' + (headY + headH) + ' Q ' + headW + ' ' + (headY + headH) + ' ' + headW + ' ' + (headY - 9) + ' Q ' + headW + ' ' + (headY - headH) + ' ' + (headW - 15) + ' ' + (headY - headH) + ' Z'
    : 'M 0 ' + (headY - headH) + ' C ' + (-headW * 1.3) + ' ' + (headY - headH) + ' ' + (-headW * 1.3) + ' ' + (headY + headH * .75) + ' 0 ' + (headY + headH) + ' C ' + (headW * 1.3) + ' ' + (headY + headH * 1.15) + ' ' + (headW * 1.3) + ' ' + (headY - headH) + ' 0 ' + (headY - headH) + ' Z';
  const mainHair = 'M ' + (-headW) + ' ' + (headY - 5) + ' C ' + (-headW - 13) + ' ' + (headY - headH - 9) + ' ' + (-headW / 2) + ' ' + (headY - headH - 13) + ' 2 ' + (headY - headH - 8) + ' C ' + headW + ' ' + (headY - headH - 14) + ' ' + (headW + 6) + ' ' + (headY - headH + 7) + ' ' + headW + ' ' + (headY - 6) + (rear ? ' Q 0 ' + (headY + headH) + ' ' + (-headW) + ' ' + (headY - 5) : ' Q 12 ' + (headY - 22) + ' -3 ' + (headY - 19) + ' Q ' + (-headW + 8) + ' ' + (headY - 10) + ' ' + (-headW) + ' ' + (headY - 5)) + ' Z';
  return <svg className="native-character-svg" viewBox="0 0 540 540" role="img" aria-label={'Character preview: ' + c.name + ', ' + view + ' view'}>
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
        {(c.outfit === 'jacket' || c.outfit === 'uniform') && <path d={'M 0 ' + shirtTop + ' V ' + shirtBottom + ' M -11 ' + shirtTop + ' l 11 21 l -17 3 M 11 ' + shirtTop + ' l -11 21 l 17 3'} fill="none" stroke="#33263c" strokeWidth="2"/>}
        {c.accessory === 'chain' && <path d={'M -13 ' + (shirtTop + 6) + ' Q 0 ' + (shirtTop + 36) + ' 13 ' + (shirtTop + 6)} fill="none" stroke="#f8d06d" strokeWidth="3"/>}
        <ellipse cx={-headW + 3} cy={headY + 8} rx="8" ry="9" fill={c.skin} stroke="#252037" strokeWidth="3"/>
        {!profile && <ellipse cx={headW - 3} cy={headY + 8} rx="8" ry="9" fill={c.skin} stroke="#252037" strokeWidth="3"/>}
        <path d={silhouette} fill={c.skin} stroke="#252037" strokeWidth="4"/>
        <path d={'M ' + (-headW + 9) + ' ' + (headY + 8) + ' Q ' + (-headW + 6) + ' ' + (headY + 22) + ' ' + (-headW + 19) + ' ' + (headY + 32)} fill="none" stroke="#754634" strokeWidth="2" opacity=".4"/>
        {c.hair !== 'bald' && <path d={mainHair} fill={c.hairColor} stroke="#282036" strokeWidth="3"/>}
        {(['afro', 'puff', 'curls'].includes(c.hair)) && Array.from({ length: 6 }, (_, i) => <circle key={i} cx={-headW + 10 + i * (headW * 2 - 20) / 5} cy={headY - headH - (i % 2 ? 9 : 6)} r={c.hair === 'curls' ? 11 : 16} fill={c.hairColor} stroke="#282036" strokeWidth="2.5"/>)}
        {(['locs', 'braids'].includes(c.hair)) && Array.from({ length: 6 }, (_, i) => <path key={i} d={'M ' + (-headW + 10 + i * (headW * 2 - 20) / 5) + ' ' + (headY - headH + 5) + ' q ' + (i % 2 ? 5 : -4) + ' 29 1 48'} stroke={c.hairColor} strokeWidth={c.hair === 'braids' ? 6 : 10} strokeLinecap="round" fill="none"/>)}
        {c.hat !== 'none' && <><path d={'M ' + (-headW - 3) + ' ' + (headY - headH + 10) + ' Q 0 ' + (headY - headH - 35) + ' ' + (headW + 3) + ' ' + (headY - headH + 10) + ' Z'} fill={c.shirt} stroke="#252037" strokeWidth="3"/><path d={'M ' + (-headW - 3) + ' ' + (headY - headH + 10) + ' H ' + (headW + 3)} stroke="#252037" strokeWidth="5"/></>}
        {!rear && <g>
          {(emotion === 'happy' || emotion === 'sad') && !profile && [-24,24].map(offset => <ellipse key={offset} cx={Math.max(-headW+12,Math.min(headW-12,faceCenter+offset))} cy={headY+15} rx="6.5" ry="3.5" fill={emotion === 'happy' ? '#dc8877' : '#897195'} opacity=".22"/>)}
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
          {emotion === 'surprised' ? <ellipse cx={noseX} cy={headY+27} rx="7" ry="10" fill="#302033"/> :
            mouthOpen ? <><ellipse cx={noseX} cy={headY+27} rx={emotion==='happy'?13:10} ry={3+mood.mouthOpen*8} fill="#302033"/><path d={'M ' + (noseX-7) + ' ' + (headY+23) + ' h 14'} stroke="#ffedde" strokeWidth="3"/></> :
            emotion === 'happy' ? <path d={'M ' + (noseX-13) + ' ' + (headY+24) + ' Q ' + noseX + ' ' + (headY+42) + ' ' + (noseX+13) + ' ' + (headY+24) + ' Q ' + noseX + ' ' + (headY+34) + ' ' + (noseX-13) + ' ' + (headY+24) + ' Z'} fill="#302033"/> :
            emotion === 'thinking' ? <ellipse cx={noseX+3} cy={headY+27} rx="4" ry="3" fill="#302033"/> :
            <path d={'M ' + (noseX-10) + ' ' + (headY+26) + ' Q ' + noseX + ' ' + (headY+(emotion==='sad'||emotion==='angry'?19:26.5)) + ' ' + (noseX+10) + ' ' + (headY+26)} stroke="#2a2038" strokeWidth="2.7" fill="none" strokeLinecap="round"/>}
          {c.glasses && <><ellipse cx={faceShift - 15} cy={eyeY} rx="14" ry="13" stroke="#30253b" strokeWidth="3" fill="none"/>{!profile && <ellipse cx={faceShift + 15} cy={eyeY} rx="14" ry="13" stroke="#30253b" strokeWidth="3" fill="none"/>}</>}
          {c.earrings && <circle cx={-headW + 2} cy={headY + 18} r="5" fill="none" stroke="#f5cf6b" strokeWidth="3"/>}
        </g>}
      </g>
    </g>
  </svg>;
}
