# Stage 15 integration checkpoint

Draft for [PR #60](https://github.com/Mabu007/cartoon-maker/pull/60). Release acceptance remains open. The base is `e73985843f6808170f13bcf59d88f2cc67f47977` and the original draft head was `78b1b53d2e49a6d6a650f56b0d4a3e7ccfbe8e83`. All nine detached stage packages were recovered and reviewed alongside the Definitive Endgame handbook and Character Studio reference.

| Stage | Application work in this checkpoint | Open acceptance |
| --- | --- | --- |
| 15A | Clean install and baseline builds. Fixed the duplicate ID in the browser fixture. The same-art comparison matched all 54 image hashes, audio hashes and pose snapshots between main and the original draft. Held props now use the painted wrist in the active frame. | Historical release and contact calculations still need their own parity matrix. |
| 15B | Catalog front and three-quarter head deformation uses stabilized capture yaw and preview yaw, pitch and roll. Nose, jaw, ears and eye placement use bounded corrections. Existing gaze, visemes, mouth masks and eye apertures remain authoritative. | Full facial art and the 720p closure threshold need visual acceptance. The old detached contour sweep still reproduces 176 failures in 816 poses. That artwork and evaluator were excluded from the app path. |
| 15C | One catalog head family has four named calibration handles, an immutable geometry fit cached independently of palette and project persistence. Edits use Studio undo and redo. | Full family compiler, artist-authored residuals, independently authored complete Sbu and Zee rigs and fitting-time evidence. |
| 15D | The Pixi adapter supports strictly nested or disjoint polygon rings with `nonzero` or `evenodd` fills. It reuses a single path for fill and stroke. Browser pixel samples cover holes and a nested island. | General curved compounds, asset masks and clips, persistent mesh buffers, context recovery and shot-fixed LOD. Existing guards still reject unsupported input. |
| 15E | Held props follow the same resolved wrist as the visible hand. Existing posed limbs, foot locks, hand rig, garments and asset fallbacks remain available. | The detached joint-band sweep still produces 288 inversions in 954 poses. Professional five-view body art, body joint deformations and wardrobe acceptance remain open. |
| 15F | Corrected cylindrical bone shading, introduced one bounded VVLE gradient atlas and assigned swatches in paint order to preserve seek pixels. LVE keeps camera-independent roots and reuses previous positions and constraint indices. | Full deformation-aware surface charts, target-device playback and memory limits. |
| 15G | Supported editable SVG paths go through native validation, quarantine and atomic installation. Single-facing imports retain usable art for the opposite facing. Native packages preserve artwork rights and provenance. | General separated raster rigging, external-authored full family recipes, masks, and broader art authoring fixtures. |
| 15H | Dark-plum layout, contextual tabs, preview scrub and loop, fullscreen, temporary lighting and head controls, and saved face calibration. Existing editor and project paths use the same renderer. | Full advanced deformation tools, family refitting, presets workflow and founder review of the complete design. |
| 15I | Graph-only audio and archived versions now survive backups. The verification command reuses the restore parser. Old backups can still open, and the verifier identifies missing graph assets. | Copy migration and rollback for every historical character type, approved replacements and retirement. Keep compatibility paths while these gates are open. |

## Runtime and source provenance

The catalog fit, corrections, polygon classification and VVLE atlas are SIRVIBE implementations. No upstream runtime, upstream artwork or new dependency was added. The recovered Stage 15A source register and earlier PR notes document the pinned upstream reviews. The import boundary accepts bounded path data and leaves the source drawing on disk. The render hierarchy uses the existing Pixi renderer, one pose evaluator, existing VVLE and the existing LVE simulation.

## Verification on the hosted Linux workspace

- `npm ci` completed from the checked-in lockfile. `npm run build` passed 512 tests, TypeScript, Vite, and offline manifest verification. The built app has 59 offline resources totaling 3.61 MiB with the optional webcam models excluded.
- Chromium 133 verified the live workspace at 1366×768, 1920×1080, and 390×844. It demonstrated head movement and lighting changing the canvas, landmark undo and redo, garment persistence after offline reopening, and consent-gated webcam startup. Real webcam capture and OS-level PWA installation remain open.
- The native asset browser harness installed editable SVG, sampled the expected hole and island pixels under both fill rules, and reopened the installed library offline. The backup regressions verified graph-only source audio in both current and historical readers.
- The 8-second frame-based WebM contained 240 video frames at 1280×720 and stereo Opus. The hosted MediaRecorder fallback produced 16 decodable frames in a separate eight-second fixture after the capture change. Keep the fallback fidelity gate open.
- The moving-light Chromium harness reproduced identical seek pixels using a 294,912-byte atlas. Its two hosted per-draw p95 readings were 21.7 ms and 30.1 ms. The original hosted harness recorded 413.9 ms and 279.5 ms; machine load and runtime instrumentation limit the comparison. These measurements use SwiftShader.
- The 720p two- and three-actor software smoke run completed. Its timing exceeded the playback and LVE budgets. The host uses AMD EPYC and SwiftShader, and the N4020, UHD 600, and 20-minute soak acceptance gates remain open.

## Reproduction

- Run `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run build` and `npm run verify:offline` from a clean checkout. `npm run build` also invokes the test, type and static offline checks.
- Run `npm run qa:workspace`, `npm run qa:native-assets` and `npm run qa:vvle` sequentially or from separate checkouts. They create short-lived Vite fixtures that can trigger development-server reloads in the same directory.
- Run the existing Stage 15A command with `QA_EXPORTS=1`; its default export preset is 720p. Set `QA_OUT` to a fresh directory for each checkout. The `--compare` mode is for main versus the original same-art baseline. The integration adds intentional captured head and contact changes.
- Run `node --experimental-strip-types scripts/verify-project-backup.mjs /absolute/path/to/movie.sirvibe` to verify a copy. Exit 2 reports a readable historical backup with missing production-graph audio.
- On the N4020, build the app, provide Chromium using `CHROMIUM_EXECUTABLE` if necessary, and run `npm exec --yes --package=playwright@1.51.1 -- node scripts/qa-stage-15-device.mjs`. The default samples a 20-minute three-actor moving-light workload at 1280×720 after a two-actor run. The report captures draws scheduled by animation frames, CPU phase times, seeks, process-tree RSS and browser heap samples. Compositor presentation and isolated PDE CPU time require further profiling. `QA_SOFTWARE=1` runs the hosted smoke fixture.

## Release and rollback

Keep PR #60 in draft pending professional art approval, the remaining software work and target-device verification. The Vercel rule skips automatic previews for the draft branch. GitHub Actions settings are unchanged. After the gates close and the founder authorizes release, recheck the exact PR head against current main and preserve the current production deployment and a project backup before merging. If rollback is needed, restore the previous production deployment and revert the single merge. Keep original projects and assets until the migration and restore suites pass on project copies.
