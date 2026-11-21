# Toonroom: simplification release QA — 21 November 2026

## Product and architecture

The public entry point now offers **Create a Cartoon**, which opens a 30-second local scene immediately. The editor has a stage, timeline, contextual inspector, five asset categories and optional sign-in for the existing cloud integration. Existing projects keep their version-1 schema, characters, story metadata, scenes, assets and animations. Old story/AI/TTS modules remain in source but are outside the public workflow. A production asset scan found no `/api/director`, `/api/filmmaker`, `/api/speech`, `/api/lipsync`, OpenRouter or Flite references. The former 21.5 MB speech WASM is absent from the public build.

The DSP worker decodes source audio at 16 kHz, computes short-time energy, FFT spectral balance, adaptive noise thresholds and attack/release smoothing, then stores deterministic source-audio cues. Content hashes cache cues and actual waveform peaks in IndexedDB. This is stylized audio-reactive animation, **not phoneme recognition**. Precision corrections are an independent, persisted source-time layer; automatic regeneration does not overwrite them. The existing SVG/Pixi mouth geometry clips individual teeth and tongue within the cavity.

## Automated validation

- Clean `npm ci --no-audit --no-fund` completed.
- Baseline: 164 tests, TypeScript and production build passed.
- Release: **171 tests passed**, TypeScript passed, production build passed.
- New regressions cover deterministic DSP, silent/noisy/loud/fast input, 16/48 kHz handling, ordered cues, manual overrides/reset/regeneration, trim/split/source offsets, Undo/Redo, JSON reopening, invalid cue rejection, maximum-duration cue budgets and deterministic interactive doors.
- An actual bundled speech recording was decoded and tested at normal speed, amplified, accelerated and mixed with background noise. Each produced finite, bounded cues; silence produced only rest. A 180-second rapid input stayed within the 3,000-cue schema budget.

## Real browser filmmaking

Computer Use performed the actual public UI workflow; the film was not created by injecting application state:

1. Created a new project and renamed it **Who Ate My Lunch?**.
2. Uploaded a classroom PNG; placed Bra Sbu, Zee and a table; repositioned them through the inspector.
3. Attempted microphone recording. This cloud browser has no microphone, and the interface correctly offered upload instead.
4. Imported playable Sbu and Zee speech fixtures through file pickers. Both became character-assigned dialogue clips with local DSP cues and real timeline waveforms.
5. Put dialogue at 4.00 s and 5.50 s, intentionally overlapping the two voices.
6. Opened Precision Lip Sync, auditioned individual audio blocks, changed AH/EE/L shapes, verified the SVG face changed immediately, adjusted a boundary with the keyboard and dragged a boundary with the mouse.
7. Switched automatic/precision modes, zoomed, looped a selected region, used Undo/Redo and regenerated automatic cues. Manual corrections remained.
8. Added walking, pointing, laughter, two runs, shrug actions, a reaction close-up, two-shot and final rimshot.
9. Tested Backspace deletion, Undo restoration, clip movement (4.00 → 4.99 s), edge trimming (2.00 → 2.55 s), grouped duplication (12 → 14 clips) and grouped Undo.
10. Saved, refreshed/reopened, downloaded a complete backup and restored it into the hosted preview. The uploaded background, two audio files, 12 clips, 30-second duration and all three precision corrections survived.
11. Imported a corrupt MP3 through the hosted UI; received a clear decode error, and all 12 existing clips remained intact.
12. Exported a real 30-second landscape movie through the UI. Restored and exported the film in portrait from the hosted preview.

### Export evidence

- Landscape: VP8 WebM, **1280 × 720, 30 fps**, stereo Opus **48 kHz**, 30.020 s including codec padding, 9,684,581 bytes.
- Portrait: VP8 WebM, **720 × 1280**, stereo Opus, 30.020 s.
- Square: VP8 WebM, **720 × 720**, stereo Opus, 30.020 s.
- FFmpeg decoded the complete landscape movie without errors.
- Cross-correlation against the source speech: **0.99641**, measured dialogue offset **6 ms**.
- Inspected actual exported frames: background, positions, pointing, camera close-up and clipped mouth artwork are present. Respect the file's full-range color metadata when extracting reference RGB frames from VP8.
- The portable backup contains two embedded audio files and source-time AH/EE/L corrections. No cloud speech or rendering service was used.

### Responsive QA and fixes

Actual Chromium browser zoom exercised 773 px and 451 px CSS viewports. This caught a retained five-row grid from the old Create/Write/Direct navigation that was compressing the stage. The new explicit four-row narrow layout restores a usable 328–360 px workspace. Assets/Stage/Inspector navigation works, and the document has no horizontal overflow at 451 px. Desktop uses the three intended rows and resizable side panels. Narrow navigation exposes Undo/Redo; adding a table and undoing it was exercised through those controls. Light-theme task labels, inputs and timeline contrast were corrected and checked in-browser. Physical phone/tablet touch hardware and the user's Celeron laptop were not available.

### Important integration fixes

- Paused stage previews now evaluate the same timestamp, poses, camera and held props as playback/export; arranging no longer substitutes neutral poses.
- Dragging a moving character translates its authored path without a jump from the evaluated pose.
- Voice replacement keeps earlier audio in project history, while corrections for the new source start independently.
- Mouth corrections survive regeneration, scene persistence, portable backup and restore.
- Keyboard shortcuts stay out of inputs and modal dialogs and are inactive on the home screen.
- Save failure offers a recovery backup directly from the editor.
- Door anchors now support deterministic open/close cues; cup holding and chair sitting retain existing anchors.

## Hosted validation and release conditions

The initial simplified preview on `e4e507f4656e88ccf635410aa006dfeae4164fc8` reached Vercel READY and was exercised in-browser: fresh creation, portable restore, local DSP regeneration, precision correction persistence and portrait export. A later CSS-only fix resolves the narrow-layout issue described above and is validated locally before the final preview.

GitHub Actions run **44896614929** was inspected in the actual GitHub UI. Its annotation says: **“The job was not started because your account is locked due to a billing issue.”** It is not a passing CI run. Local checks and Vercel's independent build are the available validation routes. The repository's `main` branch was reported unprotected with no required status checks; no protection, security setting, billing setting or workflow has been weakened.

PR #6 was already merged before this work. PR #7 continues the original implementation branch. The release must use the normal PR merge endpoint and verify the actual production domain after deployment. Final deployment/merge evidence is recorded in the PR body.

## Explicit verification limits

Live physical microphone capture and signed-in Firebase cloud ownership/recovery were unavailable. The browser's no-microphone error and uploaded speech path were tested; cloud storage/authentication services remain the existing implementation. Automated DSP robustness checks are not a claim of linguistic recognition or a hardware benchmark on the user's laptop. The release prioritizes the verified guest/local workflow and browser WebM export.
