import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, UserRound } from 'lucide-react';
import { orderedLayers, type LayerMove } from '../engine/sceneLayers.ts';
import type { Scene } from '../engine/schema.ts';
import type { Selection } from '../studio.ts';
import { IconButton, propIcon } from './shared.tsx';

export function SceneLayers({scene,names,selection,select,move,open=true}:{scene:Scene;names:Record<string,string>;selection:Selection;
  open?:boolean;select:(value:Selection)=>void;move:(id:string,direction:LayerMove)=>void}){
  const layers=orderedLayers(scene).reverse();
  const nameOf=(item:typeof layers[number])=>item.kind==='actor'?names[item.id]??'Actor':item.name;
  return <details open={open} className="scene-layers">
    <summary>Scene layers <span className="inspector-count">{layers.length}</span></summary>
    {layers.length>1&&<p className="small-text">Top layers appear in front.</p>}
    <div className="layer-list">
      {layers.map((item,index)=>{
        const actor=item.kind==='actor', Icon=actor?UserRound:propIcon[scene.objects.find(object=>object.id===item.id)!.kind];
        const name=nameOf(item);
        const selected=selection?.id===item.id;
        return <div key={item.id} className={`layer-row ${selected?'is-selected':''}`}>
          <button type="button" aria-pressed={selected} className="layer-select" aria-label={'Select layer '+name} onClick={()=>select({kind:item.kind,id:item.id})}>
            <Icon size={14}/><span>{name}</span>
          </button>
          {selected&&<><div className="layer-order-tools" role="group" aria-label={'Reorder '+name}>
            <IconButton title="Bring to front" disabled={index===0} onClick={()=>move(item.id,'front')}><ArrowUpToLine size={15}/></IconButton>
            <IconButton title="Move one layer forward" disabled={index===0} onClick={()=>move(item.id,'forward')}><ArrowUp size={15}/></IconButton>
            <IconButton title="Move one layer backward" disabled={index===layers.length-1} onClick={()=>move(item.id,'backward')}><ArrowDown size={15}/></IconButton>
            <IconButton title="Send to back" disabled={index===layers.length-1} onClick={()=>move(item.id,'back')}><ArrowDownToLine size={15}/></IconButton>
          </div>
          {layers.length>1&&<select aria-label={'Place '+name+' relative to another layer'} className="layer-relative" value=""
            onChange={event=>{
              const [side,...id]=event.currentTarget.value.split('/');
              if(side==='ahead'||side==='behind')move(item.id,{side,reference:id.join('/')});
            }}>
            <option value="" disabled>Place relative to…</option>
            {(['ahead','behind'] as const).map(side=><optgroup key={side} label={side==='ahead'?'In front of':'Behind'}>
              {layers.filter(other=>other.id!==item.id).map(other=><option key={other.id} value={side+'/'+other.id}>
                {(side==='ahead'?'In front of ':'Behind ')+nameOf(other)}
              </option>)}
            </optgroup>)}
          </select>}
          </>}

        </div>;
      })}
      {!layers.length&&<p className="empty-small">Add an actor or prop to the scene.</p>}
    </div>
  </details>;
}
