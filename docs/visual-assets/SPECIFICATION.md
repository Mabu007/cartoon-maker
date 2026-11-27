# SIRVIBE Visual Asset Specification v1

This implementation extends GitHub main `8f568d0f6db0692ce4dc600a195b4e1dd5bccd27`. The user's laptop checkout was unavailable. Existing workspace source copies were older and were removed at the user's request after the isolated current checkout and its dependency cache were established. No merge or production deployment is part of this delivery.

## Working scope

The implementation includes reusable hair, torso, head-base, articulated limb and footwear artwork, body profiles and individual body proportions, existing facial and garment controls, manual artwork preparation, offline reusable asset storage, packaging, AI instructions, local lighting, contact shadows, ground-based perspective, scale/opacity/depth property keys, and a layered illustrative scene. The native skeleton, hand/finger capture, visemes, camera and timeline evaluator remain the animation system.

The new bases are **prototypes**, not a claim that the brief's premium artistic standard has been met. Original SVG artwork and portable sample packs are in `public/visual-examples`. They are deliberately limited to the views actually authored. Original illustration replaces external AI imagery in this delivery.

## Package envelope

`.sirvibe-assets` is UTF-8 JSON, not an archive:

```json
{"format":"sirvibe-assets","version":1,"packs":["manifest objects here"]}
```

Each manifest has `format: "sirvibe-visual-assets"`, `version: 1`, a unique ID, name, integer revision, category, style (`classic` or `illustrated`), `rig: "sirvibe-native-v1"`, licence, provenance, tags, dependencies, embedded raster files, and calibrated parts. The machine-readable JSON schemas in this directory are generated from the same Zod definitions used by the application. Complete real examples are the `.sirvibe-assets` files in `public/visual-examples`.

Supported application categories are `hair`, `clothing`, `prop`, and `environment`. The `character` category supports explicitly separated modular body artwork. A flattened full character remains static art. Supported slots are `hair`, `top`, `head-base`, left/right upper-arm, forearm, thigh, calf and shoe. Body packs can supply one or more views; a complete body view requires all 12 core slots. Hands, fingers, eyes, brows and mouths remain native and animated. Other category identifiers are reserved.

There is no archive extraction and no package code execution. Data is embedded PNG/WebP. Preparation accepts restricted passive SVG, rasterises it, then saves WebP. No remote resource, JavaScript, SVG image/use elements, CSS, filters, or executable attachment is accepted by that preparation path. Only relative PNG/WebP paths with simple alphanumeric, underscore and hyphen names are permitted. Traversal and absolute URLs are rejected. Imported image headers and decoded dimensions are checked; declared memory is bounded before decoding. Do not load untrusted SVG through a different path and assume these compiler restrictions apply there.

Budgets: 12 MB package text, 32 packs/package, 80 artwork files and 128 parts/pack, 2048 pixels per edge, 32 MiB decoded RGBA/pack and 64 MiB/package. Raster strings max 450,000 characters; prepared parts target 95,000 to fit existing portable prop limits. Body component dimensions max 160×180 rig units, max 80 compiled components/character. Joint endpoints must be distinct by at least two rig units. Bone offsets must stay zero: calibrate the image pivots instead. PNG/WebP files can have different pixel resolutions. Packages must include all dependencies; missing dependencies and dependency cycles fail validation. Imports are atomic and never replace an installed pack with the same ID. Pack deletion is blocked while another installed pack depends on it. Export includes the selected pack's dependency closure.

## Coordinates and native rig

World axes: +x to the right, +y downward. Reference stage 960×540. Actors and image props use bottom/ground positions; camera zoom is independent from object scale. Part pivots use normalised crop coordinates `[0,1]`. Part `width` and `height` are in local rig units; pixel dimensions only determine texture sampling. Offsets use rig units. An optional prop `placement` is a point in reference scene coordinates; the compiler uses it to return an extraction to its original placement. The current background framing transform is applied on insertion.

`visualRigAnchors()` provides the actual existing rig's anchors for a character, view and pose. Reference neutral proportions are approximately pelvis `(0,-76)`, neck `(0,-130)`, head `(0,-166)`, shoulders `(±24,-120)` and the ground at `(0,0)`. These are explanatory defaults: parameters and pose alter the actual anchors.

