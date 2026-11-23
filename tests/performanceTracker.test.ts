import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLocalVisionBlob } from '../src/services/performanceTracker.ts';

const request=(response:Response)=>(async(input:RequestInfo|URL,init?:RequestInit)=>{
  assert.equal(input,'/mediapipe/vision_bundle.mjs');
  assert.equal(init?.cache,'force-cache');
  // The runtime must use ordinary fetch, not import('/mediapipe/...')
  return response;
}) as typeof fetch;

test('MediaPipe module is fetched as a public static asset, not imported through Vite',async()=>{
  const source='/* locally installed MediaPipe ESM */'.padEnd(2048,'x');
  const blob=await fetchLocalVisionBlob(request(new Response(source,{
    status:200,headers:{'Content-Type':'text/javascript'}
  })));
  assert(blob.size>=2048);
  assert.equal(await blob.text(),source);
});

test('missing local model installer files produce an actionable error',async()=>{
  await assert.rejects(
    fetchLocalVisionBlob(request(new Response('Not found',{status:404}))),
    /npm run assets:performance.*restart Vite/
  );
});

test('HTML fallback is rejected before it is passed to dynamic module import',async()=>{
  await assert.rejects(
    fetchLocalVisionBlob(request(new Response('<!doctype html>'.padEnd(2048,'x'),{
      status:200,headers:{'Content-Type':'text/html; charset=utf-8'}
    }))),
    /returned HTML/
  );
});

test('incomplete downloads are rejected instead of executing a truncated bundle',async()=>{
  await assert.rejects(
    fetchLocalVisionBlob(request(new Response('export {}',{
      status:200,headers:{'Content-Type':'text/javascript'}
    }))),
    /incomplete/
  );
});
