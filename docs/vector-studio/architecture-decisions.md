# Vector Character Studio architecture decisions

## 001. Add optional limb art at the renderer boundary

**Status** Accepted for the Stage 0 candidate. Release validation is tracked in the [stage ledger](stage-ledger.md).

The Stage 0 candidate restores PR #43's authored upper-arm, forearm, thigh and calf contours. Each region has a silhouette, inset shade and highlight in bone-local coordinates. The solved endpoints supply translation, rotation and length, and the character supplies width. The Pixi stage paints the contours using its existing bounded path cache. Character Studio's SVG fallback reads the same contour definitions and uses its own preview rig. Classic and original illustrated characters use the existing renderer for their style. Studio Sbu and Studio Zee presets select `anatomical-v1`.

The optional literal on `CharacterVisual` stays at schema version 1. Legacy characters omit the field. A profile change preserves an explicit choice, and opting out removes the field. Project, backup and asset package versions stay stable. Neither the raster slot definitions nor the project migration change for this recovery.

The body rig, MoCap compilation, dialogue and grip placement supply the same inputs to both art choices. The new curves are painted after pose resolution. A later art system can use the same boundary when it needs bone-local geometry.

## Interface inventory

| Area | Current interface and responsibility | Candidate extension point |
| --- | --- | --- |
| Stage, camera and export rendering | `src/engine/renderer.ts` exposes `createRenderer`, `draw`, `prepareImages`, `pick` and `destroy`. `src/ui/Stage.tsx` owns preview refresh, user interaction and viewport state. `draw` evaluates the scene, paints actors and world objects, and submits Pixi rendering. | Extend the actor-art inputs after scene evaluation. Keep picking and camera units consistent across preview and export. |
| Native art and fallback | `actorArt.ts` paints the solved character using `studioLimbArt.ts`, `wardrobeArt.ts` and `illustration.ts`. `anatomicalVectorArt.ts` supplies fixed reusable paths. `CharacterFactory.tsx` opens the Pixi preview and selects `NativeCharacterPreview.tsx` when it loses graphics support. | Reuse bone-local paths and existing view-specific order. Validate Pixi and SVG paths independently because wardrobe coverage, shading and timing differ. |
| Motion and resolved performance | `evaluate.ts` produces actor poses from timeline tracks. `animation.ts` supplies `rig` and action samples. `livePerformanceScene.ts`, `performanceCapture.ts` and the tracking services produce live observations. `resolvedPerformance.ts` exposes `compileResolvedPerformance` to turn observations into persisted performance keys that the timeline evaluates. | Read evaluated pose and carry existing motion precedence through any new art representation. Keep the compiled take and its editing contract stable. |
| Face and speech | `evaluate.ts` selects dialogue cues, including manual visemes, and supplies the resolved viseme to the actor. `facialAnimation.ts` and the mouth/face modules consume pose, expression and speech signals. `localLipSync.ts` and `dsp.worker.ts` handle local analysis. | Attach compatible facial art to existing head-local motion, manual key precedence and viseme timing. |
| Hands and props | `objectInteractionEngine.ts` resolves reach and hand custody. `propMotion.ts`, `handRig.ts` and `actorArt.ts` compute contact, grip and visible hand placement from solved joints. | Bind artwork pivots to the existing grip and layer order. Verify contact through turns, bends and release frames. |
| Assets and calibration | `visualAssets.ts` validates the character visual and compiled raster slots. `hybridArtwork.ts` resolves parts by slot/view and fits them between bone endpoints using `artworkGeometry.ts`. `visualRig.ts` supplies calibration anchors. `assetPreparation.ts` and `visualAssetStore.ts` handle preparation and the local library. | Add any new art representation at a validated data boundary and keep current raster slots readable. Validate units, coverage, memory cost and malformed data before rendering. |
| Project data and offline | `schema.ts` validates `ProjectDocument` and reads older projects. `deviceProjects.ts` owns IndexedDB saves and recovery. `localMedia.ts` uses OPFS for eligible blobs with an IndexedDB fallback. `projectExchange.ts` exports binary SIRVIBE2 backups and reads both formats. `offline.ts` and `scripts/pwa.mjs` handle service-worker readiness and build precaching. | Keep representations optional and self-contained in backup files. Exercise an older project save, a current backup round trip and reopen after network loss. |
| Video export | `services/export.ts` selects a frame encoder or MediaRecorder fallback. `frameExport.ts` and recorder paths share `createRenderer`, the scene clock, asset preparation and audio mixing. | Compare preview and export against the same frame times and appearance. Keep resource lifecycle and encoding behavior in the existing exporters. |

## Current limitations

- Stage 0 changes four contours only. The native torso, hand, head, wardrobe and gait systems supply the rest of the character.
- The five saved views are authored facing choices. A mirrored view reuses the same art and may have a different active hand order. The SVG preview and Pixi stage have separate construction and wardrobe logic.
- Imported components can replace native art per view. The current SVG fallback uses its existing simple line fallback for the missing half of a partly imported limb. Appearance parity between that fallback and the stage is outside this recovery.
- The screenshots use built-in characters and props. The benchmark estimates CPU and command-submission cost on a software renderer. Device GPU, live webcam, varied lighting and long recording performance require on-device checks.
