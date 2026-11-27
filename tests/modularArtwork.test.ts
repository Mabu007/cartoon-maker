import test from 'node:test';
import assert from 'node:assert/strict';
import {boneArtworkTransform,transformArtworkPoint,characterCoreSlots} from '../src/engine/artworkGeometry.ts';
import {AssetManifest,CompiledComponent,characterCompatibility,compileComponents,exportAssetPackage,parseAssetPackage} from '../src/engine/visualAssets.ts';
import {modularExample} from '../src/engine/modularExample.ts';
import {illustratedCharacters} from '../src/engine/visualPresets.ts';
import {exportCharacterArtwork} from '../src/services/assetPreparation.ts';
import {rig} from '../src/engine/animation.ts';
import {applyBrushStroke,paintMask,maskSelectionBounds} from '../src/engine/selectionMask.ts';
const close=(a:{x:number;y:number},b:{x:number;y:number})=>assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-7);
test('calibrated image pivots remain exactly on both native joints at every rotation and width',()=>{
  const part={pivot:{x:.2,y:.15},end:{x:.7,y:.85},width:24,height:40};
  for(const angle of [-170,-90,-30,0,65,135,180])for(const width of [.5,1,1.6,2]){
    const start={x:23,y:-115},end={x:start.x+Math.sin(angle*Math.PI/180)*46,y:start.y+Math.cos(angle*Math.PI/180)*46};
    const m=boneArtworkTransform(part,start,end,width)!;
    close(transformArtworkPoint(m,{x:part.pivot.x*part.width,y:part.pivot.y*part.height}),start);
    close(transformArtworkPoint(m,{x:part.end.x*part.width,y:part.end.y*part.height}),end);
  }
});
test('degenerate image joints and missing endpoint calibration are rejected',()=>{
  const part=compileComponents(modularExample).find(p=>p.slot==='forearm-left')!;
  assert.equal(CompiledComponent.safeParse({...part,end:undefined}).success,false);
  assert.equal(CompiledComponent.safeParse({...part,end:part.pivot}).success,false);
  assert.equal(CompiledComponent.safeParse({...part,offsetX:5}).success,false);
  assert.equal(AssetManifest.safeParse({...modularExample,parts:modularExample.parts.map(p=>p.slot==='forearm-left'?{...p,end:p.pivot}:p)}).success,false);
  assert.equal(boneArtworkTransform(part,{x:0,y:0},{x:0,y:0}),undefined);
});
test('complete body status is earned per actual view and disappears when a limb is missing',()=>{
  const status=characterCompatibility(modularExample);assert.deepEqual(status.completeViews,['front','three-quarter']);assert.equal(status.incompleteViews.length,0);
  assert.equal(modularExample.parts.length,characterCoreSlots.length*2);
  const incomplete={...modularExample,parts:modularExample.parts.filter(p=>!(p.view==='front'&&p.slot==='calf-left'))};
  assert.deepEqual(characterCompatibility(incomplete).completeViews,['three-quarter']);assert(characterCompatibility(incomplete).incompleteViews[0].missing.includes('calf-left'));
});
test('the modular kit follows each native posed arm without a new solver or disconnected endpoints',()=>{
  const c=illustratedCharacters[0],parts=compileComponents(modularExample);
  for(const pose of [{},{leftShoulder:45,leftElbow:-80},{leftShoulder:110,leftElbow:45}]){
    const native=rig(c,pose,.88),upper=parts.find(p=>p.slot==='upper-arm-left'&&p.view==='three-quarter')!,forearm=parts.find(p=>p.slot==='forearm-left'&&p.view==='three-quarter')!;
    const a=boneArtworkTransform(upper,native.left.shoulder,native.left.elbow)!,b=boneArtworkTransform(forearm,native.left.elbow,native.left.hand)!;
    close(transformArtworkPoint(a,{x:upper.end!.x*upper.width,y:upper.end!.y*upper.height}),transformArtworkPoint(b,{x:forearm.pivot.x*forearm.width,y:forearm.pivot.y*forearm.height}));
  }
});
test('character body artwork round trips with original per-part licence and provenance',()=>{
  const c=structuredClone(illustratedCharacters[0]);c.visual!.components![0].license='Artist A licence';c.visual!.components![0].source='Artist A original';
  const pack=exportCharacterArtwork(c),again=compileComponents(parseAssetPackage(exportAssetPackage([pack])).packs[0]);
  assert.equal(again.length,c.visual!.components!.length);assert.equal(again[0].license,'Artist A licence');assert.equal(again[0].source,'Artist A original');
  assert.equal(pack.files.length,7); // Shared left/right/view textures are not duplicated in the portable pack.
});
test('subtract and add brushes refine the alpha selection without destructive source editing',()=>{
  const original=new Uint8ClampedArray(400).fill(255),mask=original.slice();
  paintMask(mask,20,20,10,10,4,'subtract');assert.equal(mask[10*20+10],0);assert.equal(mask[0],255);assert.equal(original[10*20+10],255);
  paintMask(mask,20,20,10,10,4,'add');assert.equal(mask[10*20+10],255);
});
test('brush strokes interpolate gaps and repeated stamps do not accumulate feather opacity',()=>{
  const mask=new Uint8ClampedArray(400);applyBrushStroke(mask,20,20,[{x:2,y:10},{x:18,y:10}],2,'add');
  for(let x=2;x<18;x++)assert(mask[10*20+x]>100);
  const first=mask.slice();applyBrushStroke(mask,20,20,[{x:2,y:10},{x:18,y:10}],2,'add');assert.deepEqual(mask,first);
});
test('mask edits remain bounded and polygon crops preserve original image coordinates',()=>{
  const mask=new Uint8ClampedArray(16).fill(255);paintMask(mask,4,4,-100,-100,2,'subtract');assert(mask.every(v=>v===255));
  assert.throws(()=>paintMask(mask,5,4,1,1,2,'add'),/Invalid/);
  assert.throws(()=>applyBrushStroke(mask,4,4,[{x:NaN,y:0}],2,'add'),/Invalid/);
  assert.deepEqual(maskSelectionBounds([{x:.1,y:.2},{x:.7,y:.2},{x:.5,y:.8}],1000,500),{x:100,y:100,width:600,height:300});
});
test('adding a selection preserves the original alpha and rejected dimensions cannot corrupt pixels',async()=>{
  const {applySelectionAlpha}=await import('../src/engine/selectionMask.ts');
  const pixels=new Uint8ClampedArray([255,0,0,0,0,255,0,128,0,0,255,255]);applySelectionAlpha(pixels,new Uint8ClampedArray([255,255,128]));
  assert.deepEqual([...pixels],[255,0,0,0,0,255,0,128,0,0,255,128]);assert.throws(()=>applySelectionAlpha(pixels,new Uint8ClampedArray(4)),/dimensions/);
});
test('native SVG fallback assembles every declared body part with calibrated image sizing',async()=>{
  const {createServer}=await import('vite'),{createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  try{
    const {NativeCharacterPreview}=await server.ssrLoadModule('/src/ui/NativeCharacterPreview.tsx');
    for(const action of ['idle','walk','sit','point'] as const){
      const html=renderToStaticMarkup(createElement(NativeCharacterPreview,{character:illustratedCharacters[0],view:'three-quarter',action,expression:'neutral',flip:false,scale:1.2,frozenTime:.5}));
      assert.equal((html.match(/<image /g)??[]).length,12);assert.equal((html.match(/preserveAspectRatio="none"/g)??[]).length,12);assert.equal((html.match(/transform="matrix\(/g)??[]).length,8);
    }
  }finally{await server.close();}
});
