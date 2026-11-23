/**
 * Small live SIRVIBE character viewport, not a secondary puppet renderer.
 * Draws the same 2D rigs, mouth shapes, captured hand poses and timeline
 * performance clips as editor playback/export. Runs only while Studio is open.
 */
import { createRenderer } from '../engine/renderer.ts';
import { LIVE_PREVIEW_TIME,livePerformanceScene } from '../engine/livePerformanceScene.ts';
import type { PerformanceKey } from '../engine/performanceCapture.ts';
import type { Character, Scene } from '../engine/schema.ts';

export async function createPerformancePreview(
  host:HTMLElement,scene:Scene,characters:Character[]
) {
  // The reduced internal resolution is intentional for low-end GPUs. CSS
  // scales the canvas with the available viewport, without more render work.
  const renderer=await createRenderer('16:9',.65);
  renderer.canvas.classList.add('performance-character-canvas');
  renderer.canvas.setAttribute('aria-label','Live cartoon character driven by your webcam movements');
  host.appendChild(renderer.canvas);
  let closed=false;
  return {
    draw(actorId:string,key?:PerformanceKey) {
      if(closed)return;
      renderer.draw(livePerformanceScene(scene,actorId,key),characters,LIVE_PREVIEW_TIME,{
        characterPreview:true,previewCamera:true
      });
    },
    destroy(){
      if(closed)return;
      closed=true;
      renderer.destroy();
    }
  };
}
export type PerformancePreview=Awaited<ReturnType<typeof createPerformancePreview>>;
