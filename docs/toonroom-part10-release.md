# Toonroom — Part 10/10: Autonomous QA, final optimization and release gate

**Status: IMPLEMENTATION COMMITTED; RELEASE BLOCKED. Do not merge PR #6 or promote a deployment without a new successful build and browser QA.**

Branch: `feat/toonroom-production-overhaul`  
PR: https://github.com/Mabu007/cartoon-maker/pull/6

## Systems inspected

- Project/Story Bible/screenplay compilation and canonical state (`src/App.tsx`, `src/studio.ts`, `src/engine/production.ts`, `src/engine/sceneWorkflow.ts`, `src/services/projects.ts`, `src/services/cloud.ts`).
- Timeline selection/clip mutation, Code Mode, AI Director proposal/approval, camera overlaps and world-coordinate picking (`timelineEditing.ts`, `timelineAI.ts`, `movieTimeline.ts`, `cameraTransform.ts`, `renderer.ts`).
- Audio mixer and recorded assets, Rhubarb/visemes, mouth geometry, acting and rendering, speech regeneration and export (`audio.ts`, `lipSync.ts`, `mouthRig.ts`, `mouthArt.ts`, `facialAnimation.ts`, `evaluate.ts`, `frameExport.ts`, `export.ts`, `api/lipsync.ts`, `workers/rhubarb`).
- Projects, Scene and Assets screens, dark/light UI and responsive breakpoints (`Welcome.tsx`, `AssetLibrary.tsx`, `Dialogs.tsx`, `Stage.tsx`, `filmmaking.css`).

## Part 10 defects fixed

1. **Staged AI preview seek used the canonical scene duration.** Transport seeking now follows the staged proposal's current duration and playhead; proposed edits remain uncommitted until Apply.
2. **Stage rendered on an always-on animation-frame loop, including while idle.** Stage listens to the actual audio-clock `toonroom-time` events during playback and only refreshes on state/seek events while stopped.
3. **Dialogue/audio duplication could wrap backward and overlap its source when the scene had no space.** Clip duplication now finds a valid forward slot or rejects explicitly. Dialogue duplication also avoids other dialogue from the same actor.
4. **Editing the movie title in Create left a different title in Projects.** Story title changes synchronize the canonical movie name.
5. **Large Projects libraries instantiated all movie-cover SVG trees at once.** Searchable/paginated cards now render in batches of twenty.
6. **Animation evaluator filtered all timeline clips separately for each actor at each frame.** Clip and prop maps are indexed once per frame, preserving deterministic clip order and avoiding repeated full scans.
7. **Director Inspector needlessly rendered on every preview frame.** The displayed time is sampled at approximately 8 Hz, while model requests use the exact current playhead.

## Tests and observed evidence

- The previous available **Vercel build at commit `87ba0cf1`** executed **148 automated tests: 148 passed, 0 failed**. The same build subsequently failed TypeScript with exactly three `DirectorPanel.tsx` message-role inference errors. Those errors were corrected in Part 9 at `71ffaf3`.
- This phase adds **9 more regression tests**: 2 for audio/dialogue clip duplication and 7 for the three-scene movie fixture. They are committed but **have not been verified passing at the newest HEAD**. The full fixture checks three different scenes/worlds, two characters, props, lip-sync cue timing, dialogue, gaze, gestures, movement, SFX/music, multiple cameras, scene cuts, audio position, JSON Code Mode, invalid overlaps, scene resize, Undo/Redo, and saved/reopened movie data. It uses **bundled prerecorded voice assets and estimated viseme fixtures**, not real hosted voice synthesis or a running Rhubarb worker.
- GitHub Actions `Toonroom CI` on the current branch still reports **failure**, with `verify` jobs having no populated steps/logs. The workflow job log endpoint returns Azure `BlobNotFound`. This is not adequate evidence to identify an application test failure.
- The Vercel preview deployment API returned **402 `api-deployments-free-per-day`**, preventing a fresh build of the current HEAD. A Vercel Sandbox creation attempt returned **402 `payment_required`** with reset date **2026-12-01**, preventing an isolated Git-backed build environment.
- The connected browser in Chat mode only supports **reading existing tab content**. An existing Toonroom editor was read at `https://cartoon-maker-theta.vercel.app/`, but no clicks, drag/drop, voice capture, live playback, visual screenshots or video export could be performed in this environment.
- The existing **production deployment** is reported READY at main SHA `7e9547c47f6c0a32319156fd80de4746ba49ec87`. It **does not contain the Part 10 changes**. The nearest earlier READY feature-branch preview was at `ec6a266`, not the final HEAD.
- Vercel runtime-error aggregation for the preceding seven days reported no server runtime errors; this does not validate browser client errors or the unreleased branch.

### Required commands on the current branch

```sh
npm ci
npm test
npx tsc --noEmit
npm run build
```

Save the complete output. Do not promote until every command exits 0. The project's `npm run build` already includes unit tests, type-check and the Vite production bundle.

## Required real-browser acceptance (desktop and 390/430/540/790 px)

**A. Landing and project recovery:** fresh session → Get Started → AI and Blank paths; edit concept/tone → Write formatted scenes → Direct; autosave → Projects → rename/duplicate/favorite/organize/delete with confirmation → reopen the saved workspace/scene/playhead. Switch dark/light and check focus, contrast, scrolling and mobile controls.

**B. Characters and assets:** create two characters, customize eyes/hands/mouth/voice, add a world and uploaded world image, save/edit/reuse a furnished set, upload/import and arrange props. Delete referenced cast/props and check dependency review, Undo and intact project validation.

**C. Dialogue and lips:** speak a line using generated voice, regenerate a single line while keeping earlier version, upload a recording and use the microphone. With the Rhubarb worker actually deployed, confirm real `source=rhubarb` cues and check exact audio-clock lip alignment, closure and teeth/tongue clipping on front, 3/4 and side views. Without the worker, show the UI's explicit **Estimated — NOT audio aligned** fallback; do not call that Rhubarb QA passed.

**D. Timeline/AI Director:** place gestures, gaze, multiple nonoverlapping camera shots, prop handoffs, SFX and music. Scrub, play, drag and resize clips, zoom/scroll, extend/shrink, multi-select/copy/paste/split, Backspace, Undo/Redo, camera overlaps (must reject), move props under camera zoom (correct world-space drop). Run at least five **real** director conversations with live model output, check proposed preview Play/Seek, Apply/Reject, then verify canonical timeline and Code Mode JSON.

**E. Finished movie:** author at least **three scenes**, **two characters**, **two worlds**, several props, generated voices, real lip-sync, gaze/gestures, multiple shots, SFX and music. Play sequentially, save, reopen, export WebM/MP4 where supported, and verify the resulting downloaded video with speech, cuts, visuals, correct duration and A/V sync.

**F. Failure/resilience:** offline/cloud sync interruption, malformed imported JSON, missing audio, invalid character/prop IDs, browser reload during edit, hidden tab during recorder export, mic permission denial, large scene performance and mobile viewport.

## Release decision

**NO-GO until all gates are confirmed.** PR #6 remains draft. No merge, promotion, production deployment or unverified URLs should be claimed. The worker hosting, real browser QA and successful current-HEAD build are genuine external blockers, not deferred claims of success.

When infrastructure is restored, run the tests, fix any failures, complete the browser matrix, mark PR ready, honor required reviews/checks and only then merge through GitHub and let the existing Vercel Git workflow deploy. Verify the actual new deployment ID and its live behavior before reporting release.

**Part 10/10 completed up to the reachable release gate.**
