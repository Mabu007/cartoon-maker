/**
 * Browser-only MediaPipe adapter. Loads only after an explicit capture action.
 * Inference runs locally; raw camera frames are never uploaded or saved.
 * Deploy /public/mediapipe assets for fully offline use; pinned CDN is a
 * first-run fallback when local models have not been installed.
 */
import type { CaptureFrame, Landmark } from '../engine/performanceCapture.ts';

declare const __SIRVIBE_LOCAL_VISION__: boolean;

type VisionApi = {
  FilesetResolver:{forVisionTasks:(url:string)=>Promise<unknown>};
  PoseLandmarker:{createFromOptions:(files:unknown,options:unknown)=>Promise<Detector>};
  HandLandmarker:{createFromOptions:(files:unknown,options:unknown)=>Promise<Detector>};
  FaceLandmarker:{createFromOptions:(files:unknown,options:unknown)=>Promise<Detector>};
};
type Detector={detectForVideo:(video:HTMLVideoElement,at:number)=>any;close:()=>void};
type TrackerOptions={hands?:boolean;face?:boolean};
export type PerformanceTracker={
  detect:(video:HTMLVideoElement,atMs:number)=>CaptureFrame|undefined;
  close:()=>void;
  features:{pose:boolean;hands:boolean;face:boolean};
  warnings:string[];
};
const version='1.2.3';
const cdn=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}`;
const google='https://storage.googleapis.com/mediapipe-models';
const models={
  pose:`${google}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  hands:`${google}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
  face:`${google}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
};
// Vite embeds this boolean from the actual public/ directory. No speculative
// requests to missing /mediapipe routes; no misleading console 404s.
const localVision=typeof __SIRVIBE_LOCAL_VISION__!=='undefined'&&__SIRVIBE_LOCAL_VISION__;
const modelPath=(name:'pose'|'hands'|'face')=>
  localVision ? ({
    pose:'/mediapipe/models/pose_landmarker_lite.task',
    hands:'/mediapipe/models/hand_landmarker.task',
    face:'/mediapipe/models/face_landmarker.task'
  })[name] : models[name];
/**
 * Vite 7 explicitly disallows dynamic imports of JS modules directly from
 * /public, even with @vite-ignore. Fetching the public asset as *data* and
 * importing an object URL keeps it out of Vite's module transform while
 * retaining an entirely local, offline-capable MediaPipe runtime.
 *
 * One module per page: large vision bundles must not be fetched/parsed again
 * when a creator closes and reopens the recording studio.
 */
