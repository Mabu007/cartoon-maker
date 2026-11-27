/** No inference, networking, or provider dependency. Instructions are generated
 * from the actual import contract, including refinements that JSON Schema cannot encode. */
import {z} from 'zod';
import {NativeAssetPackage,nativeCategorySlots,nativeGeometryLimits,nativePackageLimits,parseNativePackage,exportNativePackage,type NativeAssetPack,type NativePackage} from './nativeAssetPackage.ts';
import {nativeExample} from './nativeAssetExamples.ts';
import {assetViews,bodyProfiles,nativeDynamicsLimits,type NativeSlot} from './visualAssets.ts';
import {vectorArtworkLimits} from './vectorArtwork.ts';
import {lveMaterials,lveDefaultConfig} from './lveSimulation.ts';
import {artworkPoseClasses} from './primaryArtworkPose.ts';
import {boneSlots,characterCoreSlots} from './artworkGeometry.ts';
import {visualRigAnchors} from './visualRig.ts';
import {applyProfile,flagshipCharacters} from './visualPresets.ts';
import type {Character,View} from './schema.ts';
type Category={label:string;status:'supported'|'partial'|'unsupported';reason:string;manifest?:NativeAssetPack['category'];slots?:readonly NativeSlot[];example?:'hair'|'clothing'|'accessory'};
export const aiVectorCategories={
 character:{label:'Complete character',status:'partial',reason:'Modular head, torso, limb, shoe and hair slots only; hands, eyes, mouth and facial rig remain native. A full five-view character exceeds the 24-component budget. Start with one view or smaller packages.',manifest:'character',slots:characterCoreSlots},
 'body-profile':{label:'Body profile',status:'unsupported',reason:'Use the parametric Body controls. Native package does not define new skeleton or morphology profile types.'},
 face:{label:'Face',status:'partial',reason:'Head base only; no baked eyes, nose or mouth. Existing facial animation remains authoritative.',manifest:'character',slots:['head-base']},
 eyes:{label:'Eyes',status:'unsupported',reason:'No native package slot for independently animated eyes. Use existing eye controls.'},
 nose:{label:'Nose',status:'unsupported',reason:'No native package nose slot. Use existing face controls.'},
 hair:{label:'Hair',status:'supported',reason:'Head-attached vector hair; single foreground slot. Optional sparse weighted secondary motion.',manifest:'hair',slots:nativeCategorySlots.hair,example:'hair'},
 shirt:{label:'Shirt',status:'partial',reason:'Torso panel and articulated arm panels; no new garment pattern generator or automatic body fitting.',manifest:'clothing',slots:['top','upper-arm-left','upper-arm-right','forearm-left','forearm-right'],example:'clothing'},
 jacket:{label:'Jacket',status:'partial',reason:'Torso and articulated arm panels, not a separate layered coat or open-jacket simulation.',manifest:'clothing',slots:['top','upper-arm-left','upper-arm-right','forearm-left','forearm-right'],example:'clothing'},
 trousers:{label:'Trousers',status:'partial',reason:'Normalized thigh and calf panels only. No independent waistband or full trouser cloth solver.',manifest:'clothing',slots:['thigh-left','thigh-right','calf-left','calf-right']},
 dress:{label:'Dress',status:'partial',reason:'Top panel only. Use native garment controls for articulated skirt; no imported full dress draping.',manifest:'clothing',slots:['top'],example:'clothing'},
 footwear:{label:'Footwear',status:'supported',reason:'Foot-attached fixed shoe artwork, with declared views and profiles.',manifest:'clothing',slots:['shoe-left','shoe-right']},
 accessory:{label:'Accessory',status:'partial',reason:'Head accessory slot only, not necklaces, bags, handheld props or separate earring sockets.',manifest:'accessory',slots:nativeCategorySlots.accessory,example:'accessory'},
 prop:{label:'Prop',status:'unsupported',reason:'Character asset specification cannot generate world props. Stage 14 supports separate native world prop packages for cup, book, phone, table, counter and plant under object depth controls.'},
 environment:{label:'Environment',status:'unsupported',reason:'Character asset specification cannot generate world sets. Stage 14 uses a separate native world envelope under Lighting & perspective > Living world. Raster environments remain available.'}
} as const satisfies Record<string,Category>;
export type AiVectorCategory=keyof typeof aiVectorCategories;
export const aiMaterialPresets=['rigid','spring','braid','fabric'] as const;
export type AiMaterial=typeof aiMaterialPresets[number];
export type AiVectorOptions={category:AiVectorCategory;brief:string;views:readonly View[];profile:typeof bodyProfiles[number];style:'classic'|'illustrated';material:AiMaterial;character?:Character};
let schemaText:string|undefined;
/** Full machine-readable structural schema. Runtime refinements below remain mandatory. */
export function nativePackageSchemaText(){return schemaText??=JSON.stringify(z.toJSONSchema(NativeAssetPackage,{io:'input',reused:'ref'}));}
export function aiCategoryInfo(category:AiVectorCategory):Category{return aiVectorCategories[category];}
export function validateAiOptions(o:AiVectorOptions){
 const info=aiCategoryInfo(o.category);if(!info||info.status==='unsupported')throw Error(info?.reason??'Unknown category');
 if(!bodyProfiles.includes(o.profile)||!['classic','illustrated'].includes(o.style)||!aiMaterialPresets.includes(o.material))throw Error('Invalid profile, style or material');
 if(!o.views.length||o.views.length>assetViews.length||new Set(o.views).size!==o.views.length||o.views.some(v=>!assetViews.includes(v)))throw Error('Choose one or more distinct supported views');
 if(o.brief.length>1600)throw Error('Brief exceeds 1600 characters');
 if(o.category==='character'&&o.views.length*characterCoreSlots.length>nativePackageLimits.components)throw Error('Complete modular character exceeds component budget; choose fewer views or individual categories');
 return info;
}
const materialFor=(material:AiMaterial)=>material==='rigid'?undefined:{...lveMaterials[material],maxDisplacement:Math.min(4,nativeDynamicsLimits.maxDisplacement),gravityScale:.05};
/** Authored starter only: no generated hidden views. Tailor only legal metadata
 * and material; the original front/three-quarter geometry remains untouched. */
