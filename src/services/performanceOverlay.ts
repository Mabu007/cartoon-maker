/**
 * Fast diagnostic overlay for webcam performance capture.
 * Uses only coordinates already computed by MediaPipe; no new inference.
 * The canvas mirrors with the video via CSS and never saves camera images.
 */
import type { CaptureFrame, Landmark } from '../engine/performanceCapture.ts';

export function drawPerformanceLandmarks(
  canvas:HTMLCanvasElement,frame?:CaptureFrame
):void {
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const {width,height}=canvas;
  ctx.clearRect(0,0,width,height);
  const pose=frame?.pose??[];
  const visible=(point?:Landmark)=>Boolean(point&&Number.isFinite(point.x)&&
    Number.isFinite(point.y)&&(point.visibility??1)>.48);
  const joints=[[11,13],[13,15],[12,14],[14,16],[11,12],
    [23,25],[25,27],[24,26],[26,28],[23,24],[2,5],[2,0],[5,0]];
  ctx.lineWidth=2;
  ctx.lineCap='round';
  ctx.strokeStyle='rgba(89,239,197,.90)';
  for(const [from,to] of joints){
    const a=pose[from],b=pose[to];
    if(!visible(a)||!visible(b))continue;
    ctx.beginPath();ctx.moveTo(a.x*width,a.y*height);
    ctx.lineTo(b.x*width,b.y*height);ctx.stroke();
  }
  ctx.fillStyle='rgba(199,255,238,.96)';
  for(const index of [0,2,5,11,12,13,14,15,16,23,24,25,26,27,28]){
    const p=pose[index];if(!visible(p))continue;
    ctx.beginPath();ctx.arc(p.x*width,p.y*height,index===15||index===16?4:2.8,0,Math.PI*2);ctx.fill();
  }
  // Only seven landmarks per hand are needed to show which fingers the model
  // sees. This also works for hand-only framing when no body is detected.
  ctx.strokeStyle='rgba(255,204,129,.92)';
  ctx.fillStyle='rgba(255,225,174,.98)';
  for(const hand of [frame?.leftHand,frame?.rightHand]){
    if(!hand||hand.length<21||!visible(hand[0]))continue;
    for(const tip of [4,8,12,16,20]){
      if(!visible(hand[tip]))continue;
      ctx.beginPath();ctx.moveTo(hand[0].x*width,hand[0].y*height);
      ctx.lineTo(hand[tip].x*width,hand[tip].y*height);ctx.stroke();
      ctx.beginPath();ctx.arc(hand[tip].x*width,hand[tip].y*height,2,0,Math.PI*2);ctx.fill();
    }
  }
}
