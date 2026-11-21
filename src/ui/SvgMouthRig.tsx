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
  const asym=model.parameters.asymmetry;
  return <g transform={`translate(${x} ${y}) scale(${model.profileScale} 1)`}
    data-mouth-shape={mood.viseme} data-mouth-open={model.open}>
    {model.open?<><defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse">
      <path d={model.cavityPath}/>
    </clipPath></defs>
      <path d={model.cavityPath} fill="#352333" stroke="#291f32" strokeWidth="1.85"/>
      <g clipPath={`url(#${clipId})`} data-mouth-interior="clipped">
        {model.tongue.visible&&<ellipse data-tongue cx={model.tongue.x} cy={model.tongue.y}
          rx={model.tongue.rx} ry={model.tongue.ry} fill="#c66f79" stroke="#9d4a62" strokeWidth=".8"/>}
        {model.teeth.filter(item=>item.height>.3).map(tooth=>
          <rect key={tooth.id} id={`${clipId}-${tooth.id}`} data-tooth={tooth.index}
            x={tooth.x} y={tooth.y} width={tooth.width} height={tooth.height}
            rx=".6" fill={tooth.fill} stroke={tooth.outline} strokeWidth=".48"/>)}
      </g>
      <path d={model.upperLipPath} fill="none" stroke="#713d4c"
        strokeWidth={character.mouth==='full'?2.1:1.65} strokeLinecap="round"/>
      <path d={model.lowerLipPath} fill="none" stroke="#653946"
        strokeWidth="1.35" strokeLinecap="round"/>
    </>:<><path d={`M ${-model.rx} ${asym*1.9} Q 0 ${mood.expression==='sad'?-2.6:1.4} ${model.rx} ${-asym*1.9}`}
       fill="none" stroke="#302438" strokeWidth={character.mouth==='full'?3.1:2.5}
       strokeLinecap="round"/>
       {character.mouth==='full'&&<path d={`M ${-model.rx*.7} 2.4 Q 0 3.3 ${model.rx*.7} 2.2`}
         fill="none" stroke="#693a4a" strokeWidth="1.2"/>}</>}
  </g>;
}