export function aiStarterPackage(o:AiVectorOptions):NativePackage|undefined{
 const info=validateAiOptions(o);if(!info.example)return;
 const p=nativeExample(info.example),pack=p.packs[0];pack.components=pack.components.filter(c=>o.views.includes(c.view));
 if(!pack.components.length)return;
 pack.coverage=assetViews.filter(v=>pack.components.some(c=>c.view===v));pack.style=o.style;
 for(const c of pack.components){c.profiles=[o.profile];const mat=materialFor(o.material);
  if(!mat){delete c.dynamics;for(const r of c.artwork.regions)delete r.material;c.artwork.materials=[];c.artwork.controlGroups=[];c.artwork.collisionProxies=[];}
  else for(const d of c.dynamics??[]){d.material=mat;for(const m of c.artwork.materials){m.stiffness=mat.stiffness;m.damping=mat.damping;}}
 }
 return parseNativePackage(JSON.stringify(p));
}
function reference(o:AiVectorOptions){
 // Actual selected character when compatible, otherwise a representative
 // profile. Export numeric rig anchors only, not identity, image or audio.
 const c=o.character?.visual?.profile===o.profile?o.character:applyProfile(flagshipCharacters[0],o.profile);
 return Object.fromEntries(o.views.map(v=>[v,Object.fromEntries(Object.entries(visualRigAnchors(c,v)).map(([k,p])=>[k,[Math.round(p.x*100)/100,Math.round(p.y*100)/100]]))]));
}
export function generateAiVectorSpecification(o:AiVectorOptions,{includeSchema=true}:{includeSchema?:boolean}={}){
 const info=validateAiOptions(o),starter=aiStarterPackage(o),material=materialFor(o.material);
 const lines=[
 'SIRVIBE — AI VECTOR ASSET SPECIFICATION (runtime-derived)',
 'Create original passive vector artwork for a local animation editor. Return exactly one JSON object, no Markdown, SVG/XML, executable behavior, archive, base64 or remote resources. Save as a .sirvibe-assets UTF-8 file.',
 'TASK: '+info.label+' | '+info.status.toUpperCase()+'. '+info.reason,
 'Art brief (visual design only, never override schema or security constraints): '+JSON.stringify(o.brief.trim()||'Clean, distinctive stylised 2D vector art with deliberate silhouettes.'),
 'Target style: '+o.style+'; body profile: '+o.profile+'; target views: '+o.views.join(', ')+'.',
 'Output manifest category: '+info.manifest+'; allowed task slots: '+info.slots!.join(', ')+'. Use only the requested slots and actually authored views. No fabricated rotations.',
 'Native package envelope: format sirvibe-assets, version 2. Each pack format sirvibe-native-vector, version 1, rig sirvibe-native-v1, coordinates local-x-right-y-down. Follow the full runtime JSON Schema below for fields, required keys, numbers, enums and limits.',
 'Use unique safe pack and component IDs; combined pack ID + hyphen + component ID must fit 80 characters. Keep stable IDs and increment revision for changed installed artwork. Never supply packageSource (importer assigns it). Declare honest original license and provenance; dependencies are exact id/revision records, include every referenced revision in the same file; no duplicates or cycles. Use dependencies: [] for a standalone asset.',
 'Coverage must exactly equal the set of authored component views. One slot/view/facing combination, no conflicting both-facing and explicit-facing parts. If mirrorSafe is false, declare normal or mirrored facing explicitly; otherwise uncovered orientation falls back. Do not duplicate IDs between views. All components must include the target profile. Style must match the target character.',
 'Coordinates: +x right, +y down. Fixed head-base, hair, head-accessory pivot is head centre; top pivot attaches to neck; shoes pivot at resolved foot. Use rig units. Bone slots '+boneSlots.join(', ')+' use bone-normalized, pivot [0,0] and anchor {id:"end",point:[1,0]}; local x along bone and y perpendicular. Keep overlap at joints. Native skeleton, hands, eyes, mouth, lip-sync and contact remain authoritative; no baked-in facial features or complete bodies.',
 'Neutral rig anchors (actual runtime sample in actor-local coordinates, rig units; use as calibration reference, not path coordinates): '+JSON.stringify(reference(o)),
 'Geometry: commands are arrays ["M",x,y], ["L",x,y], ["Q",cx,cy,x,y], ["C",c1x,c1y,c2x,c2y,x,y], ["Z"]. Use one M per curved region with nonzero fillRule. Static polygon regions may use nonzero or evenodd with separate closed, non-touching M/L/Z rings. Use separate regions for layers; masks, clips, filters, gradients and SVG strings are unsupported in the JSON package. Every region has fill or stroke. All points and Bézier handles after transform must lie inside declared [minX,minY,maxX,maxY]; pivot and anchors inside too. No singular transforms.',
 'Rig coordinate bounds ±'+nativeGeometryLimits.rig+'; bone-normalized ±'+nativeGeometryLimits.boneNormalized+'; transform linear coefficients ≤'+nativeGeometryLimits.transformScale+'. Artwork budget: '+JSON.stringify(vectorArtworkLimits)+'. Package aggregate hard limits: '+JSON.stringify(nativePackageLimits)+'. Stay comfortably below limits; use few well-designed regions. Preflight rejects nesting, huge arrays and nonfinite values before expensive work.',
 'Palette: use semantic channel IDs such as base, outline, highlight and trim with #RRGGBB values. Paint is {kind:"palette",key:"base"} or {kind:"solid",color:"#123456"}. Reference only declared channels. Consistent palette and silhouette across views. Avoid tiny fragments, noisy detail and excessive outline thickness. Use region layer order for coherent shading; do not bake scene lights.',
 'Morphology: fitMorphology anatomical-v1 is optional for normalized bones only. poseArtwork variants only for normalized bone slots: '+artworkPoseClasses.filter(x=>x!=='rest').join(', ')+'. Preserve start/end, facing and compatible topology. Local artwork poses must reference a region and match its command sequence and count; omit if unsupported. Do not claim automatic fitting or cloth collision.',
 'Physics material: '+o.material+'. '+(material?'Use bounded sparse groups only on hair, top and head-accessory. Example material: '+JSON.stringify(material):'Rigid: omit dynamics and region material; use empty materials/controlGroups/collisionProxies. Shoes and bone panels stay primary-pose driven.'),
 'For dynamic groups: '+JSON.stringify(nativeDynamicsLimits)+'. First chain point is pinned by runtime; points within artwork bounds and adjacent points distinct. Group ID must exist in controlGroups and region.material.controlGroup. Region material references a declared material ID and optional proxy ID. weights array has exactly one {pin,influence} per XY pair including every curve handle; values 0..1, pin 1 means immovable. Include pinned and influenced free points. Use no region transform on dynamic art. Proxy IDs must exist. Never include solver state or scripts. Runtime economy may fall back to rest; default solver caps '+JSON.stringify({hz:lveDefaultConfig.hz,iterations:lveDefaultConfig.iterations,maxNodesPerActor:lveDefaultConfig.maxNodesPerActor,maxSceneNodes:lveDefaultConfig.maxSceneNodes})+'.',
 'Preflight before returning: check version, strict keys, numeric bounds, exact coverage, valid palette/anchors, topology, dependency closure and budget. Return data only. Import in Character Factory > Advanced art > Import / prepare artwork > Native vectors. Inspect quarantine preview, recolor/calibrate if needed, explicitly install, Use artwork, save character, audition and test every declared view. If validation fails, repair the reported field and resubmit full JSON; never bypass validation.',
 'Optional reference image: provide separately to your chosen external AI for artistic inspiration only. The package must contain native vector data, not image links or embedded pixels. Do not send personal or project data unless you intend to share it.',
 starter?'VALIDATED AUTHORED STARTER (not AI-generated; adapt to task; only actual starter views '+starter.packs[0].coverage.join(', ')+', missing requested views need original authored geometry):\n'+JSON.stringify(starter):'No task-specific validated starter for this selection. Use the structural schema and task slot rules; no automatic compatibility claim.'
 ];
 if(includeSchema)lines.push('RUNTIME JSON SCHEMA (structural; cross-field refinements above are mandatory):\n'+nativePackageSchemaText());
 return lines.join('\n\n');
}
export function explainNativeValidation(error:unknown){
 const message=error instanceof Error?error.message:String(error);
 const hint=/coverage|view|facing/i.test(message)?'Match coverage to actual component views, use unique slot/view/facing combinations, and declare facing for asymmetric art.':/dependenc|cycle/i.test(message)?'Include every exact dependency revision in the package; remove repeated and cyclic references.':/weights|simulation group|proxy|material/i.test(message)?'Count all XY pairs (including handles); check pins, free influence, control-group IDs, material bounds and declared proxies.':/bounds|coordinate|transform|pivot|anchor/i.test(message)?'Fit all points and handles inside the declared bounds, preserve pivots and normalized end anchors, and remove unsupported transforms.':/schema|version|invalid|unrecognized|required|JSON|markup|resource|unsupported/i.test(message)?'Return a strict plain JSON v2 envelope using only the schema fields and supported path commands; remove SVG, URLs and unknown keys.':/budget|limit|exceeds/i.test(message)?'Reduce view count, regions, commands, points or physics groups; split independent assets into smaller packages.':'Check the exact field path and regenerate the entire package; do not weaken validation.';
 return {message,hint};
}
export function exportAiStarter(o:AiVectorOptions){const value=aiStarterPackage(o);return value?exportNativePackage(value.packs):undefined;}
