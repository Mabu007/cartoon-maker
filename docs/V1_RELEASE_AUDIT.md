# Toonroom V1 — source audit and release gate (2026-11-21)

**Audited baseline:** `main` at `28ae285e33da`. **Implementation branch:** `feat/toonroom-v1-r2-media-actor-entrances`.

This is a source review, static test review and Vercel build-log review. It is **not** a complete interactive browser audit. "Verified" means directly demonstrated by code or test results; "Risk" means requiring live runtime or scale validation. Do not claim to have found *every* possible bug.

## Fixed in this PR (code complete; final commit not yet fully validated by Vercel)
| Severity | Previously observed issue | Change |
| --- | --- | --- |
| P0 | Signed-in audio uploaded through Firebase Storage; R2 environment variables unused | Firebase-authenticated, short-lived R2 S3 PUT/GET signing endpoint; new voice/SFX/music go to R2 |
| P0 | Imported image backgrounds and props embedded as WebP project JSON, increasing Firestore document footprint | R2 image references, renderer and card URL resolution, read-only migration from embedded files |
| P0 | Previously saved audio could be unreachable when switching from Firebase Storage to R2 | Legacy Firebase read fallback and R2 migration during the next cloud sync |
| P1 | Existing Actor visibility logic only exposed obscure manual clips | Cast Place/Walk in/Run in, Inspector enter/exit/show/hide, timed presence and gait clips |
| P1 | Actors timeline lane hidden when empty, and actor clips shared unstable interval-packed rows | Always-visible Actors lane with one stable per-character row, clear visibility labels |
| P1 | Microphone recording displayed only a text indicator | Live input waveform, 00:00 recording clock, input meter and post-record waveform preview |
| P1 | Timeline audio waveform component ran full lip-sync DSP analysis separately per clip, even for music/SFX | Reusable per-asset waveform cache using simple amplitude decoding |
| P1 | Guest projects and backups must remain portable when cloud media references are added | Legacy embedded images retained for offline use, cloud images resolved on demand, exported backups contain image data |

## Critical release gates — still open
1. **Vercel build quota:** the exact latest commit cannot be built/deployed now. The Vercel deployment quota is exhausted; the last successful integrated preview predates later changes.
2. **Live cloud smoke test:** verify Firebase email/password sign-in, a real R2 PUT/GET round trip, MIME/CORS, cross-device reopen, signed URL expiry and cloud backup. No authenticated R2 runtime test was available.
3. **Bucket CORS configuration:** production origin must allow GET, PUT and HEAD and Content-Type. Details are in `docs/R2_V1_RELEASE.md`.
4. **Upload abuse control:** the direct PUT URL is time-limited, and the UI/API validate a *declared* size, but the R2 bucket does not enforce that claimed size. Add per-user quota, per-account rate limits, server-side HEAD/finalize size verification and oversized-object cleanup.
5. **Storage lifecycle:** deleting a project does not garbage-collect now-unreferenced R2 media. Add safe reference counting, retention window, delete queue and user data deletion before broad public release.
6. **Real browser filmmaking QA:** microphone, stage hit-tests, entrance/exit animation, WebGL fallback, export playback and mobile layouts remain unverified in an automated connected browser. Sandbox usage limit prevents this test path.

## Important P1 follow-ups
- **Multi-device conflict handling:** Firebase project transaction compares timestamps and rejects strictly newer cloud values, but same-timestamp/offline concurrent edits are not merge-safe. Add revision IDs/compare-and-swap and recovery paths.
- **Offline document-size limits:** project schema allows up to 600 scene clips, 30 scenes and many viseme cues, while Firestore rules constrain the serialized document to 850 KB. Test realistic long episodes and provide warnings before save.
- **Imported media asset browser:** actors, prop images and audio are available in the sidebar, but no unified saved cloud media library for reusing files across projects yet.
- **Video media:** the private R2 API can sign video assets, but video import/placement, video compositing, frame-accurate playback and export are not implemented. Explicitly exclude from V1 promises.
- **Canvas drop placement:** dragging a character from the library onto the stage currently creates it at a preset default location, then needs another move. Honor the drop's world coordinates for precision.
- **Performance:** Timeline renders every clip DOM node and calculates lane rows on updates; test 300–600 clips on a 4 GB laptop, then virtualize heavy lanes and debounce nonessential previews as needed.
- **Export CPU/memory:** long films with dozens of imported images and separate audio sources can exceed browser memory/time limits. Stress test 16:9, 9:16 and 1:1 before public release.
- **Legacy media retention:** maintain Firebase Storage read-only rules until migrated and independently verified; do not remove legacy blobs prematurely.
- **Backup file size:** portable JSON backups embed audio and images as base64. Many long clips can produce large backups; consider ZIP/container export or streaming.
- **Microphone UX:** the live waveform and level are implemented but input-device selection, clipping warnings and on-recording trim/split controls are not yet available.
- **Storage errors:** network interruptions, browser storage eviction and permission denial require recovery UI and repeated stress tests.
- **Accessibility:** actor/prop drag-and-drop is pointer-first. Check keyboard operability, focus management and screen-reader labels for asset/context menus.
- **Authenticated API load:** current Firebase user verification makes a network request per media URL. Test under load; consider safe caching or Admin SDK validation, without weakening authorization.
- **Private media CORS:** any added preview domain must be explicitly listed. Never make the private bucket publicly readable for convenience.

## Existing strengths retained
- Deterministic scene and clip schema validation, normal playback and timeline evaluator.
- Camera shot exclusivity, timeline snapping, trim/split/copy/duplicate, keyed movement handling, Undo/Redo.
- Local DSP viseme engine, manual precision mouth cues, browser audio recorder/mixer, imported worlds/props.
- Firestore per-user project rules and strict character/clip reference validation.
- Existing automated tests: last successful integrated feature-branch Vercel preview was READY; multiple prior test runs passed more than 170 tests.

## Release decision
**NOT YET RELEASE-READY FOR GENERAL PUBLIC V1.** The features live on a separate PR until the exact final commit builds, R2 is authenticated and CORS smoke-tested, and rate-limit/storage-deletion risks are addressed. Preserve the current production version meanwhile.
