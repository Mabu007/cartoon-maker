import { ChevronDown } from 'lucide-react';
import { legacyCameraShots, shotCompositions, shotLabel, shotSizes, type Clip } from '../engine/schema.ts';

type Shot=Extract<Clip,{track:'camera'}>['shot'];
/** Group by actual filmmaking vocabulary without creating a maze of menus. */
export function CameraShotSelect({value,onChange,aria='Camera shot'}:{
  value:Shot;onChange:(next:Shot)=>void;aria?:string;
}) {
  return <span className="select-wrap">
    <select aria-label={aria} value={value} onChange={event=>onChange(event.currentTarget.value as Shot)}>
      <optgroup label="Shot size · distance & framing">
        {shotSizes.map(shot=><option key={shot} value={shot}>{shotLabel(shot)}</option>)}
      </optgroup>
      <optgroup label="Subject & perspective">
        {shotCompositions.map(shot=><option key={shot} value={shot}>{shotLabel(shot)}</option>)}
      </optgroup>
      <optgroup label="Existing SIRVIBE directions">
        {legacyCameraShots.map(shot=><option key={shot} value={shot}>{shotLabel(shot)}</option>)}
      </optgroup>
    </select><ChevronDown size={13}/>
  </span>;
}
export function cameraDirectionHint(shot:Shot,angle:string,movement:string){
  if(['birds-eye','worms-eye','aerial'].includes(angle))
    return 'Stylized 2D framing only: a true overhead or upward camera requires perspective-specific background and character artwork.';
  if(angle==='high-angle'||angle==='low-angle')
    return 'Simulated high/low angle uses 2D reframing, not a newly rendered 3D viewpoint.';
  if(movement==='dolly-zoom')
    return '2D dolly-zoom approximation: reframing and zoom only, without optical perspective or background parallax.';
  if(['point-of-view','over-shoulder'].includes(shot))
    return '2D perspective approximation. Use actor or prop focus and arrange foreground characters on stage for a convincing result.';
  if(['truck-left','truck-right','crane-up','crane-down'].includes(movement))
    return '2D camera translation. True depth parallax is not available in the flat scene.';
  if(movement==='handheld')
    return 'Subtle deterministic handheld motion, previewed and exported identically.';
  if(movement.startsWith('whip-pan'))
    return 'A fast horizontal camera sweep without computationally expensive motion blur.';
  return 'Camera framing is non-destructive. One camera clip is active at a time and is export-ready.';
}
