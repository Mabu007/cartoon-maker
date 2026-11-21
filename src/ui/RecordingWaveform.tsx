import { useEffect, useRef } from 'react';

function paint(canvas:HTMLCanvasElement,peaks:number[],live:boolean){
  const rect=canvas.getBoundingClientRect();
  if(!rect.width)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),width=Math.max(1,Math.round(rect.width*dpr)),height=148;
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,width,height);
  const columns=peaks.length||1,step=width/columns,barWidth=Math.max(2,step*.64);
  ctx.fillStyle=live?'#7bd7be':'#aa90e8';
  for(let i=0;i<peaks.length;i++){
    const amplitude=Math.max(.035,Math.min(1,peaks[i]));
    const h=Math.max(3,amplitude*(height-18));
    ctx.fillRect(i*step+(step-barWidth)/2,(height-h)/2,barWidth,h);
  }
}
function peaksForDecoded(audio:AudioBuffer,columns=108){
  const peaks=new Array<number>(columns).fill(0),length=audio.length;
  for(let x=0;x<columns;x++){
    const start=Math.floor(x*length/columns),end=Math.min(length,Math.ceil((x+1)*length/columns));
    for(let c=0;c<audio.numberOfChannels;c++){
      const samples=audio.getChannelData(c);
      for(let i=start;i<end;i+=Math.max(1,Math.floor((end-start)/130)))
        peaks[x]=Math.max(peaks[x],Math.abs(samples[i]||0));
    }
  }
  return peaks;
}
/** Real microphone input waveform. Never connects the microphone to speakers. */
export function RecordingWaveform({stream,recording,preview}:{
  stream?:MediaStream|null;recording:boolean;preview?:Blob;
}){
  const canvas=useRef<HTMLCanvasElement>(null),timer=useRef<HTMLSpanElement>(null),meter=useRef<HTMLProgressElement>(null);
  useEffect(()=>{
    if(!recording||!stream||!canvas.current)return;
    let live=true,raf=0,source:MediaStreamAudioSourceNode|undefined;
    let context:AudioContext|undefined;
    try {
      context=new AudioContext();
      const analyser=context.createAnalyser();
      analyser.fftSize=2048;analyser.smoothingTimeConstant=.75;
      source=context.createMediaStreamSource(stream);source.connect(analyser);
      const data=new Uint8Array(analyser.fftSize),history=new Array<number>(86).fill(.02);
      const start=performance.now();let sampled=0;
      const frame=(now:number)=>{
        if(!live)return;
        analyser.getByteTimeDomainData(data);
        let sum=0;
        for(let i=0;i<data.length;i++){const n=(data[i]-128)/128;sum+=n*n;}
        const amplitude=Math.min(1,Math.sqrt(sum/data.length)*3.2);
        if(now-sampled>68){history.shift();history.push(amplitude);sampled=now;}
        if(canvas.current)paint(canvas.current,history,true);
        if(meter.current)meter.current.value=Math.round(amplitude*100);
        if(timer.current)timer.current.textContent=Math.floor((now-start)/60000).toString().padStart(2,'0')+':'+(Math.floor((now-start)/1000)%60).toString().padStart(2,'0');
        raf=requestAnimationFrame(frame);
      };
      raf=requestAnimationFrame(frame);
    } catch { if(canvas.current)paint(canvas.current,new Array(86).fill(.08),true); }
    return()=>{live=false;cancelAnimationFrame(raf);source?.disconnect();void context?.close().catch(()=>{});};
  },[stream,recording]);
  useEffect(()=>{
    if(recording||!preview||!canvas.current)return;
    let live=true;
    const audio=new AudioContext();
    void preview.arrayBuffer().then(bytes=>audio.decodeAudioData(bytes)).then(decoded=>{
      if(live&&canvas.current)paint(canvas.current,peaksForDecoded(decoded),false);
    }).catch(()=>{}).finally(()=>{void audio.close().catch(()=>{});});
    return()=>{live=false;};
  },[preview,recording]);
  if(!recording&&!preview)return null;
  return <div className="recording-visualizer" role="region" aria-label={recording?'Live microphone waveform':'Recorded audio waveform'}>
    <div className="recording-timer">
      <span>{recording?'● Recording':'Waveform preview'}</span>
      <span ref={timer}>{recording?'00:00':preview?'Recorded audio':''}</span>
    </div>
    <canvas ref={canvas} className="recording-wave" aria-label="Audio amplitude waveform"/>
    {recording&&<><progress ref={meter} className="recording-level" max={100} value={0} aria-label="Microphone input level"/>
      <span className="recording-hint">Speak normally. The waveform responds to your microphone; no sound is played back while recording.</span></>}
    {!recording&&<span className="recording-hint">Listen to the recording below before adding it to your timeline.</span>}
  </div>;
}
