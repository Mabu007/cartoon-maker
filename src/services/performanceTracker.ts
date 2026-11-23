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
type Detector={detectForVideo:(video:HTMLVideoElement,at:number)=>unknown;close:()=>void};
type PoseLandmarkerResult={landmarks?:Landmark[][];worldLandmarks?:Landmark[][]};
type HandLandmarkerResult={landmarks?:Landmark[][]};
export type FaceLandmarkerResultLike={
  faceLandmarks?:Landmark[][];
  faceBlendshapes?:Array<{categories?:Array<{categoryName:string;score:number}>}>;
};
/** MediaPipe returns faceLandmarks (not landmarks). Parse the real API shape,
 * preserving valid blendshapes even if a mesh is temporarily missing. */
export function extractFaceObservation(result:FaceLandmarkerResultLike|undefined){
  const landmarks=result?.faceLandmarks?.[0];
  const categories=result?.faceBlendshapes?.[0]?.categories;
  const blendshapes=categories?.length?Object.fromEntries(
    categories.filter(item=>item.categoryName&&Number.isFinite(item.score))
      .map(item=>[item.categoryName,item.score])
  ) as Record<string,number>:undefined;
  return {landmarks:landmarks?.length?landmarks:undefined,blendshapes};
}
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
/** Static asset request only; never a Vite module import. Exported separately
 * so missing, malformed and HTML fallback responses have regression tests. */
export async function fetchLocalVisionBlob(fetcher:typeof fetch=fetch):Promise<Blob>{
  const response=await fetcher('/mediapipe/vision_bundle.mjs',{cache:'force-cache'});
  if(!response.ok)throw Error('Local MediaPipe bundle missing (HTTP '+response.status+'). Re-run npm run assets:performance and restart Vite.');
  if(response.headers.get('content-type')?.includes('text/html'))
    throw Error('Local MediaPipe bundle returned HTML instead of JavaScript. Re-run npm run assets:performance.');
  const blob=await response.blob();
  if(blob.size<1024)throw Error('Local MediaPipe module is incomplete. Re-run npm run assets:performance.');
  return blob;
}
export async function loadVisionModule():Promise<VisionApi> {
  if(!visionModule){
    visionModule=(async()=>{
      if(!localVision)return await import(/* @vite-ignore */ `${cdn}/vision_bundle.mjs`) as VisionApi;
      const blob=await fetchLocalVisionBlob();
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
/** Treat mesh and facial action coefficients as independent observations. */
export function freshFaceSignals(
  blendshapes:Record<string,number>|undefined,blendshapeAt:number,
  landmarks:Landmark[]|undefined,landmarksAt:number,now:number,maxAge=600
){
  return {
    blendshapes:blendshapes&&now-blendshapeAt<=maxAge?blendshapes:undefined,
    landmarks:landmarks&&now-landmarksAt<=maxAge?landmarks:undefined
  };
}
const posePoints=(result:PoseLandmarkerResult):Landmark[]|undefined=>result?.landmarks?.[0];
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
  let previousFaceLandmarks:Landmark[]|undefined;
  let lastHandsAt=0,lastFaceLandmarksAt=0,lastFaceBlendshapesAt=0;
  const close=()=>{for(const detector of [pose,hands,face])try{detector?.close();}catch{/* already closed */}};
  return {features:{pose:true,hands:!!hands,face:!!face},warnings,close,
    detect(video,atMs) {
      if(video.readyState<2||!video.videoWidth)return undefined;
      const output=poseDetector(video,atMs) as PoseLandmarkerResult;
      const measuredPose=posePoints(output);
      // A face-only crop need not be rejected if the dedicated face tracker
      // still sees a nose/eyes; unknown shoulder/leg joints stay unobserved.
      let pose=measuredPose;
      // MediaPipe worldLandmarks are 3D metre-scale points around the hip
      // origin. Keep them for retargeting only, never in persisted clip JSON.
      const world=output?.worldLandmarks?.[0] as Landmark[]|undefined;
      tick++;
      // Arm position comes from the light pose model every frame. Finger
      // classification and high-detail eyebrows/lips are much slower and
      // need not run on each frame. Stagger them so they never compete.
      if(hands&&tick%3===0){
        const result=hands.detectForVideo(video,atMs) as HandLandmarkerResult;
        previousLeft=undefined;previousRight=undefined;lastHandsAt=atMs;
        // A camera preview may be mirrored by CSS while detector coordinates are
        // not. Associate hands to the tracked body wrists spatially instead of
        // trusting model handedness labels.
        const detections=(result.landmarks??[]) as Landmark[][];
        const leftWrist=pose?.[15]&&(pose[15].visibility??1)>.55?pose[15]:undefined;
        const rightWrist=pose?.[16]&&(pose[16].visibility??1)>.55?pose[16]:undefined;
        if(leftWrist||rightWrist){
          const options=detections.map((landmarks,index)=>({
            landmarks,index,
            left:leftWrist?Math.hypot(landmarks[0].x-leftWrist.x,landmarks[0].y-leftWrist.y):2,
            right:rightWrist?Math.hypot(landmarks[0].x-rightWrist.x,landmarks[0].y-rightWrist.y):2
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
        if(!leftWrist&&!rightWrist&&detections.length){
          // Hand-only framing: retain the independently observed hand shapes,
          // but do not fabricate upper-arm joint positions from those hands.
          for(const landmarks of detections){
            if(landmarks[0].x<.5)previousRight=landmarks;
            else previousLeft=landmarks;
          }
        }
      }
      if(face&&tick%3===1){
        const result=extractFaceObservation(face.detectForVideo(video,atMs) as FaceLandmarkerResultLike);
        if(result.blendshapes){previousFace=result.blendshapes;lastFaceBlendshapesAt=atMs;}
        if(result.landmarks){previousFaceLandmarks=result.landmarks;lastFaceLandmarksAt=atMs;}
      }
      if(atMs-lastHandsAt>450){previousLeft=undefined;previousRight=undefined;}
      const fresh=freshFaceSignals(previousFace,lastFaceBlendshapesAt,
        previousFaceLandmarks,lastFaceLandmarksAt,atMs);
      previousFace=fresh.blendshapes;
      previousFaceLandmarks=fresh.landmarks;
      if((!pose?.length||!((pose[2]?.visibility??0)>=.55&&(pose[5]?.visibility??0)>=.55))&&previousFaceLandmarks?.length){
        const points=previousFaceLandmarks;
        const nose=points[1],a=points[33],b=points[263];
        if(nose&&a&&b){
          const empty=pose?.length?pose.slice():Array.from({length:33},():Landmark=>({x:0,y:0,visibility:0}));
          if((empty[0]?.visibility??0)<.55)empty[0]={...nose,visibility:1};
          // Pose's left/right labels follow performer anatomy, while these
          // face mesh corners are re-ordered to the same selfie convention.
          const rightmost=a.x>b.x?a:b,leftmost=a.x>b.x?b:a;
          empty[2]={...rightmost,visibility:1};
          empty[5]={...leftmost,visibility:1};
          pose=empty;
        }
      }
      if(!pose?.length&&!previousLeft&&!previousRight&&!previousFace)return undefined;
      return {t:atMs/1000,pose:pose??[],world:output?.worldLandmarks?.[0] as Landmark[]|undefined,
        leftHand:previousLeft,rightHand:previousRight,face:previousFace};
    }
  };
  function poseDetector(video:HTMLVideoElement,t:number){return pose.detectForVideo(video,t);}
}
