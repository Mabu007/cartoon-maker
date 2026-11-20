# Toonroom — timeline/code filmmaking implementation notes

## Implemented on feature branch

- A scene is a typed, canonical `Scene` document. **Visual timeline, JSON import/export and AI Director all edit the same data** through the existing store.
- Director: AI produces typed **insert / replace / remove** clip operations. Validate against project assets and schema; review then apply/undo. No screenplay approval is required for director edits.
- Timeline Code modal: copy the actual scene, paste/edit JSON, validate, and apply it to the visual timeline. Copy AI scene-building context with supported engine vocabulary and real IDs.
- Camera edits: inserting or resizing a camera shot trims/splits competing clips so no two shots occupy the same time.
- Music: separate timeline track and media import from the SFX and dialogue tracks.
- Dialogue: generate/re-generate individual voice clips and store audio-derived viseme cues when the optional analyzer succeeds. Fallback is clearly described as **estimated**, not aligned.
- Arranging: camera zoom stays active while positioning, pointer picking inverts the camera transform, and selected props remain draggable despite actor hitbox overlap.
- Onboarding: public landing, project library, AI idea prompt, blank project.
- Tests: source-code round-trip, invalid imports, camera overlap, viseme time sampling and parser errors.

## Hosted speech (optional)

The existing speech provider uses on-device speech when hosted speech isn't enabled. When configured with account login, `api/speech` uses OpenRouter:

- `OPENROUTER_API_KEY`: server-side API key (never expose in `VITE_*` variables).
- `SPEECH_MODEL`: default `fish-audio/s2.1-pro-free:free`.
- `SPEECH_BASE_URL`: default `https://openrouter.ai/api/v1`.
- `FISH_VOICE_WARM`, `FISH_VOICE_BRIGHT`, `FISH_VOICE_DEEP`: optional provider-supported voice identifiers.
- `VITE_HOSTED_SPEECH=true`: frontend enables hosted speech for signed-in accounts.

Confirm the model's supported voice and format options. Free inference may be rate limited or unavailable.

## Rhubarb alignment (optional)

- `api/lipsync` expects the absolute file path of an installed Rhubarb executable in `RHUBARB_BINARY`.
- Optional `RHUBARB_GUEST_ENABLED=true` permits unauthenticated access; enable only behind your own suitable rate limiting and abuse protection.
- Client normalizes dialogue to mono 16 kHz WAV; analyzer returns timed Rhubarb A–H/X mouth cues. Clips store these cues for deterministic seek and replay.
- Without a configured native binary or service, the app falls back to deterministic text-derived mouth timing. **This is not precise audio alignment.**
- A Vercel serverless deployment cannot be assumed to include a native Rhubarb executable. Use a compatible binary layer or a dedicated protected worker/service and adapt the endpoint accordingly.

## Important unfinished work

This branch is an **incremental implementation**, not a full release of the multi-part master prompt. Remaining major items:

- Fully parameterized SVG mouth rig rendering with explicit clipping masks across all character views; currently PixiJS geometry provides the existing mouth rig with analytically bounded teeth.
- Genuine phoneme-level alignment, robust accented/multilingual recognition, and quantified timing calibration.
- Voice caching/version history and waveform editor, advanced audio ducking/fades, music looping.
- Full professional editor-grade multiselect/split/snap enhancements and exhaustive keyboard shortcuts.
- Complete cast/world/prop/audio CRUD, beyond the existing creation/editing controls.
- A scene compiler that can generate every feasible action from a screenplay prompt with reliable continuity.
- Export/browser regression test verification and visual polish audited on all platforms.
- Production-grade rate limiting and async worker hosting for Rhubarb.

## Build validation blocker

The Vercel account reported `api-deployments-free-per-day` (over 100 deployments, 24h restriction). No successful preview build has been verified for the branch; GitHub Actions checks currently report failure and must be investigated before merge. **Do not merge into production until build/tests are green and the new flows have been exercised in a real browser.**

## Quality checks to perform

```bash
npm ci
npm run build
```

Then use browser QA on a preview build: landing → new AI/manual project → insert/resize camera → prop drag in close-up → JSON round trip → AI Director edit → voice regeneration → music import → save/reopen/export. Verify audio cues with a real Rhubarb worker before claiming accurate lip sync.
