# Toonroom release verification

**21 November 2026 · PR #6 · NO-GO for production.** The feature branch builds locally. The production alias still serves main at `7e9547c47f6c0a32319156fd80de4746ba49ec87`. The hosted checks and integrations below are open release gates.

## Baseline and verification

Inspected the implementation history through Parts 1–10, the draft PR, Actions workflow, Vercel build records and the production alias. Ran the tests against the feature branch in a clean dependency installation. The original feature head was `90f5a754dd176eaabb66ef87953e53d71329ab8d`.

| Check | Original feature head | Fixed application |
|---|---|---|
| npm ci | Exit 0 | Exit 0, 203 packages installed |
| npm test | 156 passed, 1 failed | 164 passed, 0 failed |
| npx tsc --noEmit | Exit 0 | Exit 0, zero TypeScript errors |
| npm run build | Exit 1 in the tests | Exit 0, including the full suite, typecheck and Vite build |
| Worker | Deployment unverified | Syntax checked and real worker exercised on loopback |
| Hosted CI | Job creation failed before checkout | GitHub's check annotation identifies an account billing lock |
| Hosted preview | The original head's Vercel log reproduced the failing test | The branch received a Vercel build-rate-limit status |

The original failure was the keyboard duplication test for a group containing a camera shot. The earlier DirectorPanel compiler error did not recur. Vite still warns about large JavaScript chunks. These checks used Node 24.22.3 locally. Repeated the full build on Node 22.23.5, matching the workflow major version. It passed all 164 tests, typechecking and the Vite production build.

## Repairs and regression coverage

| Area | Root cause and repair | Evidence |
|---|---|---|
| Duplicate clips | Different commands used different placement rules. Single and grouped duplicates now find legal forward space on exclusive lanes, preserve the timing between clips and reject insufficient space. | Camera plus sound group, valid end placement, rejection at the boundary |
| Timeline edges and pointer input | Minimum-length clips were lost on an exact boundary. A left trim could seek before the recording. Clicking an already-selected member collapsed the group before a drag. The trailing edge could miss a valid snap. | Boundary, offset and snap tests. Pointer handlers retain a group on drag and discard an outdated drag when the underlying scene changes. |
| Camera validation | Whole-movie Code Mode reused a permissive legacy import path. An overlapping shot could disappear while applying the edit. Interactive replacement now rejects the overlap, preserving the existing scene. Legacy stored documents still use their migration path. | Regression reproduced before the fix. Browser applied an invalid whole-movie edit, saw the error, and compared the unchanged movie. |
| Speech and screenplay | A generated clip's entire viseme timeline was serialized into a graph signature limited to 2,500 characters. Recompiling long speech could fail and a replacement recording could inherit stale alignment. | Regression with more than 95 cues. Recording identity, voice preset and original timing participate in compilation. Visemes stay on the canonical dialogue clip. |
| AI and asset references | A delayed Director response compared a snapshot with the same captured scene. The Director now checks the current scene and cast both after the response and after speech preparation. Archived recordings now receive the same reference checks as active audio in both Code Mode editors. | Canonical operation tests and browser proposal exercises |
| Project recovery and UI | Backup and restore controls existed only in an obsolete projects dialog. They are now accessible from the gallery. The editor's mobile header overflowed by 65 px at 390 px. Asset cards shrank until their actions clipped. The time ruler repeated whole-second labels. | Gallery download, real reload and canonical equality. Responsive editor and ruler changes. |
| Drag cost | Snap targets were rebuilt for every pointer move. They are collected once for the duration of a gesture. | Warm synthetic benchmark with 500 clips and 1,000 moves, three runs each. Median 91.4 ms before, 7.6 ms after. This measures the snap calculations only. |

The real-time export initially played but FFmpeg reported an unknown-size WebM element inside a finite-sized parent. The previous duration patch rewrote the container header while leaving streaming clusters in place. The fallback now remuxes the encoded tracks using the existing MediaBunny dependency, without an additional encode. A second browser with the frame encoder disabled restored the movie and produced VP8 plus stereo Opus at 1280×720 for 11.987 seconds. Both tracks decoded without container errors. The software-rendered fallback captured 50 video frames over this interval, visibly less fluid than the 360-frame primary export. Retain this as a low-end performance limitation. Independent runs of the primary encoder produced identical decoded video and audio stream hashes.

## What went through a real browser

Chromium opened the built application from a clean profile with mouse and keyboard. The production alias was inspected separately. No production project data was used.

- Switched themes. Opened both the AI idea start and blank start. Verified that the first retained the seed in Create and the second opened Write. The idea start alone does not prove model generation.
- Authored **The Lunch Inspector** through the editor's movie Code Mode using a scene fixture. Used the public validation and Apply controls, followed by the Director panel, dialogue inspector, timeline, gallery and export UI. The test did not write directly to application storage.
- Uploaded a raster world, verified its preview and undid it. Created two additional cast members, changed voice and facial settings, placed them on stage, and exercised all five views, every expression choice and all eight mouth controls. The control pass does not certify the aesthetic quality of every expression/view combination.
- Checked duplicate, Backspace, Undo and Redo against the actual clip count. Typing and deleting text in the project title preserved the selected clip. Inspected the stage and exported frames. The deterministic suite covers group edits, splitting, offsets, camera transforms, lock/mute behavior, gait, gaze, visemes, transitions and scene ordering.
- Generated and regenerated the opening voice with local Flite. Verified previous audio remained in version history. Submitted all three recordings through the real local API/worker chain. In the saved movie, Rhubarb produced 13, 15 and 15 cues respectively. Its native executable was 1.14.0. Independent native smoke runs also produced nonempty timed output from three bundled audio samples.
- Exercised ten Director requests with a deterministic provider response. For each request the browser checked context, rejected a proposal and compared the complete movie, applied a fresh proposal, read the changed scene in Code Mode, and undid it. The final four-operation proposal was applied again for playback and save/reopen. This verifies the editing transaction. Hosted model understanding, per-request rendered comparisons and per-request persistence all remain separate gates.
- The ten requests covered movement, gaze, expression, pointing, a reaction shot, a second camera shot, an equipped prop, dialogue timing, an SFX cue, and a combined movement/gaze/expression/camera change.
- Saved the film, closed it, refreshed the browser and reopened it. The complete canonical document matched exactly. Sequential playback crossed both cuts to the third scene. Downloaded a portable project containing both generated audio versions.

