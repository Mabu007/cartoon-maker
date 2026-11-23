/** Audio is optional in the MoCap recorder. Browsers may never fire the
 * MediaRecorder stop event after a device disconnect or permission change.
 * Never let voice capture block a valid movement take from being compiled. */
export async function finishOptionalAudio(
  writer:MediaRecorder|undefined,chunks:readonly Blob[],timeoutMs=1500
):Promise<Blob|undefined>{
  if(!writer)return undefined;
  if(writer.state==='inactive'){
    const audio=new Blob(chunks,{type:writer.mimeType||'audio/webm'});
    return audio.size?audio:undefined;
  }
  return new Promise(resolve=>{
    let settled=false;
    const finish=()=>{
      if(settled)return;
      settled=true;clearTimeout(timer);
      writer.removeEventListener('stop',finish);
      writer.removeEventListener('error',finish);
      const blob=new Blob(chunks,{type:writer.mimeType||'audio/webm'});
      resolve(blob.size?blob:undefined);
    };
    const timer=setTimeout(finish,Math.max(100,timeoutMs));
    writer.addEventListener('stop',finish,{once:true});
    writer.addEventListener('error',finish,{once:true});
    try{writer.stop();}catch{finish();}
  });
}
/** Very short recordings can contain tracked frames but have no meaningful
 * movement. Keep the UI explicit about what will be saved. */
export function recordingQuality(accepted:number,duration:number){
  if(duration<.3)return 'Record at least a moment of movement.';
  if(accepted<2)return 'The camera could not see enough of your performance.';
  return undefined;
}
