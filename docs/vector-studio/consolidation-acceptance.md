# Consolidated release acceptance through Stage 14

[Draft PR #59](https://github.com/Mabu007/cartoon-maker/pull/59) contains the cumulative release candidate. The [stage ledger](stage-ledger.md) records the source and environment for historical and consolidation evidence.

| Stage | Acceptance status | Evidence and open work |
| --- | --- | --- |
| 0 anatomy | Implemented, partially verified | Four Bézier limb regions render in Pixi with connected wrist snapshots. Verify all seated silhouettes and real-device timing. |
| 1 canonical vector | Implemented, partially verified | Strict contracts, cached paths and imported artwork regression coverage. Arbitrary mask, clip and compound parity and persistent GPU tessellation are incomplete. |
| 2 flagship art | Visually incomplete | Rendered Sbu and Zee have distinct silhouettes and five selectable views. Back and back-quarter silhouettes remain similar. Professional authored turnarounds, expression close-ups and model-sheet approval are open. |
| 3 morphology | Implemented, partially verified | DNA, profiles, limb scales, finger ratios and fitting persist. Whole-body blend surfaces, asymmetry and the artistic grip/ground review remain open. |
| 4 facial identity | Implemented, partially verified | Identity-specific geometry, lips and speech cues, with tests for bounded expressions and captured gaze. All-viseme close-up review across head poses and stylized facial parity remain open. |
| 5 hair | Implemented, partially verified | Curated cap and lock geometry renders, including a rear layer. More hairstyles and full per-view collision and hat/wardrobe polish remain open. |
| 6 garments | Implemented, partially verified | Templates, fit, folds, patterns and material choices remain in the same rig. Seated dress/coat drape, arbitrary masks, exact fallback parity and authored garment review remain open. |
| 7 primary contours | Implemented, partially verified | Resolved geometry uses bounded endpoint-preserving changes. Full torso and joint surface deformation, true foreshortening, and smoother transitions between pose shapes remain open. |
| 8 simulation | Implemented, verified in fixtures | Fixed-step replay, bounded budgets and checkpoint tests pass. Representative two- and three-actor browser and hardware budgets remain separate acceptance items. |
| VVLE | Implemented, partially verified | Lighting presets and moving lights render on selected character surfaces. World art uses coarse tint. Cast shadows, broader material parity and expensive moving-light cases remain open. |
| 9 character dynamics | Implemented, partially verified | Opt-in bounded artwork offsets and repeatable seek. Full per-view material collisions, cloth/body coupling and live capture review remain open. |
| 10 acting | Implemented, partially verified | Deterministic actor-local profiles and authority regression coverage. Prior Chromium auditions recorded four profiles. Natural-motion and camera-led performance review remain open. |
| 11 Character Factory | Implemented, partially verified | Character editing, audition, history, and bounded preview. The SVG fallback has approximate shading and motion. Real webcam remains open. |
| 12 native packages | Implemented, verified in fixtures | Validation, exact dependencies, atomic reuse and embedded backup geometry. All-view authored examples and material parity remain open. |
| 13 AI asset specification | Implemented, verified in fixtures | Current-schema prompts and authored fixture imports. External AI output has yet to be validated. |
| 14 living environments | Implemented, partially verified | Four rendered sets, native props, repeatable motion, offline reopen and portable world backup. World package dependencies and reusable world-library installation are incomplete. Contact surfaces still use existing anchors. |

## Release gates

- GitHub Actions is blocked by an account billing lock. The [workflow on PR #59](https://github.com/Mabu007/cartoon-maker/actions/runs/46061945751) reported the lock before any job step or runner assignment. Earlier main-target PRs #43 and #48 failed the same way. PRs targeting intermediate stack branches were outside the workflow's `pull_request.branches: [main]` filter.
- The built candidate passed the Chromium offline creator and export smoke, including local character creation, native asset installation, dialogue DSP, timeline playback, binary backup restoration and a video containing the imported dialogue. A same-origin update from the current main build preserved the saved project after offline reload. OS-level PWA installation remains open.
- Record a real webcam take on the target device and review recorded-dropout and thumb/finger behavior. Run the target-load frame time, memory and long-session tests on the N4020 laptop. Hosted SwiftShader measurements characterize the test environment.
- Keep professional character art acceptance open until all required views, motion and close-ups have visual approval.
