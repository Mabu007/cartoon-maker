import {startPerformanceTracker,type PerformanceTracker,type TrackerOptions} from './performanceTracker.ts';
import type {CaptureFrame} from '../engine/performanceCapture.ts';
export type AsyncCapture={frame?:CaptureFrame;inferenceMs:number};
export type AsyncPerformanceTracker={
  detect:(video:HTMLVideoElement,at:number)=>Promise<AsyncCapture>;
  close:()=>void;features:PerformanceTracker['features'];warnings:string[];mode:'worker'|'fallback';
};
function fallback(tracker:PerformanceTracker,warnings:string[]):AsyncPerformanceTracker{
  return {mode:'fallback',features:tracker.features,warnings:[...warnings,...tracker.warnings],
    async detect(video,at){const start=performance.now();return {frame:tracker.detect(video,at),inferenceMs:performance.now()-start};},
    close:()=>tracker.close()};
}
export async function startAsyncPerformanceTracker(options:TrackerOptions={}):Promise<AsyncPerformanceTracker>{
  if(typeof Worker==='undefined'||typeof createImageBitmap==='undefined')
    return fallback(await startPerformanceTracker(options),['Worker unavailable; using compatible capture.']);
  let worker:Worker|undefined;
  try{
    const active=new Worker(new URL('./performanceVision.worker.ts',import.meta.url),{type:'module'});
    worker=active;
    const ready=await new Promise<{features:PerformanceTracker['features'];warnings:string[]}>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Vision worker initialization timed out')),20000);
      active.onmessage=({data})=>{clearTimeout(timer);if(data.kind==='ready')resolve(data);else reject(Error(data.message??'Vision worker initialization failed'));};
      active.onerror=()=>{clearTimeout(timer);reject(Error('Vision worker unavailable'));};
      active.postMessage({kind:'init',options});
    });
    let closed=false,busy=false,id=0;
    let pending:{id:number;resolve:(value:AsyncCapture)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}|undefined;
    let compatible:AsyncPerformanceTracker|undefined;
    const fail=(message:string)=>{
      if(pending){clearTimeout(pending.timer);pending.reject(Error(message));pending=undefined;}
    };
    active.onmessage=({data})=>{
      if(!pending||data.id!==pending.id)return;
      const current=pending;pending=undefined;clearTimeout(current.timer);
      if(data.kind==='result')current.resolve({frame:data.frame,inferenceMs:data.inferenceMs});
      else current.reject(Error(data.message??'Vision inference failed'));
    };
    active.onerror=()=>fail('Vision worker interrupted');
    const adapter:AsyncPerformanceTracker={
      mode:'worker',features:ready.features,warnings:ready.warnings,
      async detect(video,at){
        if(closed||busy)throw Error('Capture unavailable or already in progress');
        busy=true;
        try{
          if(compatible)return await compatible.detect(video,at);
          if(video.readyState<2||!video.videoWidth)return {inferenceMs:0};
          let bitmap:ImageBitmap|undefined;
          try{
            bitmap=await createImageBitmap(video);
            if(closed)throw Error('Capture closed');
            const transferred=bitmap;
            return await new Promise<AsyncCapture>((resolve,reject)=>{
              const next=++id;
              pending={id:next,resolve,reject,timer:setTimeout(()=>fail('Vision frame timed out'),5000)};
              active.postMessage({kind:'frame',id:next,at,bitmap:transferred},[transferred]);
              bitmap=undefined;
            });
          }catch(error){
            bitmap?.close();
            active.terminate();fail('Vision worker stopped');
            if(closed)throw error;
            const tracker=await startPerformanceTracker(options);
            if(closed){tracker.close();throw Error('Capture closed');}
            compatible=fallback(tracker,['Worker failed; switched to compatible capture.']);
            adapter.mode='fallback';adapter.features=compatible.features;adapter.warnings=compatible.warnings;
            // Do not label a new camera frame with the old timestamp.
            return {inferenceMs:0};
          }
        }finally{busy=false;}
      },
      close(){closed=true;active.terminate();fail('Capture closed');compatible?.close();}
    };
    return adapter;
  }catch(error){
    worker?.terminate();
    return fallback(await startPerformanceTracker(options),['Vision worker unavailable; compatible capture enabled: '+String(error)]);
  }
}
