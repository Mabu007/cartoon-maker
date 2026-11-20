# Toonroom — Implementation Part 7: Expressive parametric character rigs

## Architecture

Characters stay **deterministic, re-editable 2D vector performers**. The single canonical scene evaluator supplies camera/actor view, emotion, action, gaze, and Part 6 audio-derived viseme state. The mouth is parametrically generated every frame instead of switching among raster mouths or static sprite images.

### Mouth rig

The pure module `src/engine/mouthRig.ts` exposes `mouthParameters(character,mood)` and `mouthGeometry(character,mood,view)`.

| Control | Function |
| --- | --- |
| `jawOpening` | Vertical separation / speech vowel jaw opening |
| `mouthWidth` | Mouth horizontal span (customizable per character) |
| `lipRounding` | Rounding and pucker |
| `lipClosure` | Consonant closures B/M/P, and rest/silence |
| `upperLip` / `lowerLip` | Upper and lower lip path control |
| `teethVisibility` | Visible tooth-row height and occlusion |
| `tongueVisibility` | Tongue projection inside the cavity |
| `asymmetry` | Expressive asymmetric corner positions |

- `SvgMouthRig.tsx` draws **actual SVG `<path>` geometry**, using `<clipPath>` to constrain all individual `<rect data-tooth>` teeth and tongue ellipse **inside the mouth**. Each tooth has a stable `id` and index; custom colors (`toothColors`), `goldTeeth`, and `missingTeeth` work without regenerating a character image.
- `mouthArt.ts` draws the same cavity and lip control points in Pixi Graphics. Since Pixi Graphics SVG parsing does not support SVG `<clipPath>`, a **real Graphics stencil mask** on a child Container masks every tooth and the tongue instead. Each tooth is a separate Graphics child. Layers are cached per face, not reallocated each frame.
- Back and back-quarter rendering explicitly hide the cached mouth Container after a turn. Side profile projects the rig without shearing teeth geometry.
- The Character Editor now exposes `mouthRig.width`, `jawScale`, `roundness`, and `asymmetry` sliders; tapping gold teeth works as before and **right-click** marks a tooth missing. All customization is serialized in the project character definition.

### Audio-timed viseme blending

Part 6 `sampleTimedViseme` now provides optional previous shape and a 36ms smoothly eased onset blend. The model interpolates **real parameters** (not images); the incoming closed-mouth and silence shapes remain full closure immediately. Sampled visemes are functions of source-audio timestamps and can be recomputed at arbitrary preview or export frames without storing mutable animation state.

### Eyes and performance

`facialPerformance.ts` implements individual blinking rhythms, nervous double-blinks, microsaccades and explicit target-priority gaze. The evaluator tracks when a character is listening to another speaker, supplies camera/actor/prop look-at vectors, and adds a subtle time-based head acknowledgement; intent can be inspected using **Eye focus** in the Character Editor.

The new `nervous` expression animates widened eyes, asymmetric brows and subtle mouth asymmetry while leaving the audio-derived viseme timing intact. Existing `happy`, `excited`, `angry`, `surprised`, `confused`, `sleepy`, `sad`, `thinking` and `smug` continue to act through eyes/brows and mouth geometry.

### Hands and body

`handPerformance.ts` chooses acting poses per gesture and speaking beat: separated-finger open palm, extended index, fist, idle hands, wave, conversational gesturing and uninterrupted prop grip. Existing illustrated procedural hands attach to their animated inverse-kinematics wrists.

`travelProgress` / `travelSpeed` provide short acceleration/deceleration ramps. Gait speed is measured from the *actual sampled path* (including keyed paths) and leg IK blends into grounded resting feet. The performer eases into and out of walking/running without instant leg or torso snaps. A short turn-head squash near multi-view switch boundaries visually softens sudden drawing changes.

### Audition and quality assurance

The Character Editor now has **Mouth rig audition** options (`rest`, `closed`, `bite`, `wide`, `open`, `round`, `pucker`, `tongue`). Combine with five **Character view** choices (front, ¾ front, side, ¾ back, back), **Preview action**, **Expression**, eye focus and jaw/lip sliders.

Automated `tests/characterPerformance.test.ts` includes **17 regression cases**:
1. Every viseme/visible view produces finite SVG geometry.
2. B/M/P and rest remain fully closed despite expression and audio energy.
3. Pucker, open, wide, bite, round, tongue expose distinct control values.
4. Missing, gold and individually colored teeth persist through schema parsing.
5. Mouth mask and cavity data remain valid across morphs.
6. Side profile projection maintains tooth ordering.
7. Eased vowel transitions remain deterministic and full consonant closures.
8. Parameter blending clamps and is repeatable.
9. Character mouth customization persists.
10. Speaking emotions preserve timing while changing expression.
11. Gaze/brow/blinking act independently and target eye focus.
12. Listener attention follows the speaker.
13. Distinct hand/gesture/prop poses.
14. Monotonic physical travel with zero speed at both endpoints.
15. Walker/run stance and eased gait transitions.
16. Identical preview/export sampled actors produce identical rig geometry.
17. Turning-head silhouette recovery between 2D views.

Earlier tests `tests/engine.test.ts` and `tests/timelineCode.test.ts` were corrected: **silent Talk action must not flap lips**, and Rhubarb D represents an open jaw instead of the old erroneous "wide" mapping.

Recommended verification:

```bash
npm ci
npm run build
```

With a browser preview running, inspect all eight mouth shapes and five character views in the editor; deliberately create gold/missing teeth, verify jaw/lip sliders and voice rest gaps, audition waving/pointing/open palm/fist/prop grip, watch walk/run stop/restart and turn, and compare frame-by-frame preview with exported video at the same source-audio timestamps.

### Verification and release gate

This implementation was committed on the existing feature branch with draft PR #6. Browser Computer Use is **not available in this chat session**. Vercel's Hobby deployment quota prevents a fresh preview for the current commit, while the GitHub verify workflow still reports failure without usable job logs. A Vercel build of the first Part 7 change ran tests but reported two older incompatible assertions; those were corrected, though **the latest branch was not subsequently built**. Consequently pixel-perfect SVG/Pixi mask parity, every actual browser pose, smoothness under device load, the native Part 6 Rhubarb worker, and exported video quality **remain unverified** until the build and interactive QA gates pass. Keep PR draft and do not merge on these claims alone.

Stop after Part 7; do not start the following part.