let visionModule:Promise<VisionApi>|undefined;
export async function loadVisionModule():Promise<VisionApi> {
  if(!visionModule){
    visionModule=(async()=>{
      if(!localVision)return await import(/* @vite-ignore */ `${cdn}/vision_bundle.mjs`) as VisionApi;
      const response=await fetch('/mediapipe/vision_bundle.mjs',{cache:'force-cache'});
      if(!response.ok)throw Error('Local MediaPipe bundle missing (HTTP '+response.status+'). Re-run npm run assets:performance and restart Vite.');
      if(response.headers.get('content-type')?.includes('text/html'))
        throw Error('Local MediaPipe bundle returned HTML instead of JavaScript. Re-run npm run assets:performance.');
      const blob=await response.blob();
      if(blob.size<1024)throw Error('Local MediaPipe module is incomplete. Re-run npm run assets:performance.');
      // Keep this object URL alive for the module lifetime: some MediaPipe
      // implementations may resolve delayed imports relative to import.meta.url.
      const moduleUrl=URL.createObjectURL(new Blob([blob],{type:'text/javascript'}));
      try {
        const module=await import(/* @vite-ignore */ moduleUrl) as VisionApi;
        if(!module.FilesetResolver||!module.PoseLandmarker)
          throw Error('Local MediaPipe module is missing vision task exports.');
        return module;
      } catch(error) {
        URL.revokeObjectURL(moduleUrl);
        throw error;
      }
    })();
  }
  try{return await visionModule;}
  catch(error){visionModule=undefined;throw error;}
}
async function resolveRuntime() {
  const module=await loadVisionModule();
  const wasm=localVision?'/mediapipe/wasm':`${cdn}/wasm`;
  return {module,files:await module.FilesetResolver.forVisionTasks(wasm)};
}
const posePoints=(result:any):Landmark[]|undefined=>result?.landmarks?.[0];
export async function startPerformanceTracker(options:TrackerOptions={}):Promise<PerformanceTracker> {
  const warnings:string[]=[];
  const {module,files}=await resolveRuntime();
  const baseOptions=(modelAssetPath:string)=>({baseOptions:{modelAssetPath,delegate:'CPU'},runningMode:'VIDEO',numPoses:1});
  const pose=await module.PoseLandmarker.createFromOptions(files,baseOptions(
    modelPath('pose')));
  let hands:Detector|undefined,face:Detector|undefined;
  if(options.hands!==false){
    try{hands=await module.HandLandmarker.createFromOptions(files,{
      baseOptions:{modelAssetPath:modelPath('hands'),delegate:'CPU'},
      runningMode:'VIDEO',numHands:2
    });}catch(error){warnings.push('Hand tracking unavailable; body tracking will continue. '+String(error));}
  }
  if(options.face){
    try{face=await module.FaceLandmarker.createFromOptions(files,{
      baseOptions:{modelAssetPath:modelPath('face'),delegate:'CPU'},
      runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true
    });}catch(error){warnings.push('Facial tracking unavailable; body tracking will continue. '+String(error));}
  }
  let tick=0,previousLeft:Landmark[]|undefined,previousRight:Landmark[]|undefined;
  let previousFace:Record<string,number>|undefined;
  const close=()=>{for(const detector of [pose,hands,face])try{detector?.close();}catch{/* already closed */}};
  return {features:{pose:true,hands:!!hands,face:!!face},warnings,close,
    detect(video,atMs) {
      if(video.readyState<2||!video.videoWidth)return undefined;
      const output=poseDetector(video,atMs);
      const pose=posePoints(output);
      if(!pose)return undefined;
      // MediaPipe worldLandmarks are 3D metre-scale points around the hip
      // origin. Keep them for retargeting only, never in persisted clip JSON.
      const world=output?.worldLandmarks?.[0] as Landmark[]|undefined;
      tick++;
      // When both trackers are enabled, alternate them: on low-end CPUs
      // running face + both hands on a single frame creates long UI stalls.
      if(hands&&(face?tick%2===0:tick%2===1)){
        const result=hands.detectForVideo(video,atMs);
        previousLeft=undefined;previousRight=undefined;
        // A camera preview may be mirrored by CSS while detector coordinates are
        // not. Associate hands to the tracked body wrists spatially instead of
        // trusting model handedness labels.
        const detections=(result.landmarks??[]) as Landmark[][];
        const leftWrist=pose[15],rightWrist=pose[16];
        if(leftWrist&&rightWrist){
          const options=detections.map((landmarks,index)=>({
            landmarks,index,
            left:Math.hypot(landmarks[0].x-leftWrist.x,landmarks[0].y-leftWrist.y),
            right:Math.hypot(landmarks[0].x-rightWrist.x,landmarks[0].y-rightWrist.y)
          }));
          if(options.length===1){
            const best=options[0];
            if(Math.min(best.left,best.right)<.25){
              if(best.left<best.right)previousLeft=best.landmarks;
              else previousRight=best.landmarks;
            }
          }else if(options.length>1){
            const [a,b]=options;
            if(a.left+b.right<=b.left+a.right){
              if(a.left<.25)previousLeft=a.landmarks;
              if(b.right<.25)previousRight=b.landmarks;
            }else{
              if(b.left<.25)previousLeft=b.landmarks;
              if(a.right<.25)previousRight=a.landmarks;
            }
          }
        }
      }
      if(face&&(hands?tick%2===1:tick%3===1)){
        const result=face.detectForVideo(video,atMs);
        previousFace=result.faceBlendshapes?.[0]?.categories?.reduce((acc:Record<string,number>,c:{categoryName:string;score:number})=>{
          acc[c.categoryName]=c.score;return acc;
        },{});
      }
      return {t:atMs/1000,pose,world,leftHand:previousLeft,rightHand:previousRight,face:previousFace};
    }
  };
  function poseDetector(video:HTMLVideoElement,t:number){return pose.detectForVideo(video,t);}
}
