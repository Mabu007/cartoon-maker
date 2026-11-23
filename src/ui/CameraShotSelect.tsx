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
export { cameraDirectionHint } from '../engine/cameraDirector.ts';
