/**
 * Optional offline MediaPipe asset install. Invoke before `npm run build`:
 * `npm run assets:performance`
 * The normal web build remains small and works without downloading models.
 */
import {mkdir,rename,rm} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {join,dirname} from 'node:path';

const cdn='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3';
const models='https://storage.googleapis.com/mediapipe-models';
const entries=[
  ['vision_bundle.mjs',cdn+'/vision_bundle.mjs'],
  ...['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm']
    .map(file=>['wasm/'+file,cdn+'/wasm/'+file]),
  ['models/pose_landmarker_lite.task',models+'/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'],
  ['models/hand_landmarker.task',models+'/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'],
  ['models/face_landmarker.task',models+'/face_landmarker/face_landmarker/float16/1/face_landmarker.task']
];
for(const [file,url] of entries){
  const target=join('public','mediapipe',file);
  await mkdir(dirname(target),{recursive:true});
  const response=await fetch(url);
  if(!response.ok||!response.body)throw Error('Failed to fetch '+file+': HTTP '+response.status);
  const temp=target+'.download';
  try{
    await pipeline(Readable.fromWeb(response.body),createWriteStream(temp));
    await rename(temp,target);
  }catch(error){await rm(temp,{force:true});throw error;}
  console.log('Ready: '+file);
}
console.log('Offline MediaPipe assets installed; npm run build will package them with the PWA.');
