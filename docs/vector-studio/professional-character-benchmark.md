# Professional character benchmark — preproduction brief

Status: **blocked on Stage 1 acceptance**. This is art direction and a test specification, not authored model sheets, a renderer implementation or visual verification.

## Reference and scope

The earlier artistic reference image is not available for inspection here. The recovered description calls for semi-realistic modular vector cut-out illustration: natural silhouettes, selective outlines, flat color and controlled cel shading. Create original South African contemporary character art rather than reproducing or tracing a reference. Use the two existing Studio identities and the existing pose, view, profile and component system. No special-case rendering by character ID.

Stage 0 evidence lives in [anatomy baseline QA](../visual-assets/qa/anatomy-baseline/README.md). Use those exact fixtures as the before comparison, not as evidence for new art. Known issues recorded there include bent-leg overlap in the isolated sit audition and simpler hair, face, wardrobe and shoes in the SVG fallback.

## Proposed character direction

These are starting artistic decisions, not approved final artwork. Keep proportions editable and preserve the existing native hand/face controls until their replacement contract is verified.

| Feature | Studio Sbu | Studio Zee |
| --- | --- | --- |
| Identity | Adult athletic build; oblong face, substantial jaw and cheekbones, hooded eyes, close fade and goatee | Adult curvy build; heart-shaped face, shaped cheekbones, almond eyes, arched brows and structured braids |
| Silhouette | Broader shoulder line, tapered torso, relaxed stance, articulated knees and believable shoe volumes | Natural waist-to-hip transition, relaxed shoulders, grounded legs, distinct hair mass and believable footwear |
| Original clothing direction | Deep teal tailored streetwear jacket, charcoal trousers, sand-toned boots, muted brass accents | Terracotta blouse with rolled cuffs, dark teal wide-leg trousers, warm tan footwear and understated jewelry |
| Existing base palette | skin #a7684b; shirt #304a48; pants #28363e; shoes #d3c1a2; hair #242120 | skin #9c5b43; shirt #b46d50; pants #263b40; shoes #d9b482; hair #302327 |

Use the same component authoring process for both characters. Each garment, hair mass, face component and accessory must be independently selectable and replaceable when the shared contract supports it. Do not commit a flattened character as a substitute for modular artwork. Preserve existing preset IDs and old saved projects; add a deliberate upgrade choice, not an automatic migration of appearance.

## Style rules

- Construct silhouette from intentional Bézier curves. Show anatomy with taper, curvature, overlapping masses and meaningful negative space; avoid tubes, disconnected joints and uniform line weight.
- At the reference 960x540 scene scale, start with approximately 0.8–1.6 rig-unit exterior contour strokes and 0.5–0.9 interior details where appropriate. These are provisional art targets, not renderer guarantees; tune at actual character scale. Avoid outlining every color panel. Omit detail that collapses at normal shot size.
- Use semantic base, shadow, highlight and accent palette channels, resolved consistently in both render paths. Prefer one coherent key-light direction and one principal shadow plane plus sparse highlights. Do not apply a black outline to every shadow. Preview skin tones in neutral, warm and cool lighting.
- Eyes require upper and lower lid shapes, iris containment and useful gaze clearance; nose and lips use silhouette, small shade shapes and restrained contours. Viseme motion must remain readable. Hair should have recognizable masses and hairline, with grouped braid or fade details rather than many thin paths.
- Build garment folds around shoulder, elbow, waist, hip and knee tension; preserve seam and cuff continuity through pose changes. Use anchor-aligned overlaps rather than arbitrary scaling to conceal joint gaps. Hands need palm, thumb base, knuckles and readable finger silhouettes without overriding grip IK.
- Complexity: honor Stage 1 hard limits (24 regions, 128 commands per path, 1,024 total commands per artwork, 32 palette keys). Do not treat ceilings as targets. Prefer reusable static contours, profile-compatible variants, and bounded updates for genuinely deforming areas. No gradients until measured and explicitly budgeted.

## Turnaround and landmark specification

