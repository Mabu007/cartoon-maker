import {LveMaterial} from './lveSimulation.ts';
import {artworkPoseClasses} from './primaryArtworkPose.ts';
import { characterCoreSlots, isBoneSlot } from './artworkGeometry.ts';
import { z } from 'zod';
import { VectorArtworkV1 } from './vectorArtwork.ts';

export const assetCategories = ['character','body-profile','face-component','hair','clothing','accessory','prop','environment','art-style'] as const;
export const assetViews = ['front','three-quarter','side','back-quarter','back'] as const;
export const bodyProfiles = ['slim','average','curvy','athletic','muscular','broad','larger','short','tall','young-adult','mature','elderly','lean','heavyset','petite'] as const;
export const componentSlots = ['hair','top','head-base','upper-arm-left','forearm-left','upper-arm-right','forearm-right','thigh-left','calf-left','thigh-right','calf-right','shoe-left','shoe-right'] as const;
export const nativeComponentSlots=[...componentSlots,'head-accessory'] as const;
export type NativeSlot=typeof nativeComponentSlots[number];
const number = (min:number,max:number) => z.number().finite().min(min).max(max);
export const assetPoint = z.strictObject({x:number(0,1),y:number(0,1)});
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
export const assetPath = z.string().max(180).regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:png|webp)$/);
/** Packages contain passive, embedded raster data. SVG is rasterised by the preparation workspace. */
export const rasterData = z.string().max(450_000).regex(/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
export const CompiledComponent = z.strictObject({
  id:identifier, slot:z.enum(componentSlots), view:z.enum(assetViews), image:rasterData,
  pivot:assetPoint, end:assetPoint.optional(), width:number(8,160), height:number(8,180), offsetX:number(-80,80), offsetY:number(-100,100),
  fit:z.enum(['fixed','body']), profiles:z.array(z.enum(bodyProfiles)).min(1).max(bodyProfiles.length),
  symmetrical:z.boolean(), license:z.string().min(1).max(500), source:z.string().min(1).max(500)
}).superRefine((part,ctx)=>{if(isBoneSlot(part.slot)&&(part.offsetX!==0||part.offsetY!==0))ctx.addIssue({code:'custom',message:'Use calibrated joint pivots instead of limb offsets.'});if(isBoneSlot(part.slot)&&(!part.end||Math.hypot((part.end.x-part.pivot.x)*part.width,(part.end.y-part.pivot.y)*part.height)<2))ctx.addIssue({code:'custom',message:'Limb parts need distinct start and end joint pivots, at least 2 rig units apart.'});});
export type CompiledArtwork = z.infer<typeof CompiledComponent>;
/** Optional native representation shares existing slot/view/profile identity. */
export const NativeVectorComponent = z.strictObject({
  id:identifier, slot:z.enum(nativeComponentSlots), view:z.enum(assetViews),
  profiles:z.array(z.enum(bodyProfiles)).min(1).max(bodyProfiles.length),
  artwork:VectorArtworkV1,
  facing:z.enum(['normal','mirrored']).optional(),
  fitMorphology:z.literal('anatomical-v1').optional(),
  poseArtwork:z.array(z.strictObject({pose:z.enum(artworkPoseClasses),artwork:VectorArtworkV1})).max(6).optional(),
  authoredOffset:z.tuple([number(-32,32),number(-32,32)]).optional(),
  packageSource:z.strictObject({id:identifier,revision:z.number().int().min(1).max(1_000_000),license:z.string().min(1).max(500),provenance:z.string().min(1).max(500)}).optional(),
  dynamics:z.array(z.strictObject({group:identifier,points:z.array(z.tuple([number(-180,180),number(-180,180)])).min(2).max(5),material:LveMaterial,proxyIds:z.array(identifier).max(4)})).max(4).optional()
}).superRefine((part,ctx)=>{
  const groups=new Set<string>();for(const d of part.dynamics??[]){
    const art=part.artwork,refs=art.regions.filter(r=>r.material?.controlGroup===d.group);
    if(groups.has(d.group)||!['hair','top','head-accessory'].includes(part.slot)||!refs.length||!art.controlGroups.includes(d.group)||d.material.maxDisplacement>8||d.proxyIds.some(id=>!art.collisionProxies.some(p=>p.id===id))||new Set(d.proxyIds).size!==d.proxyIds.length||d.points.some(([x,y],i)=>x<art.bounds[0]||x>art.bounds[2]||y<art.bounds[1]||y>art.bounds[3]||i>0&&Math.hypot(x-d.points[i-1][0],y-d.points[i-1][1])<.01)||!refs.some(r=>r.material!.weights.some(w=>w.pin===1))||!refs.some(r=>r.material!.weights.some(w=>w.pin<1&&w.influence>0)))ctx.addIssue({code:'custom',path:['dynamics'],message:'Invalid native simulation group, pins, bounds, material or proxy reference'});
    groups.add(d.group);
  }
  const poseKeys=new Set<string>();for(const variant of part.poseArtwork??[]){
    if(poseKeys.has(variant.pose)||variant.pose==='rest')ctx.addIssue({code:'custom',message:'Duplicate or redundant pose artwork'});poseKeys.add(variant.pose);
    if(!isBoneSlot(part.slot)||variant.artwork.units!=='bone-normalized'||variant.artwork.pivot.some(n=>n!==0)||!variant.artwork.anchors.some(a=>a.id==='end'&&a.point[0]===1&&a.point[1]===0)||(!part.facing&&!variant.artwork.compatibility.mirrorSafe))ctx.addIssue({code:'custom',message:'Pose variants must preserve normalized bone anchors and facing compatibility'});
  }
  if(part.fitMorphology&&!isBoneSlot(part.slot))ctx.addIssue({code:'custom',message:'Anatomical morphology applies only to normalized bone art.'});
  if(!isBoneSlot(part.slot)&&part.artwork.units!=='rig')ctx.addIssue({code:'custom',message:'Fixed native slots require rig units.'});
  if(isBoneSlot(part.slot)&&(part.artwork.units!=='bone-normalized'||part.artwork.pivot[0]!==0||part.artwork.pivot[1]!==0||!part.artwork.anchors.some(a=>a.id==='end'&&a.point[0]===1&&a.point[1]===0)))ctx.addIssue({code:'custom',message:'Native bone parts require normalized origin and end anchor [1,0].'});
});
export type NativeVectorComponentData=z.infer<typeof NativeVectorComponent>;
export const CharacterVisual = z.strictObject({
  version:z.literal(1), style:z.enum(['classic','illustrated']), profile:z.enum(bodyProfiles),
  limbArt:z.literal('anatomical-v1').optional(),
  primaryArt:z.literal('pose-v1').optional(),
  shoulders:number(.8,1.25).optional(), waist:number(.75,1.35).optional(), hips:number(.8,1.3).optional(),
  armWidth:number(.75,1.3).optional(), thighWidth:number(.75,1.3).optional(), calfWidth:number(.8,1.25).optional(),
  abdomen:number(.8,1.3).optional(), wristWidth:number(.85,1.15).optional(), kneeWidth:number(.85,1.15).optional(), ankleWidth:number(.85,1.15).optional(),
  fingerLengths:z.tuple([number(.9,1.1),number(.9,1.1),number(.9,1.1),number(.9,1.1),number(.9,1.1)]).optional(),
  muscleDefinition:number(0,1).optional(), softness:number(0,1).optional(),
  handSize:number(.75,1.3).optional(), footSize:number(.8,1.25).optional(), neckLength:number(.8,1.2).optional(),
  components:z.array(CompiledComponent).max(80).optional(),
  vectorComponents:z.array(NativeVectorComponent).max(24).optional()
}).superRefine((visual,ctx)=>{
  const keys=new Set<string>(),facingKeys=new Set<string>();
  for(const component of visual.vectorComponents??[]){
    const key=component.slot+'/'+component.view,orientation=key+'/'+(component.facing??'both');
    if(facingKeys.has(orientation)||facingKeys.has(key+'/both')||(!component.facing&&keys.has(key)))ctx.addIssue({code:'custom',message:'Conflicting native slot/view/facing.'});
    facingKeys.add(orientation);
    if(!component.profiles.includes(visual.profile))ctx.addIssue({code:'custom',message:'Native component profile mismatch.'});
    keys.add(key);
  }
  for(const component of visual.components??[]){
    const key=component.slot+'/'+component.view;
    if(keys.has(key))ctx.addIssue({code:'custom',message:'Only one artwork component may occupy each slot and view.'});
    if(!component.profiles.includes(visual.profile))ctx.addIssue({code:'custom',message:`${component.id} does not fit the ${visual.profile} body profile.`});
    keys.add(key);
  }
});
export type CharacterVisualData = z.infer<typeof CharacterVisual>;
export const AssetManifest = z.strictObject({
  format:z.literal('sirvibe-visual-assets'), version:z.literal(1), id:identifier,
  name:z.string().trim().min(1).max(60), revision:z.number().int().min(1).max(1_000_000), category:z.enum(assetCategories),
  style:z.enum(['classic','illustrated']), rig:z.literal('sirvibe-native-v1'),
  license:z.string().trim().min(1).max(500), provenance:z.string().trim().min(1).max(500),
  tags:z.array(z.string().max(40)).max(20), dependencies:z.array(identifier).max(30),
  files:z.array(z.strictObject({path:assetPath,data:rasterData,width:z.number().int().min(1).max(2048),height:z.number().int().min(1).max(2048)})).min(1).max(80),
  parts:z.array(z.strictObject({id:identifier,file:assetPath,view:z.enum(assetViews),slot:z.enum(componentSlots).optional(),
    pivot:assetPoint, end:assetPoint.optional(), ground:assetPoint.optional(), placement:z.strictObject({x:number(-2000,3000),y:number(-2000,3000)}).optional(), width:number(8,960),height:number(8,540),
    offsetX:number(-80,80),offsetY:number(-100,100),fit:z.enum(['fixed','body']),
    profiles:z.array(z.enum(bodyProfiles)).min(1).max(bodyProfiles.length),symmetrical:z.boolean(),
    license:z.string().min(1).max(500).optional(),provenance:z.string().min(1).max(500).optional(),
    interaction:z.enum(['none','hold','sit']).optional(),interactionAnchor:assetPoint.optional()
  })).min(1).max(128)
}).superRefine((pack,ctx)=>{
  const filePaths=new Set<string>(),partIds=new Set<string>(),slots=new Set<string>();
  for(const file of pack.files){
    if(filePaths.has(file.path))ctx.addIssue({code:'custom',message:`Duplicate file: ${file.path}`});
    filePaths.add(file.path);
  }
  for(const part of pack.parts){
    if(!filePaths.has(part.file))ctx.addIssue({code:'custom',message:`Missing artwork: ${part.file}`});
    if(partIds.has(part.id))ctx.addIssue({code:'custom',message:`Duplicate part: ${part.id}`});
    partIds.add(part.id);
    if(part.slot){
      const key=part.slot+'/'+part.view;
      if(slots.has(key))ctx.addIssue({code:'custom',message:`Duplicate slot: ${key}`});
      slots.add(key);
      if(part.width>160||part.height>180)ctx.addIssue({code:'custom',message:'Character components exceed the calibrated rig dimensions.'});
    }
    if(part.slot&&isBoneSlot(part.slot)&&(part.offsetX!==0||part.offsetY!==0))ctx.addIssue({code:'custom',message:'Use calibrated joint pivots instead of limb offsets.'});
    if(part.slot&&isBoneSlot(part.slot)&&(!part.end||Math.hypot((part.end.x-part.pivot.x)*part.width,(part.end.y-part.pivot.y)*part.height)<2))ctx.addIssue({code:'custom',message:'Limb artwork requires distinct start and end pivots.'});
    if((pack.category==='hair'&&part.slot!=='hair')||(pack.category==='clothing'&&part.slot!=='top'&&!part.slot?.includes('arm')))
      ctx.addIssue({code:'custom',message:'Hair and clothing require their matching animation slot.'});
    if(part.interaction&&part.interaction!=='none'&&!part.interactionAnchor)
      ctx.addIssue({code:'custom',message:'Interactive props require a calibrated interaction anchor.'});
  }
  if(pack.files.reduce((n,f)=>n+f.width*f.height*4,0)>32*1024*1024)
    ctx.addIssue({code:'custom',message:'Decoded textures exceed the 32 MiB pack budget.'});
});
export type VisualAssetPack=z.infer<typeof AssetManifest>;
export const AssetPackage=z.strictObject({format:z.literal('sirvibe-assets'),version:z.literal(1),packs:z.array(AssetManifest).min(1).max(32)}).superRefine((value,ctx)=>{
  const ids=new Set(value.packs.map(pack=>pack.id));
  if(ids.size!==value.packs.length)ctx.addIssue({code:'custom',message:'Duplicate pack IDs.'});
  for(const pack of value.packs)for(const dependency of pack.dependencies)
    if(!ids.has(dependency)||dependency===pack.id)ctx.addIssue({code:'custom',message:`Unresolved dependency in ${pack.name}: ${dependency}`});
});
export function parseAssetPackage(text:string){
  if(text.length>12_000_000)throw Error('Asset package exceeds 12 MB. Split it into smaller packs.');
  let value:unknown;try{value=JSON.parse(text);}catch{throw Error('Choose a valid .sirvibe-assets JSON package.');}
  const parsed=AssetPackage.safeParse(value);
  if(!parsed.success)throw Error(parsed.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).slice(0,6).join('\n'));
  const packs=parsed.data.packs;
  // A dependency graph must be acyclic, even when every referenced pack exists.
  const visited=new Set<string>(),active=new Set<string>(),byId=new Map(packs.map(pack=>[pack.id,pack]));
  function visit(id:string){if(active.has(id))throw Error('Asset dependencies contain a cycle.');if(visited.has(id))return;active.add(id);for(const dependency of byId.get(id)!.dependencies)visit(dependency);active.delete(id);visited.add(id);}
  packs.forEach(pack=>visit(pack.id));
  if(packs.flatMap(p=>p.files).reduce((n,f)=>n+f.width*f.height*4,0)>64*1024*1024)throw Error('Package exceeds the 64 MiB decoded texture budget.');
  return parsed.data;
}
export function exportAssetPackage(packs:VisualAssetPack[]){return JSON.stringify(parseAssetPackage(JSON.stringify({format:'sirvibe-assets',version:1,packs})),null,2);}
export function compileComponents(pack:VisualAssetPack):CompiledArtwork[]{
  const valid=AssetManifest.parse(pack);
  return valid.parts.filter(part=>part.slot).map(part=>CompiledComponent.parse({
    id:part.id,slot:part.slot,view:part.view,image:valid.files.find(file=>file.path===part.file)!.data,
    pivot:part.pivot,...(part.end?{end:part.end}:{}),width:part.width,height:part.height,offsetX:part.offsetX,offsetY:part.offsetY,
    fit:part.fit,profiles:part.profiles,symmetrical:part.symmetrical,license:part.license??valid.license,source:part.provenance??valid.provenance
  }));
}
export function compatibility(pack:VisualAssetPack){
  if(pack.category==='character'){const report=characterCompatibility(pack);return report.completeViews.length?`Modular body · ${report.completeViews.join(', ')} · native hands and face animation`:`Partial character · missing calibrated parts in ${report.incompleteViews.map(v=>v.view).join(', ')||'all views'}`;}
  if(pack.category==='hair'||pack.category==='clothing'){
    const views=new Set(pack.parts.map(part=>part.view));
    return `${views.size===5?'All five views':'Limited orientations'} · ${[...views].join(', ')} · native hands and lip-sync retained`;
  }
  if(pack.category==='prop')return pack.parts.some(p=>p.interaction&&p.interaction!=='none')?'Calibrated interaction anchor':'Decorative prop';
  return 'Static environment artwork';
}
export function assetInstructions(category:typeof assetCategories[number],profile:typeof bodyProfiles[number]='average',style='illustrated'){
  return `Create original ${category} artwork for SIRVIBE Visual Asset Specification v1.\nStyle: ${style}, clean stylised 2D African cartoon illustration, selective outlines and subtle cel shading. Body profile: ${profile}.\nRig: sirvibe-native-v1. World axes: +x right, +y down. Local character ground (0,0); neutral pelvis (0,-76), neck (0,-130), head (0,-166), shoulders (+/-24,-120), elbows (+/-30,-93), wrists (+/-36,-66). These are reference units, not fixed image pixels; body parameters alter anchors.\nViews: front, three-quarter (slight right), side (right), back-quarter, back. For slight left use mirrored three-quarter only for symmetrical designs; asymmetric art requires separate orientation support; do not declare it mirror-safe. Keep identity and proportions consistent. Supply only views you actually draw.\n${category==='character'?'Supply separate transparent head-base (no eyes, mouth, brows or hair), torso top, left/right upper-arm, forearm, thigh, calf and shoe images per declared view. Keep native facial features and articulated hands. Each limb needs pivot and end landmarks normalised inside its crop, matching the proximal and distal joints; keep 3-5 rig units of overlap around each joint. A flat full-body image is not a rig.':category==='hair'?'Hair: separate transparent hair only. Pivot at head centre. Reference bounding box width 90, height 100; pivot is NORMALISED inside your cropped artwork. Do not include a face.':category==='clothing'?'Clothing: torso panel only, transparent, no arms/hands/head. Native sleeves remain articulated and their colour must match. Pivot at neck; reference width 60, height 75. Fit is limited to declared body profiles.':category==='environment'?'Environment: 16:9 clean background plate; separate transparent car, streetlight and foreground layers with original positions. Reference scene 960x540. Provide horizon, near/far ground reference y positions and scales separately. Do not paint actors or movable objects into the clean plate.':'Props: isolated transparent object; mark bottom-centre ground pivot and optional hand-grip or seat anchor. Full characters need separated articulated parts; a flat illustration is static artwork.'}\nPNG or WebP, true alpha (no checkerboard baked into artwork); <=2048px per edge, tightly cropped with joint overlap padding. Do not bake lighting that prevents tinting. Include licence and provenance.\nDeliver artwork plus a manifest: format sirvibe-visual-assets, version 1, rig sirvibe-native-v1, category ${category}, style ${style}, id, name, revision, license, provenance, tags, dependencies, files[{path,data,width,height}], parts[{id,file,view,slot?,pivot:{x,y},end?:{x,y},width,height,offsetX,offsetY,fit,profiles,symmetrical}]. All pivots use 0..1 coordinates; artwork sizes use rig units. Paths allow PNG/WebP only; embedded data URIs only; no scripts or external resources. The .sirvibe-assets JSON envelope is {format:'sirvibe-assets',version:1,packs:[manifest]}.\nImport into Asset preparation, crop/mask as needed, calibrate the pivot, declare supported views/body profiles, preview all declared views and test motion. Generation instructions cannot guarantee correct articulation or alignment. Never claim unsupported views or automatic hidden-part reconstruction.`;
}

export function characterCompatibility(pack:VisualAssetPack){
  const views=[...new Set(pack.parts.filter(part=>part.slot).map(part=>part.view))];
  const incompleteViews=views.map(view=>({view,missing:characterCoreSlots.filter(slot=>!pack.parts.some(part=>part.view===view&&part.slot===slot))})).filter(item=>item.missing.length);
  return {completeViews:views.filter(view=>!incompleteViews.some(item=>item.view===view)),incompleteViews,nativeControls:['hands','fingers','thumbs','eyes','mouth','visemes']};
}
