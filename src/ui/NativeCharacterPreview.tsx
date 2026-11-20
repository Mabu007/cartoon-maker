import type { Action, Character, Expression, View } from '../engine/schema.ts';

/**
 * Browser-native SVG is deliberately independent of Pixi and WebGL. If the
 * accelerated stage can't initialize or loses its graphics context, character
 * creation stays available using this lightweight, parametric preview.
 */
export function NativeCharacterPreview({ character: c, view, action, expression, flip, scale }: {
  character: Character; view: View; action: Action; expression: Expression; flip: boolean; scale: number;
}) {
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
  const mouthOpen = expression === 'surprised' || action === 'talk' || action === 'laugh';
  const eyeH = expression === 'surprised' ? 11 : expression === 'angry' ? 5 : c.eyes === 'relaxed' ? 5 : 8;
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
          {[profile ? faceShift : faceShift - 15 * c.eyeSpacing, ...(!profile ? [faceShift + 15 * c.eyeSpacing] : [])].map((x, i) => <g key={i}>
            <ellipse cx={x} cy={eyeY} rx="7" ry={eyeH} fill="#fff5e7" stroke="#27213a" strokeWidth="2"/>
            <circle cx={x + (q ? 2 : 0)} cy={eyeY + 1} r="3" fill="#27213a"/>
            <circle cx={x - 1} cy={eyeY - 2} r="1.5" fill="white"/>
            <path d={'M ' + (x - 7) + ' ' + (eyeY - eyeH - 5) + ' Q ' + x + ' ' + (eyeY - eyeH - (c.brows === 'arched' ? 11 : 5)) + ' ' + (x + 7) + ' ' + (eyeY - eyeH - (expression === 'angry' ? 2 : 5))} stroke="#242036" strokeWidth={c.brows === 'bold' ? 4 : 2.5} fill="none" strokeLinecap="round"/>
          </g>)}
          <ellipse cx={noseX} cy={headY + 11} rx={c.nose === 'long' ? 7 : 5} ry={c.nose === 'long' ? 6 : 3.5} fill={c.skin} stroke="#2a2339" strokeWidth="2"/>
          {c.beard !== 'none' && <path d={'M ' + (noseX - 13) + ' ' + (headY + 26) + ' Q ' + noseX + ' ' + (headY + (c.beard === 'full' ? 52 : 42)) + ' ' + (noseX + 13) + ' ' + (headY + 26)} stroke={c.hairColor} strokeWidth={c.beard === 'full' ? 8 : 3} fill="none"/>}
          {mouthOpen ? <ellipse cx={noseX} cy={headY + 27} rx={expression === 'surprised' ? 7 : 11} ry={expression === 'surprised' ? 9 : 5} fill="#302033"/> : <path d={'M ' + (noseX - 10) + ' ' + (headY + 26) + ' Q ' + noseX + ' ' + (headY + (expression === 'sad' || expression === 'angry' ? 18 : 37)) + ' ' + (noseX + 10) + ' ' + (headY + 26)} stroke="#2a2038" strokeWidth="2.7" fill="none" strokeLinecap="round"/>}
          {c.glasses && <><ellipse cx={faceShift - 15} cy={eyeY} rx="14" ry="13" stroke="#30253b" strokeWidth="3" fill="none"/>{!profile && <ellipse cx={faceShift + 15} cy={eyeY} rx="14" ry="13" stroke="#30253b" strokeWidth="3" fill="none"/>}</>}
          {c.earrings && <circle cx={-headW + 2} cy={headY + 18} r="5" fill="none" stroke="#f5cf6b" strokeWidth="3"/>}
        </g>}
      </g>
    </g>
  </svg>;
}
