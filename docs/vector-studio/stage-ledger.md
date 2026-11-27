# Vector Character Studio stage ledger

## Stage 0. Anatomy recovery and production baseline

| Revision | Evidence |
| --- | --- |
| Production baseline at start | `d7783fa7236c3f6f86661efb890ee4304a4b7605`. GitHub `main` and the public Vercel production alias pointed to this commit. The public landing page returned HTTP 200. |
| Recovered work | `83a8f3c0497d2f9811687ca47b1c09789db0c7ac`. Git refs for [draft PR #43](https://github.com/Mabu007/cartoon-maker/pull/43) and its feature branch matched. The merge base was `d7783fa`, with 0 commits exclusive to main and 1 exclusive to the feature. The anatomy work had not merged. |
| Serialization fix | `cbf615e809183a761c77cddaff4e7566913dd952`. Legacy project and character fields stay absent through backup and restore. The explicit anatomy opt-in survives profile edits and can be cleared in the editor. |
| Candidate code under test | `1f8dd6679a94f6b1b13687bad8202749bef4332e`, tree `c31ab4eecab348856ce09f6539e19537b90bb4ab`. The code sits on the inspected main ancestry. Documentation and QA images follow in the evidence commit. |

### Failure diagnosis

- Original hosted [GitHub Actions run 463](https://github.com/Mabu007/cartoon-maker/actions/runs/46030880924) recorded a failed `verify` job. The [check annotation](https://api.github.com/repos/Mabu007/cartoon-maker/check-runs/140614049055/annotations) identified an account billing lock. GitHub returned empty job steps, no artifacts and a missing log blob. The original [Vercel preview build log](https://vercel.com/mabu007s-projects/cartoon-maker/ExBndbuuT4PNzYyVT8cNhNA9pUtq) was available and showed 441 passes and one failure in `visualAssetStorage.test.ts`. The same test failed locally with `npm run build` and on Node 22 with `npm test`. The legacy profile constructor inserted an own `limbArt: undefined` property, which JSON omitted. Restoring the backup therefore changed the character object's shape. The fix only sets the property when the project opts in. The unchanged backup regression test now passes.
- [GitHub Actions job 140630049236](https://github.com/Mabu007/cartoon-maker/actions/runs/46035590311/job/140630049236) for the serialization fix has a [check annotation](https://api.github.com/repos/Mabu007/cartoon-maker/check-runs/140630049236/annotations) that says the account billing lock prevented the job from starting. The [Vercel preview for that SHA](https://vercel.com/mabu007s-projects/cartoon-maker/7MxsyGWgqZC2taqD5jhUhDHckseA) independently completed with all 442 tests passing.
- Studio Sbu's boots sometimes grew across the Pixi character preview and covered the scene. The behavior also affects the existing wardrobe transform code on main. A non-identity graphics context transform recursively mutated nested path instructions shared with the SVG path cache. The render helper now applies local transforms to independent instructions before queuing the path. A regression test exercises both toe directions and the actual Studio Sbu foot-size transform across repeated draws. Its first repeat failed on the original code and it passes on the candidate.

### Local verification

| Check | Observed result |
| --- | --- |
| npm from the repository lockfile | `npm ci` installed successfully. The workflow uses Node 22 and npm. The candidate build used Node 22.23.5 with npm 11.19.1 in Debian 13. |
| Full tests, TypeScript and production bundle | `npm run build` passed all 443 tests and ran `tsc --noEmit` and Vite successfully. Vite reported dependency annotation and chunk-size warnings. |
| Offline bundle | `npm run verify:offline` verified manifest `750fadc72b340df07c72`, 59 files and 3.42 MiB, including lazy chunks, DSP worker and video exporters. |
| Legacy storage | Existing portable backup, restoration and device project tests passed. The browser smoke used a new browser profile and a fixture through the public app import. |
| Linux Chromium visual, offline and performance evidence | [Browser evidence](../visual-assets/qa/anatomy-baseline/README.md). |
| Offline video export | Rendered and downloaded a three-second 720p WebM from the built app while offline. FFprobe confirmed 30 fps video and an audio stream. |

### Release gate

Stage 0 is blocked on a successful GitHub Actions run for the candidate. The hosted runner rejected the previous candidate before launching its job. Keep PR #43 in draft until the hosted checks can run and pass. Production is still verified at the starting baseline. A live webcam, the target N4020/UHD 600 laptop and target-device memory behavior are unverified.

See [architecture decisions](architecture-decisions.md) for inventory and [the staged roadmap](roadmap.md) for next-stage contracts.

## Stage 1. Vector artwork contract (partial draft)

Development branch is stacked on Stage 0 candidate f9d1c9e; main remains d7783fa. PR #43 remains draft. Hosted verify job 140634616211 failed without steps and log retrieval returned BlobNotFound. This does not establish a new release baseline. This environment cannot clone GitHub (DNS unavailable) or run the dependency-backed application suite. The commit containing this entry adds an optional native component contract, validation/cache, bounded deformation demo, shared preview/Pixi adapters and fixture tests. Tests are authored, not executed. No live actor/UI integration, actual project reopen, full CI, browser parity or hardware measurements are claimed. See [contract draft](vector-artwork-v1.md) for limitations and follow-up contracts. Stage 1 gate remains open; no merge or deployment.

## Stage 2. Professional character benchmark — prerequisite blocked

Audit on 2026-11-27: main is d7783fa; Stage 0 PR #43 remains draft at f9d1c9e; Stage 1 PR #44 remains draft at 0c6c7c6. GitHub returned zero Actions runs for the Stage 1 branch. The only reported commit check was successful Vercel Preview Comments, not evidence of application tests or a production release. The workflow only targets main for pull requests, so the stacked PR has no hosted verification. Stage 1 adapters are not wired into the live character editor/actor path and real project persistence and browser/device checks remain open. Stage 2 cannot satisfy its acceptance gate on that foundation.

Added [professional character benchmark preproduction brief](professional-character-benchmark.md) with proposed original art direction, style guide, turnaround/landmark rules and a concrete visual evidence matrix. The original artistic reference image was unavailable; its prior descriptive art direction was recovered. No new character artwork, renderer code, model sheets, tests or benchmark measurements were produced or claimed in this docs-only change. Existing preset and project code is unchanged. Stage 2 implementation is blocked; no merge/deployment or subsequent stage.

### Stage 1 integration candidate (unverified)

Added explicit native bone selection to the existing solved-joint actor renderer and native SVG fallback, per-renderer bounded compiled CPU GraphicsPath cache, character editor forearm opt-in/recolour/authored deformation/removal, compatible profile retention, raster conflict handling and device/backup regression tests. No default preset changes. Only normalized mirror-safe bone geometry is rendered; fixed slots and unsupported compound/mask/clip paths fall back. Authored displacement is saved as an artistic parameter, not physics state. The native fallback is still an approximate rig; full pixel parity and persistent GPU tessellation remain unverified. Local git ls-remote failed DNS; Node 22 and Chromium exist but repository dependencies cannot be installed here. No application tests, browser or offline results are claimed. Keep both PRs in draft; do not advance Stage 2.

Hosted Vercel build for 7c4d5a3 failed during npm test: Node strip-only mode rejected constructor parameter properties in the vector cache. Replaced both parameter properties with ordinary fields; no test command changes. A fresh preview must pass before claiming verification.

### Stage 1 hosted verification update

Vercel preview for a41aef8 is READY (deployment CmgFVz9jBmyPcrTEgGGXrgMwFC7B); 452 tests and TypeScript/build passed. No browser/device/offline claim. Stage 0 hosted GitHub Actions release gate and Stage 2 character benchmark remain outstanding.

## Stage 3. Identity and morphology — isolated development candidate

Owner requested staged development through Stage 5 before cleanup. Branch feat/character-identity-morphology-v1 is stacked on Stage 1 a41aef8, not main; Stage 2 remains preproduction only. Added optional identity seed and randomization locks, strict character import/export/duplicate, identity editor, three starting profiles, abdomen and anatomical contour controls, bounded morphology cache, existing rig landmark tests. No new flagship art, solver or default migration. Source changes and authored tests only at commit time; local clone failed DNS. Actual hosted build, browser QA, before/after screenshots, offline and device benchmarks remain open. See [identity contract](character-identity-v1.md). Stage 3 acceptance not met; do not merge or deploy to production.

Added a seeded randomization independence regression and a real device/portable backup code-path test. Hosted results remain to be recorded.

### Stage 3 hosted update

Vercel status for f3f12b5 was success (n47cEdsyb4xq5qywjFLczS7SgxVg); build log includes Vite built and Build Completed. Exact test count not retrieved in this audit. No GitHub Actions workflow for stacked commit, browser/offline/device evidence remains open.

## Stage 4. Face identity and morphology follow-up — development candidate

Branch feat/face-identity-v1 stacked on Stage 3 f3f12b5. Optional face identity controls, shared skull/eye/feature descriptors, identity lip paths, cosmetic details, independent finger length for noncontact poses, torso softness/muscle and shared illustrated torso contour, explicit facing native bone variants. Added regression tests and [face identity contract](face-identity-v1.md). Existing rig, timing and capture precedence unchanged by design, not yet verified by hosted candidate checks. Full native parity, custom fixed/raster morphology, Stage 2 authored art, browser recorded-line/visual evidence, offline export and device benchmarks remain open. No merge or production deployment.

Added neutral defaults for new sliders (legacy identity remains optional), jaw contour corner shaping, and facial control round-trip assertions on the existing device and portable movie code paths. No hosted pass claimed for this revision.

### Stage 4 hosted update

Vercel preview for 2fb2f4b is READY (9wQFgy1XX9hAJf59hB1FCPXDcHPi); log shows Vite built and Build Completed. GitHub Actions has no run for the stacked commit. No actual browser or offline QA claimed.

## Stage 5. Layered hair — isolated development candidate

Branch feat/layered-hair-v1 stacked on Stage 4 2fb2f4b. Added optional versioned hair design, ten drawable curated style candidates plus bald, canonical vector cap/lock layers, deterministic head-fit metadata, sparse pinned rest groups and material controls, renderer and native SVG integration, explicit rest/deformation audition, bounded model/rest caches and new tests. See [hair contract](layered-hair-v1.md). Legacy existing styles unchanged until opt-in; new names auto-select layered geometry. No actual simulation, authored flagship art, torso-occlusion split, browser screenshots, offline/export, hardware performance or visual acceptance claimed. Hosted candidate checks pending. Do not merge/deploy; stop at Stage 5.

### Stage 5 hosted evidence (source commit 648d18eb012705f616aba916878b64f4cb6d0247)

Vercel deployment 7vFyHjbmLM6MuR4CTr75Bq7wDVcg: 462 tests passed, 0 failed, 0 skipped; Node test duration 38.225 seconds. Hair extreme/view, legacy, and cache tests explicitly passed. TypeScript passed (Vite subsequently started). Deployment state at ledger update: BUILDING. GitHub Actions returned zero runs for the stacked candidate. Local git ls-remote still fails DNS resolution and npm registry host lookup fails; Chromium is installed but no runnable local app is available. No browser screenshots, browser/offline playback/export or N4020 frame/memory measurements were obtained. This docs-only ledger update records the tested source commit, not a new validation run. Stage 5 acceptance and earlier release gates remain open; stop before Stage 6.

## Consolidation — release/vector-studio-stages-0-5

Stage 5 source build 648d18e reached READY, and the docs-only head 69ce37a has successful Vercel status. Main d7783fa was strictly ancestral (18 commits ahead, zero behind). Consolidated branch carries all staged changes, explicit Vector Studio upgrade presets (not final professional authored art), a rear hair layer behind body artwork, SVG solved rig alignment and strict visual editor validation. Added mandatory offline bundle verification to build, pinned Chromium QA tooling and a reproducible before/after screenshot + software draw timing + offline shell harness. Browser evidence not executed at authoring; actual saved project offline playback/export, full native parity, custom artwork deformation, professional asset review and target hardware remain release gates. Do not bypass failing checks or promote unverified code.

Consolidation follow-up: added validated imported native vector fitMorphology, oriented rig-space fixed slot rendering and pivot alignment, orientation-aware editor import/export, real browser fixture harness for native SVG and production-built offline restore/reopen/export. The initial consolidated source 1fd334f reached Vercel READY and static offline verification reported 59 files / 3.46 MiB; these results precede native fixed-slot follow-up. GitHub Actions run 46042775790 failed before any job steps (job log unavailable); no claim of browser success. Separate hosted Chromium run may be attempted on the exact new revision; do not infer hardware performance or visual acceptance from generated screenshots alone.

## Stage 6. Garment construction — isolated development candidate

Owner requested continuing each stage separately then consolidating. Branch feat/garment-construction-v1 stacked on consolidated 163aa3d (Vercel READY, static offline bundle 59 files / 3.46 MiB; explicit QA_RESULTS absent from hosted logs, so no browser pass claimed; GitHub Actions 46043213200 failed). Added independent opt-in design schema, template and fit controls, Pixi/SVG garment panels, actual solved-joint sleeves/trousers, pose folds, material and pin/free-region/proxy metadata, strict editor import/export and persistence tests. See [garment contract](garment-construction-v1.md). Browser/visual verification, offline playback/export and target hardware timings remain open. Prior stages' acceptance remains blocked; no production merge. Stop before Stage 7.

## Stage 7 — primary deformation (isolated candidate)

Stacked on Stage 6 aeeaafd, Vercel READY; offline bundle 5fc11095b3971e8f6bd9 verified 59 files / 3.47 MiB, no Actions run. Extracted existing endpoint authority into shared resolvedArtworkPose, exposed optional detached snapshot callback, opt-in weighted anatomy contour morphs and pose-class replacements, corrected rear hair lift, added seated knee-supported skirts, generic wrap garments and bounded uploaded chest logos. See [Stage 7 contract](primary-deformation-v1.md). Automated and hosted results pending at authoring; no live browser/webcam/device certification. Main unchanged. Continue to Stage 8 only by owner's next instruction; retain all unverified gates for cumulative consolidation.

Stage 6 hosted evidence: Vercel 9ZZAmXUoQ7tpMi7uAHHcZV981bsr READY, source aeeaafdef24dc1de91ac6a81cd748ae577c0318b, 468 tests passed, 0 failed; TypeScript and build completed, static offline bundle 59 files / 3.47 MiB. Stage 7 intermediate commits efa8a97 and 0186e59 each passed 468 tests but failed TypeScript TS18048 (optional pose captured by nested deformation function); fixed by extracting narrowed inside scalar. No test or gate disabled. Stage 7 browser harness now additionally asserts actual rendered wrist alignment in resolved pose snapshots. New revision requires full re-run.

### Stage 7 hosted evidence (exact application source 189ad4270a23d7ec226454d0fda018333fc0a3ee)

Vercel FkFpHoJUHxVTfrTSkVPp19ur4gJE: 474 tests passed, 0 failed, 0 skipped, 38.500 seconds. TypeScript passed (Vite started). Deployment state when recorded: BUILDING. Production bundle and static offline manifest not yet confirmed for this exact source. GitHub Actions has not run for stacked candidate. Local dependency DNS unavailable; no current Chromium/visual, offline runtime/export, real camera or N4020 benchmarks. No production release. This ledger-only commit records earlier source evidence; do not mistake it for a fresh validation run.

Stage 7 application source 189ad427 Vercel READY; production build and static offline verification completed (59 files / 3.48 MiB). Main remains unchanged.

## Stage 8 — isolated LVE simulation

Branch feat/lve-simulation-v1, stacked on Stage 7. Validated materials/forces/definitions/config/checkpoint; deterministic fixed-tick springs, constrained chains and strips, capsule collision, budget fallback, seek/replay and canonical deformation adapter. Added fixtures, tests, standalone Node benchmark and [simulation contract](lve-simulation-v1.md). No integration switch. Hosted validation pending; browser/device evidence outstanding. Owner also requested independent special VVLE stage; track separately, not as Stage 9 physics integration.

## Special stage — VVLE lighting foundation

Branch feat/volumetric-vector-lighting-v1 stacked on Stage 8 9024696. Opt-in analytic pseudo-normal lighting, surface/material gradients in Pixi, existing drag/key lights, typed light kinds and five cinematic setups, approximate AO/cast shadow/depth haze/backdrop parallax. See [VVLE contract](volumetric-vector-lighting-v1.md). Browser visual comparisons authored, not run. No Stage 9 asset dynamics integration. Do not claim final cinematic quality, normal maps, true occlusion or DOF; cumulative acceptance matrix retains gaps. Hosted checks pending.

### Stage 8 and VVLE exact hosted evidence

Stage 8 source 90246963eda5ad97e26734f639caf6afd9780a7b, Vercel EufdSpbHzEgBgqvhiWssVbsDdHoo READY: 478 tests passed, zero failed, TypeScript and production build completed, static offline bundle 087a4df4374f62a708dc (59 files, 3.48 MiB). No runtime integration switch. VVLE source 518815d016e402eb78e9557af6b9d7e134bc8e9d, Vercel 3NzX4Dwd4d18hCxiNBg8FSuqR5ZN READY: 481 tests passed, zero failed, TypeScript and production build completed, static offline bundle 4c1c3255ca0e42cf6c68 (59 files, 3.49 MiB). GitHub Actions returned zero runs on stacked candidate. QA-only branch qa/vvle-stage-8-visual source f9ec301fcc9018ea4ec8e72d3d4d961313cfd311, deployment 2rqWVFuHSUvWfiNEGukHvEMENC5R queued at recording, explicitly runs original full build then CPU LVE benchmark and focused Chromium visual comparisons; QA build change does not enter production. No browser captures, CPU benchmark result, real offline movie export or target hardware measurement confirmed yet. Local Chromium installed but DNS lookup for GitHub/npm unavailable and no app dependencies mounted. Do not infer QA results from preview READY. Main remains d7783fa. This follow-up adds only documentation and standalone QA command, not runtime code. No Stage 9 integration started.

## Stage 9 — character dynamics integration candidate

Branch feat/lve-character-dynamics-v1 stacked on VVLE bc314b0. Opt-in scene and character settings, per-component enable/strength/material, deterministic scene-clock adapter, sparse hair and accessory groups, weighted garment/limb/cheek surfaces. Existing motion/prop custody remains authoritative; no full body/cloth solver. Added scripted gust, tests and [Stage 9 contract](character-dynamics-v1.md). Prior VVLE QA did produce portrait screenshot but failed with screenshot timeout, not full acceptance. Stage 9 hosted validation pending at authoring; no release. Stop after Stage 9.

Stage 9 intermediate 1733df6: hosted tests 481 passed; TypeScript rejected invalid earring enum 'hoop' and overly broad tick-rate type. Corrected against existing 'large-hoop'/'charm' variants and literal 30|60 Hz type. No validation bypass.

### Stage 9 validation evidence

- Runtime source f825804d3b985efda8123dfb0f9c377fd62b5033: Vercel H1JnCSxBKtYieFcvBEqBB3iPhmWt READY; 484 tests passed, TypeScript/build passed, static offline bundle 0ce057de9f340dc26d27 (59 files / 3.51 MiB).
- Audition source 3ff7e0fd510b6b06d2f7ac60c8431f081efdcd9e: 485 tests passed, 0 failed, 42.956 seconds. TypeScript passed (Vite started). Vercel 6Dz7WCXReH4jGtm4e5esQGLbN2qQ state at recording: READY. Build Completed in /vercel/output [1m] Verified offline bundle 0ce057de9f340dc26d27: 59 files, 3.51 MiB. Includes DSP worker, video exporters, local assets and lazy libraries.
- CPU scene evaluation + solver, 90 samples at 30 Hz: two actors p50 0.382 ms / p95 0.736 ms, 28 nodes, 15 constraints; three actors p50 0.503 ms / p95 0.958 ms, 52 nodes, 29 constraints. Two iterations, no budget fallback, no recorded collision events in this particular fixture. This does not establish GPU, collision-heavy, export or N4020 performance.
- Dedicated QA-only source ffe301594d5542602457babc6983c3f7798338b2 (4EqPbcTRfXo8wJyerJhfup7kkPjD) executes full build then actual Chromium renderer audition. Browser result pending at recording. No offline runtime/export certification, no live webcam or device benchmark. GitHub Actions no runs for stacked candidate. Main remains unchanged; no release authorization based on these results.

Stage 9 browser evidence: QA source ffe3015, Vercel 4EqPbcTRfXo8wJyerJhfup7kkPjD READY, Chromium 133.0.6943.0, two/three actor fixtures each changed pixels with physics, disabled output and seek output pixel-identical, no page errors. Render-call p50/p95 (ms) 2 actors off 12.4/48.5 on 22.4/61; 3 actors off 16.9/86.4 on 27.3/75.7. Software rendering and variable latency, not N4020 certification. Actual movement/settling/clipping review and offline audio export remain open.

## Stage 10 — coordinated procedural acting

Isolated opt-in candidate stacked on Stage 9 6dce2e3, branch feat/procedural-acting-v1. Existing legacy personality behavior preserved unless selected. Seeded actor-local scheduled idle/listening/speech state envelopes, tunable breath/blink/head/posture/response and walking style, reuse existing semantic gestures, strict authored/captured/prop ownership. Two-actor same-dialogue audition and unit fixtures. See [Stage 10 contract](coherent-acting-v1.md). Hosted and recordings evidence pending. No production promotion.

### Stage 10 exact hosted evidence

Source d3857727d525467efcd362d7a21416f46bd6fbee, Vercel 8W8zZDZwoHgxZCLFezmUtUruhsFP state READY at recording. 489 tests passed, zero failed/skipped (41.465s); TypeScript and Vite passed, verified static offline bundle 55bcdcb1560dcdb939c2 (59 files / 3.52 MiB). New tests assert distinct pose profiles, unchanged visemes, deterministic arbitrary seek, actor-local phase, authored/captured/face/gaze claims and bounded idle. Two-actor relaxed audition scene evaluation CPU (300 frames) p50 0.042424 ms / p95 0.088841 ms; not incremental overhead, excludes rendering/physics and not a target-device benchmark. QA-only branch qa/coherent-acting-stage-10 e2c580a70e46fcc3c9505c52ffa1f8090f85243a, deployment 9VTRuHcjgp1Mnevr7qDdDYSzHcA3, state BUILDING. Script records four short silent WebM visual comparisons, actual render timings and pixel seek equality; no verified recordings or visual acceptance yet. No GitHub Actions run for stacked candidate. Prior Stage 9 QA evidence recorded above. Local dependency/network restrictions remain; live camera, real offline reopen/playback/audio export and N4020 remain open. Main unchanged. Ledger-only follow-up records exact tested source; not a new validation run.

Stage 10 browser evidence: QA-only source e2c580a70e46fcc3c9505c52ffa1f8090f85243a / Vercel 9VTRuHcjgp1Mnevr7qDdDYSzHcA3 completed Chromium 133.0.6943.0 with four silent WebM captures (off 60964 bytes, confident 163377, nervous 163990, relaxed 163565), distinct rendered pixels, seek equality for every profile, no page errors. p50/p95 render-call ms: off 7.7/16.8, confident 6.9/19.2, nervous 8.5/17.4, relaxed 7.9/15.7; 36 samples each. Not artistic approval, audio export or device certification.

## Stage 11 — practical character workspace

Stacked on Stage 10 e7b2c1c. Responsive sixteen-category Character Factory, larger zoom/pan preview, explicit play/pause, bounded coalesced draft undo/redo/reset, existing identity import/export and duplicate/save, group-targeted seeded curated randomization, bounded vector glyph thumbnail cache, voice settings, temporary physics/wind and optional consent-gated Performance Studio audition. Uses immutable scene inputs and same Pixi runtime/evaluator for real playback; no webcam activation on open, no audition settings or recorded motion persisted in draft. SVG fallback static/approximate, no secondary physics. Tests for history, identity, five views, runtime and device storage/backup/placement. See [Stage 11 contract](character-workspace-v1.md). Hosted results pending; full browser workflow, screenshot review, N4020 and real offline audio export remain open. Main unchanged.

### Stage 11 hosted evidence

Exact source c42a0158a0b40c82afce9938507ad56c19c4ace9, Vercel DNGXRf2TYhqZbW6Bqd9JD6aQk2MQ READY: 493 tests passed, zero failed; TypeScript and production build passed; static offline bundle 44c7fdd11632035f0b35 (59 files / 3.53 MiB). Forty evaluator samples across five views and eight actions: hosted p50 0.05174 ms / p95 2.55925 ms; excludes renderer and physics integration costs, not editor responsiveness or target-device timing. New tests include draft history, seeded targeted locks, valid outfit choices, scene audition and IndexedDB/local mock backup and placement. Final nested-control undo refinement 731a2e19b10c879942ef700d194d2c78ba5451e8, deployment HBVDJsn2qHHWxmmQ1AoMKdFBsyhC state BUILDING at recording, observed checks []. It separates distinct garment control changes and adds a regression assertion; do not transfer previous revision's pass to unverified source. QA-only branch qa/character-workspace-stage-11-refined source 064edc3f95dc40e2943a001041bfe2cdd53b05b0, Vercel F9nBHR2aHCSsBNmHiJvaWhMUxNGu state QUEUED, observed checks []. This exercises actual creation, save, placement, offline reopen, screenshots, undo, zoom/pan, temporary webcam consent and category response timing. No successful end-to-end browser result or actual screenshots confirmed at this point. GitHub Actions returned no workflow runs for the stacked candidate. Main remains d7783fa7236c3f6f86661efb890ee4304a4b7605. No production merge or promotion. Full artistic UI review, complete dirty-component geometry, actual webcam, N4020 and real offline video/audio export remain open. Stop after Stage 11.

## Stage 12 — native vector package pipeline

Stacked on Stage 11 7edaab8. Native v2 plain JSON envelope, bounded preflight/schema/graph validation, exact revision dependencies, strict category/coverage/render support, atomic reusable IndexedDB library, quarantine and palette/pivot calibration, explicit compatible apply, canonical project embedding, original hair/clothing/accessory examples and sparse imported LVE groups. Existing raster v1 remains. ZIP/SVG native inputs rejected without extraction, legacy SVG filter/stylesheets rejected. Tests and contract added; hosted, visual/offline browser and target hardware gates pending. See [Stage 12 contract](native-vector-packages-v1.md). Main untouched.

### Stage 12 hosted evidence

Core source c278b0342aa57c6fff697ba802d3105660605e4f / Vercel uie3BGiH9TooMCqGtVxDhwctv9Q7 READY: 493 inherited tests, TypeScript and build pass, static offline 559c95298df1460977e3 (59 files / 3.53 MiB). Full candidate 4d87c77 failed 1 of 496 tests because absent raster components were explicitly undefined in memory but omitted by portable JSON; security and atomic transaction tests passed. Fixed canonical construction, no test weakened. Corrected source 9413cff5302d2872ca8d48df72f63275f8d0e060, deployment AstDeYYKuXJQ62nAJn2eTBv6sBg5: 496 tests passed, zero failed/skipped (40.645s). Hosted three-example parse/calibration/export/apply CPU samples 41.368, 8.412, 6.849 ms; not renderer or N4020 timings. Build state BUILDING at recording, observed checks ["Verified offline bundle 3c240ed1d7632737c412: 59 files, 3.54 MiB. Includes DSP worker, video exporters, local assets and lazy libraries.","ℹ fail 0","ℹ pass 496","ℹ tests 496"]. QA-only branch qa/native-vector-stage-12-refined source 57a8f8476eee6829b5048d5b092f0b6c9cac570a / 2PRStdBWt5hg6rfXinpuAuTrLb6y state QUEUED; actual Chromium quarantine, render/seek, IndexedDB reopening and offline access not confirmed. Stage 11 refined browser QA F9nBHR2aHCSsBNmHiJvaWhMUxNGu ERROR: browserContext.newPage target closed unexpectedly; 493 tests and static build passed, no complete UI evidence. Main unchanged d7783fa7236c3f6f86661efb890ee4304a4b7605; no GitHub Actions run for stacked Stage 12 candidate. Open gates: real browser native import and visual/physics proof, full offline service-worker reopen/export, actual target hardware, all-view authored examples, VVLE material parity. ZIP support deliberately excluded. Stop after Stage 12. Ledger-only follow-up not a new validation run.

Stage 12 browser evidence: corrected QA source 57a8f8476eee6829b5048d5b092f0b6c9cac570a / Vercel 2PRStdBWt5hg6rfXinpuAuTrLb6y, Chromium 133.0.6943.0: 496 tests pass, static offline 59 files/3.54 MiB; real quarantine, recolor, six imported parts, physics changed rendered pixels, seek pixels identical, offline IndexedDB access after reload, no page errors. Render-call p50 4.8 ms / p95 12 ms, 24 nodes/14 constraints/2 iterations, no fallback. This is hosted software rendering, not full offline service-worker reopen, artwork approval or target device certification. Application source 9413cff READY.

## Stage 13 — optional external AI specification

Stacked on Stage 12 fb22a5d. Runtime-derived JSON Schema, shared validator limits and actual rig anchors, task/profile/view/material selector, supported/partial/unsupported category contracts, copy/download, authored starter export, paste JSON quarantine with repair hints. No external inference or network dependency. Authored fixture workflow only; no externally generated proof. See [Stage 13 contract](ai-vector-specification-v1.md). Hosted and browser evidence pending; no production promotion.
