import { startPerformanceTracker, type PerformanceTracker, type TrackerOptions } from './performanceTracker.ts';
type Request={kind:'init';options:TrackerOptions}|{kind:'frame';id:number;at:number;bitmap:ImageBitmap};
const scope=self as unknown as {onmessage:((e:MessageEvent<Request>)=>void)|null;postMessage:(message:unknown)=>void};
let tracker:PerformanceTracker|undefined;
scope.onmessage=async({data})=>{
  if(data.kind==='init'){
    try{tracker=await startPerformanceTracker(data.options);scope.postMessage({kind:'ready',features:tracker.features,warnings:tracker.warnings});}
    catch(error){scope.postMessage({kind:'error',message:String(error)});}
    return;
  }
  try{
    if(!tracker)throw Error('Vision not initialized');
    const started=performance.now();
    const frame=tracker.detect(data.bitmap,data.at);
    scope.postMessage({kind:'result',id:data.id,frame,inferenceMs:performance.now()-started});
  }catch(error){scope.postMessage({kind:'error',id:data.id,message:String(error)});}
  finally{data.bitmap.close();}
};
