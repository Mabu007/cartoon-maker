# Toonroom — Implementation Part 8: Conversational AI Director & Timeline Tools

## Product behavior

The existing AI Director panel is now a **real editor** for the canonical scene timeline. The right inspector uses the same `ProjectDocument` scene as the timeline, evaluator, Code Mode, save/reopen and export. It does not generate JavaScript, claim fictitious MCP integrations, or silently alter a screenplay.

**Request → validated structured edit proposal → staged stage preview → Apply / Reject → one Undo step.** The Director can handle multi-beat requests such as “Make Zee look at Sbu while he talks, then show a close-up of Zee looking annoyed.” It resolves the actors from the live cast, takes cue times from the existing dialogue, creates explicit gaze + face + camera clips and presents the proposed edits for review. A conflicting camera shot must be explicitly resized/replaced or the proposal is rejected; no auto-trimming of manually directed shots.

The Director's current context includes the project, story bible, active screenplay scene, all live timeline clips, actor/prop/clip selection, actor and prop names/IDs, camera evaluation, playhead, available audio asset IDs, clip geometry and recent turns. The model receives the actual JSON Schema. The two-attempt model call allows one retry with a precise validation error when it proposes an invalid scene.

## Typed operation language

`src/engine/filmmakerAI.ts` validates the AI response with a **discriminated union** and strict nested schemas. `src/engine/timelineAI.ts` executes the proposal as an atomic scene transform, then validates against the actual `ProjectDocument`.

- `insert`, `replace`, `remove`: complete typed timeline clips.
- `update_clip`: only whitelisted, track-specific fields, such as timing, movement coordinates, expression, shot, actor focus, audio volume/mute/offset. Cannot rename a clip or switch track.
- `place_actor`: real cast actor position, rotation, view, gaze target and expression (not speculative characters).
- `place_prop`, `add_prop`, `remove_prop`: manipulate supported existing or built-in stage props; incompatible references and duplicate IDs are rejected.
- `place_scene`: safe changes to scene title, duration and built-in environment.
- `speak`: generate a new line or replace one actor's existing voice clip. It **does not generate audio on proposal**. Only when the user applies does it synthesize the single requested line through the existing voice provider, check recorded duration and dialogue overlaps, run Part 6 analysis, store the audio asset, and preserve earlier audio versions. If synthesis or validation fails, the canonical scene remains unchanged.

Do not permit invented audio assets. Audio clips can only use currently available IDs; new speech IDs are accepted only when produced and stored by this Apply operation. Overlong or colliding dialogue is rejected, and existing audio remains intact on failed regeneration. Respect muted/locked tracks and actor/prop references. No user-generated shell commands or model-executable code are involved.

## Preview, code and manual control

The preview uses an in-memory `Scene` projected through Toonroom's actual Pixi evaluator without changing Zustand's canonical project. The inspector lists each operation, shows the temporary result at the real playhead and explicitly labels the stage **AI PROPOSAL PREVIEW · NOT APPLIED**. The stage cannot be dragged while reviewing the proposed scene. **The transport's Play/Pause/Seek also auditions the proposed scene's own timeline and already available audio**, stopping at its end (or looping if enabled), while leaving the canonical movie untouched. New `speak` recordings are deferred until Apply, so they cannot be previewed audibly beforehand. Reject stops any staged playback and restores the original scene. Apply runs the same validation as Code Mode, persists through the existing store, and produces one Undo/Redo snapshot. Actor, prop and clip context is updated as selections and playhead change; a late response from a closed scene or a changed cast is rejected.

Directing no longer depends on the screenplay being approved. A screenplay line edit stores a revised screenplay draft without silently recompiling and overwriting manually authored animation clips. The screenplay remains creative context; compilation is a separate deliberate workflow. When a dialogue transcript changes it must be regenerated to avoid pretending an old recording says new words.

The Director can **Copy AI context** using the real `sceneBuildingContext`, including generated JSON Schema; Timeline Code Mode presents the same scene and validates JSON using `parseSceneCode`. After Apply, AI edits appear as ordinary visual timeline clips and in exported scene JSON.

## Tests and honesty

`tests/aiDirectorProduction.test.ts` contains **eight** integration/regression tests, including five substantive simulated director conversations:

1. Sbu speaking; Zee looks at him, reacts angrily and receives a non-overlapping close-up camera shot.
2. Zee walks across the stage and waves.
3. Sbu glances nervously at a real prop, then points.
4. A single dialogue clip is regenerated *after* approval, original recording preserved, and Undo restores the previous version.
5. Scene/prop recomposition with concrete SFX and music clips.

Three more tests reject unknown cast/prop/asset references, camera overlaps, locked tracks, unsupported clip properties, dialogue asset mismatches, colliding generated lines and excessive speech duration.

**Important distinction:** These use a deterministic in-process `CreativeModel` adapter returning realistic structured model operations, then invoke the production model JSON parser and canonical edit executor. They are **not five live hosted-model calls**, and do not prove provider parsing quality. For live verification, connect a valid AI provider and repeat the five prompts in a running browser, inspecting the staged preview, Apply/Reject, resulting timeline Code Mode, Undo, saving and reopening.

## Release limitations

The work is committed to `feat/toonroom-production-overhaul` under draft PR #6. A GitHub Actions `verify` job still fails without usable logs. A requested Vercel preview deployment was blocked by the **Hobby daily deployment limit** (HTTP 402 `api-deployments-free-per-day`), and this chat does not provide interactive browser Computer Use. No successful `npm ci && npm run build`, five real hosted AI conversations or production browser stage checks were completed on the current Part 8 HEAD. The PR remains draft until CI, live provider and browser QA can be completed.

**Stop after Part 8/10.**