| Compiler semantic | Existing rig mapping | Status |
| --- | --- | --- |
| root, ground | actor origin | required |
| pelvis | `rig().hip` | native |
| torso | midpoint of hip and neck | calibration reference |
| chest, top | neck | torso artwork attachment |
| neck, head, hair | `rig().neck`, `rig().head` | native, hair attachment |
| shoulder, elbow, wrist, hand | corresponding left/right native solved limb | upper-arm and forearm artwork; articulated native hands |
| hip, knee, ankle, foot | corresponding native leg and gait/seating IK | thigh, calf and shoe artwork |
| fingers and thumb | native `handRig` and capture channels | native; no imported finger art in v1 |
| eyes, eyebrows, mouth | native head-local facial renderer and mouth rig | native; no imported face art in v1 |
| hand grip and seat | existing prop interaction system, calibrated image interaction anchor | supported |
| back/accessory sockets and arbitrary mesh deformation | reserved | deferred |

Hair and a featureless `head-base` attach at head centre and follow head rotation/scale. Native face features animate over the head base. Torso art attaches at the neck and follows torso rotation. Native sleeves and arms remain available when no calibrated replacements are installed. Clothing can also include upper-arm/forearm segments. Do not paint a whole rigid arm, hand, eyes or mouth into a torso/head panel. Declare only body profiles on which the panel fits. `fixed` keeps art dimensions; `body` applies controlled shoulder and torso-length fit. Each limb part declares normalised `pivot` and `end` landmarks for its proximal/distal joint. A deterministic affine transform maps them onto the existing solved native joint pair, including MoCap wrist targets, gait and seating; perpendicular width adjustment keeps both landmarks fixed. Joint overlap padding prevents visible gaps. Shoes attach at the solved foot. Extreme clothing fit still needs visual inspection and may require another artwork variant. Imported raster colours and head outlines are baked artwork; continuous native colour/head-outline adjustments do not repaint or deform these images. Colour masks remain future work.

## Views and mirroring

Five actual views: `front`, `three-quarter`, `side`, `back-quarter`, `back`. Native left/right direction is represented by actor flip. Three-quarter is a slight front view, not a full side view. Each part declares one view, so a pack can contain distinct artwork per view. Unsupported views retain the explicitly disclosed native component. The status lists every supported imported view. The modular noir example supplies all 12 required body parts for front and three-quarter; it makes no claim to side/back artwork. Incomplete body packs list missing slots and retain native components in those slots.

`symmetrical` records whether mirroring is artistically appropriate. The current rig flips the entire actor; independent asymmetric left/right artwork is not implemented. Asymmetric designs must not be claimed as fully supported. Additional front/back layering within one hairstyle is also deferred; author the current single hair overlay accordingly.

## Character parameters and compatibility

`Character.visual` is optional. Present data carries its own `version: 1`, style and body profile. Profiles: slim, average, curvy, athletic, muscular, broad, larger, short, tall, young-adult, mature, elderly. Presets resolve into existing height/head/torso/limb and body-build parameters. New safe continuous controls adjust shoulders, waist, hips, arm/thigh/calf thickness, hand size, foot size and neck length. These feed the existing geometry, rig joints and attachments. Profile changes detach incompatible imported artwork and the UI tells the user. Style changes explicitly detach custom parts.

Faces, hairstyles, articulated hands, colours, patterns, logos and garment types keep using existing editable controls. Profile names are presets rather than a claim of anatomically accurate age simulation. There is no physics-based cloth simulation.

Compiled components embed their raster, both joint landmarks when applicable, calibration, per-part licence and provenance in character definitions. They therefore survive ordinary project persistence and `.sirvibe` backups without requiring the shared asset database. Shared artwork is stored once in the `sirvibe-visual-assets` IndexedDB database for reuse. Project copies intentionally retain embedded dependencies for portability. Existing project artwork budget is 32 MB; the existing binary backup header limit remains 4 MiB, and oversized backups fail with an error. There is no silent omission of custom components.

## Environment and property evaluation

`Scene.visual`, `Actor.visual` and `SceneObject.visual` are optional, versioned where appropriate. Missing settings retain existing rendering. Point-light RGB contributions add to ambient RGB, with bounded radius and continuous power falloff, then tint character art, faces, hands and eligible props. Baked backgrounds are not tinted. This is an artistic 2D approximation, not physically based lighting. Light keys animate x/y/intensity; colour/radius/falloff remain static. Contact shadows retain existing pose/ground placement, now with colour and opacity controls. Eco reduces the editor shadow footprint; capture uses the full footprint.

