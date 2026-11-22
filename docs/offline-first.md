# SIRVIBE offline-first studio

Core filmmaking runs on the device. There is no Firebase initialization, authentication gate, API call or rendering server in the guest workflow.

## Creator workflow

Open the app online once and leave it open until **Ready offline** appears. Install from the browser's Install control/menu; Safari uses Share → Add to Home Screen. Installation is optional: the cached browser tab also works offline. Installed launches open My cartoons.

Use **Start Creating — No Account Needed**, then create a cartoon. Project edits autosave after 520 ms of inactivity. The save indicator only acknowledges committed IndexedDB writes. Closing with pending edits attempts a final save and triggers the browser's unsaved-change protection. A previously committed version can be opened as a new cartoon through Projects → Recover previous save.

Download project backups periodically, especially before clearing browser data. Current `.sirvibe` backups contain a bounded JSON header and binary audio parts, with SHA-256 integrity checks. Import reads one audio asset at a time, allocates fresh project/audio IDs and preserves all existing projects. Earlier `.sirvibe.json`/`.toonroom.json` backup envelopes remain importable. Imported and cloud-downloaded artwork is embedded as optimized WebP in the local project.

Cloud sign-in, **Back up current cartoon online**, and **Download cloud cartoons as copies** are optional, explicit actions. Cloud downloads fetch artwork and audio before committing local copies. Cloud projects never replace local projects. Signing out does not switch or erase the device library. Earlier account-scoped IndexedDB/localStorage projects and saved worlds migrate locally with source data retained; ID conflicts preserve both versions.

## Storage and updates

- `sirvibe-projects` IndexedDB v2: project documents, migration markers, previous committed project revisions. Autosaves are serialized. Stale document writes/renames/deletions from other tabs fail visibly instead of replacing newer work.
- `sirvibe-media` IndexedDB: file commit records and Blob fallback. Assets >=1 MiB use OPFS when available. An immutable OPFS file is completely written and closed before its metadata commits. Failed OPFS writes fall back to IndexedDB; failed saves are surfaced. Previous immutable files are retained, avoiding deletion races with other tabs and backups.
- Existing `toonroom-audio` data remains readable without destructive migration. Local DSP analysis remains cached in its existing database.
- Settings and small saved-world presets remain local. Scene artwork is capped/optimized at import, so large source images do not expand project storage.
- The production Vite plugin emits a content-versioned service worker, caching every built shell file, lazy chunk, DSP worker, local asset and export library. Bounded install batches must all succeed before activation. Partial installs are discarded. API requests and cross-origin requests are not cached.
- The initial service worker claims the app when its installation finishes. Later updates wait for an explicit Update action, which saves pending edits before reloading. The prior bundle is retained for tabs that started before the update.
- Browser persistent storage is requested on creator entry. Browsers can decline it. Clearing site data/uninstalling with data removal, private browsing and browser eviction can remove local work; downloaded backups remain the independent recovery path. Local data stays tied to the browser profile and origin.

## Performance and export

Preview uses existing event-driven Pixi rendering; low-memory/mobile defaults use the reduced-resolution preview. Audio decoding is prepared in batches of two; the reusable decoded-audio cache has a memory budget. Closed mixers release prepared/voice buffers.

Exports use local WebCodecs with Mediabunny where supported, or local MediaRecorder/canvas capture. Both use the audio timeline as their clock. The default balanced resolution is 1280×720 landscape, 720×1280 portrait, or 720×720 square. Full resolution remains available. Long films on devices reporting <=4 GiB memory prefer a recorder path when available, avoiding a full-duration offline audio mix. No hardware memory emulation was available during verification.

## Verification — 2026-11-22

`npm run build`: all **227 tests passed**, TypeScript passed, production build passed.

`npm run verify:offline`: all **32 emitted shell/asset files** verified in the precache, approximately **2.73 MiB**. It checks the DSP worker, both video export paths, manifest and HTML entry resources.

Real Chromium QA used the built production preview. After initial caching, the source server was stopped. With that origin unavailable, the app was reloaded and used for:

