# SIRVIBE Performance Studio

A locally evaluated, non-generative 2D motion capture and acting workflow. It is
integrated with the existing character rig, timeline, hand drawing, facial
expressions, and DSP voice-driven lip synchronization.

## Current workflow
1. Open a movie, put at least one character on stage and move the playhead to
   the performance start time.
2. Click **Perform** (camera icon) in the studio top bar.
3. Select the actor, choose smoothing/exaggeration, then **Enable camera**.
4. Stand where your upper body and arms are visible. Click **Record acting**.
   A recording lasts up to 18 seconds, and can be stopped early.
5. Choose whether to apply the observed movement style to the character, add
   optional spoken transcript, and optionally assign a staged recoil to another
   character when a rapid punch-like gesture is detected.
6. Click **Add performance to timeline**. The pose keys, captured voice and DSP
   mouth cues appear as separate editable body and dialogue clips. Preview
   playback and export evaluate identical timestamped data.

Captured actions can be split, trimmed, moved, copied, deleted and undone
using the existing timeline tools. Pose frames are immutable scene data,
not a second ephemeral state store.

## Capture implementation
- Pose Landmarker maps shoulder, elbow, wrist, torso and visible leg landmarks
  to the current parametric cartoon rig.
- Hand Landmarker categorizes safe cartoon finger shapes. Hands are associated
  by wrist position rather than handedness labels, which can be wrong in
  mirrored camera previews.
- Optional Face Landmarker maps expression blendshapes to a conservative
  expression vocabulary.
- The pose compiler filters invalid frames, clips joint angles to anatomical
  authoring bounds, normalizes time, smooths trajectories, scales gesture size
  and resamples to at most 240 persistent keys per clip.
- The renderer reuses hand and face geometries, preserves rig bone lengths and
  keeps recorded poses independent from audio. Mouth cues are driven by the
  user's voice recording using the existing local DSP analyzer.
- Motion DNA summarizes observed gesture amplitude, energy, and dominant
  movement side. It is *not* personality inference.
- Fight choreography currently offers a manually selected opposite actor's
  cartoon recoil when a punch-like arm extension is observed. It does NOT
  claim impact detection, contact physics, collision solving, or professional
  martial-arts choreography.

## Camera/device constraints
- Requires secure HTTPS origin or localhost, camera permission and browser
  MediaRecorder to capture optional microphone audio.
- Default: low-resolution camera, CPU pose tracking, ~10 inferred frames per
  second with adaptive throttling. Face tracking is opt-in and may be too slow
  on inexpensive devices. If hand/face models cannot load, body tracking can
  continue. Do not assume full-body capture is stable under occlusion.
- Body tracking requires both shoulders, elbows, wrists and hips to be
  recognized. If tracking is lost or poor, recapture in better light with
  both arms visible.
- The feature stores no raw video. Timestamped pose keys live in the local
  project and optional recorded voice in the existing device media store.
  Sending a project to cloud backup is separately user-controlled.
- Webcam preview is a mirror to make acting intuitive; detector coordinates
  are not mirrored. The hand matching algorithm is based on observed wrist
  proximity rather than a camera-specific handedness assumption.

## Optional fully offline installation
The ordinary build lazy-loads MediaPipe v1.2.3 from a pinned CDN on first
recording. The rest of SIRVIBE works offline regardless.

To bundle the tracking runtime, weights and WASM locally, install these
optional static assets before building:

```sh
npm run assets:performance
npm run build
```

Assets are downloaded to `public/mediapipe` and automatically included in
the service worker precache as part of the PWA build. They are excluded from
Git to avoid committing large third-party binaries. Only the exact pinned
runtime and model URLs in `scripts/fetch-performance-assets.mjs` are used.
Deployment operators should review third-party licenses/notices and the
increased precache size before enabling this on bandwidth-constrained users.

Offline first capture **requires** the assets to be included at build time;
the default CDN fallback is not an offline installation.

## Validation
- `npm run build` executes the automated test suite, TypeScript and Vite
  checks.
- `tests/performanceCapture.test.ts` covers deterministic capture, low
  confidence rejection, schema persistence, trim/split, recoil, strike
  suggestions and invalid key validation.
- Real-camera QA is still required on representative Android and desktop
  devices. Confirm camera permissions, mouth timing, gesture hand correctness
  and performance under multiple actors before promoting to production.

## Next fidelity milestones
- Curated pose vocabulary and user-editable sparse pose beats, with IK
  corrections and dynamic anticipation/follow-through.
- Recording a complete actor-to-actor interaction using alignment constraints,
  separate reaction recordings, impact foley and camera staging.
- Feet/ground contact constraints, body turn/view transitions and handling
  occlusions for dancing, close grapples and complicated fights.
- Video-file import and exportable/copyable Acting DNA profiles.
