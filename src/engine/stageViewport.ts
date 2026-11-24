/** Editor-only precision zoom and pan; never changes film camera clips.
 * Pan uses viewport CSS pixels, zoom is centered at the pointer so the
 * world position beneath the cursor remains stationary. */
export type StageViewport={zoom:number;panX:number;panY:number};
export const defaultStageViewport:StageViewport={zoom:1,panX:0,panY:0};
export function zoomStageAt(
  current:StageViewport,next:number,
  pointer:{x:number;y:number},center:{x:number;y:number}
):StageViewport{
  const zoom=Math.max(.5,Math.min(8,next));
  const ratio=zoom/current.zoom;
  return {zoom,
    panX:current.panX+(1-ratio)*(pointer.x-center.x-current.panX),
    panY:current.panY+(1-ratio)*(pointer.y-center.y-current.panY)};
}
export function moveStageViewport(current:StageViewport,dx:number,dy:number):StageViewport{
  return {...current,panX:Math.max(-3000,Math.min(3000,current.panX+dx)),
    panY:Math.max(-3000,Math.min(3000,current.panY+dy))};
}

/** Canvas remains a fixed viewport; only the shared content layer moves.
 * Keep the artwork covering the viewport and never strand it off-screen. */
export function boundStageViewport(current:StageViewport,width:number,height:number):StageViewport{
  const zoom=Math.max(1,Math.min(8,current.zoom));
  if(zoom===1)return {...defaultStageViewport};
  const limitX=Math.max(0,width*(zoom-1)/2),limitY=Math.max(0,height*(zoom-1)/2);
  return {zoom,panX:Math.max(-limitX,Math.min(limitX,current.panX)),panY:Math.max(-limitY,Math.min(limitY,current.panY))};
}
export function zoomCanvasAt(current:StageViewport,next:number,pointer:{x:number;y:number},rect:{left:number;top:number;width:number;height:number}){
  const center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
  return boundStageViewport(zoomStageAt(current,Math.max(1,next),pointer,center),rect.width,rect.height);
}