## Desktop, mobile and media evidence

- At 1440×900, created and placed two cast members, edited a prop's scale/rotation/world coordinates, and duplicated and deleted it. Saved, renamed, duplicated and removed a world preset. Starred and categorized the original movie, then duplicated, renamed, searched and deleted the test copy.
- At 1536×960, dragged two selected clips by the same distance with the mouse, trimmed an edge, undid each action, locked the track and verified it resisted dragging. Mute, zoom, fit, clipboard and scene extension worked through the UI.
- With a 2.26× close-up and snapping enabled, grabbed a phone prop away from its anchor, dragged it by 30×20 world units, and read the committed position in Code Mode. It moved from (500, 302) to the expected grid position (530, 320). Undo exactly restored the original prop.
- At 390×844, reopened the saved film in Direct. The document fit the viewport. A separate fresh touch-enabled browser completed Get started, blank project creation and navigation to Direct.
- Recorded from Chromium’s virtual microphone and imported an MP3 through the audio dialog. Both clips decoded and were added to the timeline.
- Loaded 500 SFX clips through Code Mode, verified the mounted clip count and zoomed the timeline. Idle animation-frame intervals had a median of 16.7 ms and p95 of 16.8 ms across 50 samples. This does not measure frame times during drag or video rendering.
- Restored the downloaded project from the gallery. The restored copy received its own project ID and remapped recording IDs. Scene order, clips, visemes and embedded voice versions survived.
- One-second 720×1280 portrait and 720×720 square exports played in the browser and fully decoded via both encoders.
- The main WebM was played through the export dialog and fully decoded with FFmpeg. It has VP8 video at 1280×720 and 30 fps, stereo Opus, a duration of 12.020 seconds, and 3,932,332 bytes. Mean audio levels in the three four-second intervals were −24.9, −16.1 and −21.1 dB respectively. The peaks stayed below full scale. Exported frames show the wide/close shots, three backgrounds, subtitles and gestures. In the last close-up, frames 290, 304 and 321 show the open, wide and resting mouth that correspond to the saved audio-derived cues.

[Six frames from the exported movie](qa/lunch-inspector.jpg) · [Desktop and mobile studio screenshots](qa/studio-desktop-mobile.jpg)

## The film

Sbu discovers an empty plate in the living room. On the township street, Zee explains she had to check lunch was safe. In the podcast studio, Sbu produces the receipt. The movie contains three four-second scenes, two performers, three worlds, 16 scene props in total, 28 clips, six camera shots, speaking/listening gaze, gestures, walking, a music bed and three comic sound cues. The Director fixture changes the staging of the first scene. The first voice is synthesized in the browser. The other two lines use bundled recordings. The test uses real audio-derived mouth cues for all three.

## Scope of the release decision

GitHub's runner never started because of the account billing restriction. Vercel reported the build rate limit. No credits, plan changes, workflow bypasses or extra preview deployments were requested. The feature revision has not been verified on the production URL. Keep PR #6 in draft.

A release still needs ten conversations with a configured live model, provider-backed creation, hosted worker authentication and actual analysis, a signed-in two-account cloud/ownership and recovery test, and review/check approval. Local testing does not validate these services. Real microphone capture, a physical mobile device, sustained large-project GPU/memory behavior, long-form export and physical-device capture quality, and subjective phoneme-by-phoneme sync also remain unverified. The hosted model and speech routes verify the account before calling their providers. Per-user request throttling was not established in the inspected handlers. Rules and handler inspection covered owner-scoped reads and writes, validation, authorization and bounded worker inputs. This review does not certify the deployed rules or rate limiting.

## Reproduce the browser checks

Use a disposable local profile and Node 22.6+ with the locked dependencies, Python Playwright and its Chromium installation, FFmpeg/ffprobe, and Rhubarb 1.14.0 with its language resources. From the repository root:

```sh
npm ci
npm test
npx tsc --noEmit
npm run build
RHUBARB_BINARY=/absolute/path/to/rhubarb node tests/browser/serve.mjs
```

In another shell:

```sh
python tests/browser/film.py http://127.0.0.1:4173 /tmp/toonroom-film
python tests/browser/assets.py http://127.0.0.1:4173
python tests/browser/timeline.py http://127.0.0.1:4173 /tmp/toonroom-film/The-Lunch-Inspector.toonroom.json
python tests/browser/restore_export.py http://127.0.0.1:4173 /tmp/toonroom-film/The-Lunch-Inspector.toonroom.json /tmp/toonroom-film/recorder.webm
```

The preview helper binds to loopback. For the separate worker path used in this run, launch the repository worker with its native binary and a fresh private worker token. Start the helper with RHUBARB_WORKER_URL pointing to the loopback worker, the matching RHUBARB_WORKER_TOKEN, and RHUBARB_BINARY unset. Guest analysis is local to the QA helper. The browser tests accept an optional Chromium executable.
