/**
 * Browser-only MediaPipe adapter. Loads only after an explicit capture action.
 * Inference runs locally; raw camera frames are never uploaded or saved.
 * Deploy /public/mediapipe assets for fully offline use; pinned CDN is a
 * first-run fallback when local models have not been installed.
 */
import type { CaptureFrame, Landmark } from '../engine/performanceCapture.ts';

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
async function exists(path:string) {
  try {
    const response=await fetch(path,{method:'HEAD',cache:'force-cache'});
    const type=response.headers.get('content-type')??'';
    return response.ok && !type.includes('text/html');
  } catch{return false;}
}
async function source(path:string,fallback:string) {
  return await exists(path)?path:fallback;
}
async function resolveRuntime() {
  const local='/mediapipe/vision_bundle.mjs';
  const path=await source(local,`${cdn}/vision_bundle.mjs`);
  // Vite must not prebundle this optional, privacy-gated dependency.
  const module=await import(/* @vite-ignore */ path) as VisionApi;
  const wasm=path===local?'/mediapipe/wasm':`${cdn}/wasm`;
  return {module,files:await module.FilesetResolver.forVisionTasks(wasm)};
}
const posePoints=(result:any):Landmark[]|undefined=>result?.landmarks?.[0];
export async function startPerformanceTracker(options:TrackerOptions={}):Promise<PerformanceTracker> {
  const warnings:string[]=[];
  const {module,files}=await resolveRuntime();
  const baseOptions=(modelAssetPath:string)=>({baseOptions:{modelAssetPath,delegate:'CPU'},runningMode:'VIDEO',numPoses:1});
  const pose=await module.PoseLandmarker.createFromOptions(files,baseOptions(
    await source('/mediapipe/models/pose_landmarker_lite.task',models.pose)));
  let hands:Detector|undefined,face:Detector|undefined;
  if(options.hands!==false){
    try{hands=await module.HandLandmarker.createFromOptions(files,{
      baseOptions:{modelAssetPath:await source('/mediapipe/models/hand_landmarker.task',models.hands),delegate:'CPU'},
      runningMode:'VIDEO',numHands:2
    });}catch(error){warnings.push('Hand tracking unavailable; body tracking will continue. '+String(error));}
  }
  if(options.face){
    try{face=await module.FaceLandmarker.createFromOptions(files,{
      baseOptions:{modelAssetPath:await source('/mediapipe/models/face_landmarker.task',models.face),delegate:'CPU'},
      runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true
    });}catch(error){warnings.push('Facial tracking unavailable; body tracking will continue. '+String(error));}
  }
  let tick=0,previousLeft:Landmark[]|undefined,previousRight:Landmark[]|undefined;
  let previousFace:Record<string,number>|undefined;
  const close=()=>{for(const detector of [pose,hands,face])try{detector?.close();}catch{/* already closed */}};
  return {features:{pose:true,hands:!!hands,face:!!face},warnings,close,
    detect(video,atMs) {
      if(video.readyState<2||!video.videoWidth)return undefined;
      const pose=posePoints(poseDetector(video,atMs));
      if(!pose)return undefined;
      tick++;
      if(hands&&tick%2===1){
        const result=hands.detectForVideo(video,atMs);
        previousLeft=undefined;previousRight=undefined;
        for(let i=0;i<(result.landmarks??[]).length;i++){
          const handed=result.handednesses?.[i]?.[0]?.categoryName??result.handedness?.[i]?.[0]?.categoryName;
          if(handed==='Left')previousLeft=result.landmarks[i];
          if(handed==='Right')previousRight=result.landmarks[i];
        }
      }
      if(face&&tick%3===1){
        const result=face.detectForVideo(video,atMs);
        previousFace=result.faceBlendshapes?.[0]?.categories?.reduce((acc:Record<string,number>,c:{categoryName:string;score:number})=>{
          acc[c.categoryName]=c.score;return acc;
        },{});
      }
      return {t:atMs/1000,pose,leftHand:previousLeft,rightHand:previousRight,face:previousFace};
    }
  };
  function poseDetector(video:HTMLVideoElement,t:number){return pose.detectForVideo(video,t);}
}