Author a coherent view variant for front, three-quarter front, side, three-quarter rear and rear. Establish a neutral ground line and a common head/neck/pelvis/shoulder/elbow/wrist/hip/knee/ankle landmark system from the existing rig. Draw a real profile with correct facial projection, ear position and torso thickness; do not squeeze the front view. Back and rear-quarter need distinct hair and clothing panels, no forward-facing facial features.

For each variant record component ID, slot, view, compatible body profiles, pivot, local bounds, anchors, paint channels and layer order. Record mirror safety per asset: mirror only explicitly symmetrical art; directional closures, jewelry, hair parting or other asymmetric details need separately authored orientation or must be omitted until the schema supports it. Stage 1 currently has only the existing five-view identity, no distinct left/right asymmetry variant contract. Do not claim full asymmetry support until that gap is addressed. Keep pin weights at attachment points, assign influence to deformable control points and record maximum displacement; do not add a new solver.

## Evidence matrix (not executed)

| Capture | Required evidence |
| --- | --- |
| Neutral turnaround | Both characters, all five views, both facing directions wherever distinct; aligned ground and anatomical landmarks |
| Scene-scale and close-up | 960x540 native stage frame and face/hand close-ups, same camera/time/lighting before and after |
| Motion | Standing, walk contact/passing poses, sit, conversational gesture, point, fist, open palm and grip; use existing action/hand capabilities |
| Facial | Neutral, smile, concern, brow raise, gaze offsets and supported visemes; preserve manual cue precedence |
| Object contact | Reach, hold and release existing prop with the same wrist/hand anchor, both hands if supported; seated cup fixture |
| Native fallback | Same component selection, paint and geometry; compare actual screenshots, document any unsupported differences |
| Persistence | Save, backup, reopen offline; older fixture unchanged unless explicitly upgraded; palette/variant edits retained |
| Export | Same representative time sample rendered in exported video; offline audio and lip-sync intact |

Annotate before/after images with actual view, pose, camera, commit and known defects. Inspect silhouette readability, wrist/knee/shoulder seams, clipping, side depth, rear layer order, joint continuity, eye and lip shapes, sleeve overlap and grip contact. Record each defect and retest after correction. Do not mark a row complete merely because a reference drawing exists.

## Engineering and release gate

1. Complete Stage 1 live actor/CharacterFactory/native fallback integration, static cache ownership and disposal, optional-field persistence/profile edits, and real project round-trip. Extend slots/identity and compatibility where necessary through that same system rather than introducing a parallel character format. Verify renderer-supported mask/clip/fill behavior or explicit fallback.
2. Obtain passing hosted CI for Stage 0 and Stage 1. On the actual candidate run Node 22 with the lockfile: npm ci, npm run build, npm run verify:offline. Preserve all existing tests.
3. Build two reusable modular art fixtures; inspect actual in-app renders, not only standalone SVGs. Record before/after and iterate. Add fixture validation, view consistency, legacy regression and backup coverage.
4. Reuse Stage 0's two-actor fixture and timing protocol for a paired comparison: warm-up, median and p95 draw submission, repeated runs; report sustained playback, memory and dropped frames separately. Stage 0 anatomy observed 7.6–8.0 ms median and 17.4–19.9 ms p95 in software WebGL, not target-device results. Verify the N4020/4 GB/UHD 600 on-device before claiming target performance.
5. Document actual checks, unresolved rig/art gaps and tested commit. No merge, production promotion, mass asset expansion or further stage until the relevant gates pass.

This document does not establish visual quality or animation fidelity. No new model sheets or application screenshots are supplied by this preproduction brief.

## Consolidation update

Explicit upgrade presets `sbu-vector-v1` and `zee-vector-v1` now integrate existing authored anatomy, identity-specific face controls, new hair and morphology. Original presets remain. These are editable integrated benchmark candidates, not independently hand-authored production model sheets. Browser QA harness now captures both orientations, scene frames and SVG preview; final artistic approval and target-device checks remain outstanding.
