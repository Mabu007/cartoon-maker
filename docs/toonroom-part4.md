# Toonroom — Part 4: Cinematic camera and world coordinates

## One active camera, always
- `src/engine/cameraTimeline.ts` owns pure camera-cut operations. Camera segments are half-open intervals; insertion/replacement trims or splits covered shots while preserving unaffected segments. Non-camera tracks are independent.
- Strict `ProjectDocument` validation rejects camera overlaps on new edits and code imports. `parseStoredProject` migrates old overlapping projects by keeping later-authored shots over older shots and preserving uncovered regions. `compileScene` applies the same repair to previously manually overridden camera cues.
- The shot inspector shows cut/glide, performer focus and exact start/end/duration. Camera clips have clear visual styling; the existing trim/move controls and history store apply.

## Coordinates and layering
- Authored world is 960 × 540 regardless of shot or output aspect ratio.
- Pure `cameraViewport`, `worldToScreen` and `screenToWorld` form an invertible transform for 16:9, 9:16 and square framing at any valid zoom. The Pixi renderer uses this transform both to draw and to invert stage picks; resolution changes do not change world coordinates.
- Hit testing uses entity-local inverse rotation, mirroring and scale. Selected bounds include rotated corners. Explicit `depth` layers dominate Y-foot sorting while entities on one layer sort by foot Y.
- Held image props attach to the identical right-hand inverse-kinematics target used to draw the actor's grip; position follows pose, view and lift rather than magic pixel offsets. Prop world X/Y are never changed when switching camera angles.
- Stage pointer capture resets safely when canceled/lost.

## Duration and parity
- Timeline and inspector duration controls use the same `resizeSceneTimeline` helper to trim/remove past-end clips and markers, respecting track locks. Playback duration and frame selection remain derived from `project.scenes`.
- Preview and frame exporter already share `createRenderer.draw`, `evaluate` and camera transform, and exporter preloads images. Regression tests verify pure evaluator and time selection parity; **pixel-accurate browser preview/video parity still requires an actual browser/capture check**.

## Verification
`tests/cameraProduction.test.ts` covers overlap rejection, migration, camera inserts/moves/trims, focus/follow, aspect ratios, inverse transforms, rotated hit tests, held grips, depth and frame timing. Run `npm ci && npm run build` then browser-test camera editing, actor focus, prop placement in wide/close-up, transitions and video export.

**Outstanding:** Real browser Computer Use is not exposed to this chat session. GitHub Actions checks have failed almost immediately without usable logs since Part 1. Do not claim green tests, browser QA or video pixel parity without executing them.