- Guest creation, character placement/customization, background/prop file import.
- Dialogue file import and local DSP worker analysis (40 generated cues), manual viseme correction, voice effects and fade editing.
- Music and procedural SFX, action and camera clips, preview playback.
- Scene creation/deletion, autosave, reload and reopening saved projects.
- A 1,536,044-byte audio file saved locally, then recovered after reload and compared byte-for-byte through a backup.
- Local export of an 8-second cartoon: 1280×720 VP8/Opus WebM, 8.020-second container duration, video starting at 0 and audio at -0.007 seconds (codec priming). File inspected with ffprobe. This browser selected WebM; MP4 was not claimed as verified.
- Legacy JSON backup import, current binary backup export/import, all three asset checksums verified, restored media identity checks, and re-export after restoration.
- Safe service-worker update: Update appeared after reconnecting the preview, was explicitly applied, and all projects survived.
- 338 CSS-pixel layout: Assets/Stage/Inspector navigation, visible save status, no horizontal page overflow. This was a narrow-layout test using browser zoom, not Android-device emulation.

Automated regressions include legacy migration, cloud-copy isolation, ordered autosaves, previous-save preservation, stale-tab conflicts, deletion after queued autosave, IndexedDB fallback, OPFS failure/missing-file behavior, offline worker cache/navigation/lazy chunks, interrupted install cleanup, API exclusion, explicit update activation, backup truncation/corruption rejection and old-format import.

## Follow-up system audit

The release audit also fixed:

- Previously unreachable recovery controls and a missing confirmation for project deletion. Project options and Backups & recovery now expose the existing tools on desktop and mobile.
- Full-library IndexedDB reads after every autosave. Successful saves now return the committed row and update the in-memory library directly. Legacy migration reads keys first and fetches only unmigrated documents.
- Deleted-project resurrection by delayed saves/other tabs. Version tracking now retains deletion tombstones. Explicitly opening a project reads and acknowledges its latest committed snapshot without relaxing conflict checks during background listings.
- One malformed project or legacy preference blocking the whole project library. Damaged originals remain stored; healthy projects are listed, and an earlier valid save is recovered once as a separate copy when available. Blocked preferences fall back to session defaults.
- Failed imports leaving unreferenced audio. The full import is validated before any media writes; storage failures roll back only newly allocated import IDs. Archived production-event audio versions are remapped along with active clips.
- Offline retries failing to repair an evicted asset when the worker script had not changed. The active worker now repairs missing files without deleting usable cached files. Retry/update listeners are registered once.
- Worker-only changes reusing the active cache identity. The build now hashes worker source as well as assets, keeping an interrupted worker update from removing an active version's cache.
- Cloud re-downloads failing immediately on missing local media. Explicit connected cloud access can now replace a missing local file; offline usage still presents the missing-file error.
- A transitive Firebase Node dependency with a high-severity certificate-validation advisory. `@grpc/grpc-js` is overridden to 1.14.7, preserving Firebase's existing public API. The complete `npm audit` result reports **zero known vulnerabilities** after the update.

Added regression checks cover corruption isolation, reopening newer versions, external deletion, preference blocking, cache repair, worker-only cache identities, and partial-import cleanup. Real browser checks also confirm recovery opens a separate cartoon and deletion displays a cancellable confirmation.

## Verification limits

The managed browser blocks developer tools; actual Android devices and constrained physical memory were unavailable. Stopping the origin server verifies cached operation without access to application resources; it is not a claim that the entire machine's network was disconnected. Unit service-worker tests also reject every network fetch. Physical microphone capture could not be completed because the browser had no input device; the error/fallback was checked, and uploaded audio completed DSP/playback/export. Signed-in Firebase/R2 round trips require an account and were not verified live in this session.

Browser codecs vary. MP4 is selected only if local video/audio encoders support it; otherwise WebM is used. A browser with neither supported export path displays an actionable message. Recording requires microphone support/permission and a secure origin; uploads are the fallback. OPFS is optional, with IndexedDB Blob fallback. Long/complex movies still depend on device CPU, GPU and available memory; no universal low-end performance guarantee is made.