Perspective is an artist-calibrated image-space linear depth curve between near and far foot-Y references, with min/max clamps. The horizon is a calibration constraint/reference, not a full projective camera model. The final actor size is `baseScale × keyedManualScale × perspectiveScale`. Gait stride uses the evaluated scale when deriving local velocity. The optional **Perspective-aware walking speed** control reparameterises movement through a cached 64-segment timing curve weighted by reciprocal ground scale. This makes the root move faster in the foreground and slower in depth while preserving clip duration/endpoints, the existing path and the existing evaluator. It is off when omitted, and actor perspective opt-out retains original timing. This is a calibrated image-space approximation, not a full 3D camera/ground model.

Paused stage editing now exposes **Edit lights & ground**. Drag light, horizon, near-reference and far-reference handles; arrow keys support adjustments. A pointer gesture commits one undoable edit. Animated light dragging inserts/replaces a key at the playhead and retains prior keys. Calibration handles clamp to preserve horizon < far < near. These browser interactions still require live visual verification.

Property keys use the existing scene clock and evaluator, not another playback loop. Inspector actions store scale/opacity/depth keys on the existing entity; the same evaluator handles playback, arbitrary seeking and export. These keys are not a new draggable timeline lane. Existing manual layer depth dominates; equal layers sort by foot Y using the current stable Pixi scene graph. Parked transparent props can serve as occluders without modifying the clean background.

## Preparation workflow

1. Open Artwork library / import from the asset panel, or Import / prepare artwork in the character editor.
2. Choose PNG, WebP or passive SVG. Use a polygon around a visible part or object; undo/remove points as needed. Add/subtract brushes refine the selection with stroke undo/redo and adjustable size. Crop to selection, or adjust crop numbers. Brush coordinates remain relative to the original image, so cropping does not shift the selection.
3. Preview transparency. Optional flat-colour removal uses a tolerance; it is not learned segmentation. All-transparent selections fail validation.
4. Set category, body-part slot, actual supported view, compatible profile, rig dimensions, start pivot and, for limbs, end joint. Set licence and provenance. A rotation audition previews calibrated limb motion without running another animation solver. Props can declare a grip or seat anchor. Source-scene extraction retains placement.
5. Save reusable artwork, then Use artwork. Character imports check art style and body profile. Save the character to commit changes. Test all declared views/actions.
6. Export a pack for another installation, including dependency packs. The character editor also exports all currently attached body artwork as a portable pack with deduplicated textures and original per-part licence/provenance. Deleting library artwork does not erase the copies already embedded in movies.

Polygon extraction preserves visible source pixels and alpha. It does not recover hidden pixels. Background reconstruction, local learned segmentation, automatic sheet splitting and automatic full-character rigging are deferred. Manual modular body compilation and brush-based refinement are available. Source alpha is preserved independently of selection edits; an add brush cannot invent pixels absent from the source. A stationary extracted occluder does not require background repair. A moved extraction can reveal the original object still painted into a flattened background; use a clean background plate prepared externally.

## Clean start

The user requested deletion of older saved cartoons and source copies. Four older source copies available in this workspace were deleted. `My cartoons → Delete all cartoons` is an explicit per-installation action that clears saved cartoons, recovery versions and legacy migration sources across local account scopes. It never runs automatically for other users. Reusable artwork, downloaded backups and unreferenced media files are independent. The user's laptop folders and personal browser saves were not accessible and were not deleted by this implementation.

## Deferred production work

The following are **not complete**: premium production art approval; automatic full-character rigging from flattened artwork; independent asymmetric orientation art; front/rear hair sublayers; imported face/finger art; garment colour masks and arbitrary garment creation; cast/rim/spot/area/directional lighting; final-scene grading; independent environment-layer packaging and parallax; learned local segmentation; inpainting/clone repair; main-lane draggable property keys; live webcam regression on actual Celeron hardware; end-to-end accelerated visual and video-export validation.

Do not deploy this draft as if the entire engineering programme were complete. Continue from this tested slice and run the browser fixture on a machine with functional Chromium/WebGL. The REVENENT scene is a silent visual benchmark, not a finished voiced episode.
