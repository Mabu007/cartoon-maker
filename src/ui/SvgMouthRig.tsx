import type { Character, View } from '../engine/schema.ts';
import type { FacialPerformance } from '../engine/facialAnimation.ts';
import { mouthGeometry } from '../engine/mouthRig.ts';

/** Real DOM SVG with per-frame path geometry and an explicit cavity clipPath.
 * Separate tooth nodes allow gold, custom colors and missing teeth.
 */
export function SvgMouthRig({character,mood,view,x,y,clipId}:{
  character:Character;mood:FacialPerformance;view:View;x:number;y:number;clipId:string
}){
  if(view==='back'||view==='back-quarter')return null;
  const model=mouthGeometry(character,mood,view);
  const lipColor=character.wardrobe?.lipColor;
  const lipWeight=character.wardrobe?.lipThickness??1;
  return <g transform={`translate(${x} ${y}) scale(${model.profileScale} 1)`}
    data-mouth-shape={mood.viseme} data-mouth-open={model.open}>
    {model.open?<><defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse">
      <path d={model.cavityPath}/>
    </clipPath></defs>
      <path d={model.cavityPath} fill="#352333" stroke="#291f32" strokeWidth="1.85"/>
      <g clipPath={`url(#${clipId})`} data-mouth-interior="clipped">
        {model.tongue.visible&&<ellipse data-tongue cx={model.tongue.x} cy={model.tongue.y}
          rx={model.tongue.rx} ry={model.tongue.ry} fill="#c66f79" stroke="#9d4a62" strokeWidth=".8"/>}
        {model.teeth.filter(item=>item.height>.3).map(tooth=><g key={tooth.id}>
          {tooth.pointed
            ? <polygon data-tooth={tooth.index} points={`${tooth.x},${tooth.y} ${tooth.x+tooth.width},${tooth.y} ${tooth.x+tooth.width*.58},${tooth.y+tooth.height}`}
              fill={tooth.fill} stroke={tooth.outline} strokeWidth=".48"/>
            : <rect id={`${clipId}-${tooth.id}`} data-tooth={tooth.index} x={tooth.x} y={tooth.y} width={tooth.width} height={tooth.height}
              rx=".6" fill={tooth.fill} stroke={tooth.outline} strokeWidth=".48"/>}
          {character.wardrobe?.toothStyle==='braces'&&<rect x={tooth.x} y={tooth.y+tooth.height*.36} width={tooth.width} height="1" fill="#9098aa"/>}
        </g>)}
      </g>
      <path d={model.upperLipPath} fill="none" stroke={lipColor??'#713d4c'}
        strokeWidth={(character.mouth==='full'?2.1:1.65)*lipWeight} strokeLinecap="round"/>
      <path d={model.lowerLipPath} fill="none" stroke="#653946"
        strokeWidth="1.35" strokeLinecap="round"/>
    </>:<><path d={model.restPath}
       fill="none" stroke={lipColor??'#302438'} strokeWidth={(character.mouth==='full'?3.1:2.5)*lipWeight}
       strokeLinecap="round"/>
       {character.mouth==='full'&&<path d={`M ${-model.rx*.7} 2.4 Q 0 3.3 ${model.rx*.7} 2.2`}
         fill="none" stroke="#693a4a" strokeWidth="1.2"/>}</>}
  </g>;
}
