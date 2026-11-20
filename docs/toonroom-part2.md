# Toonroom — Part 2: Canonical movie timeline and AI context

## Canonical document

- The existing **ProjectDocument (version 1)** in `src/engine/schema.ts` remains the only project document. The renderer, timeline controls, editor, persistence and undo store all read or update that document.
- The code interchange envelope `{ "format": "toonroom-timeline", "schemaVersion": 1, "project": { ... } }` is a lossless serialization of the ProjectDocument. It is not separate persisted state.
- Scene Code Mode retains the prior `{ "schemaVersion": 1, "scene": { ... } }` shape and accepts bare scenes.
- Historical full ProjectDocument JSON with missing `version` or `version: 0` upgrades to version 1 if and only if it passes the current strict validator. Unknown versions and unsupported shape changes fail closed. Local/cloud reads and backup restoration use this parser.
- Track times use seconds. Optional movement spatial keyframes use normalized fractions 0 to 1, with strictly increasing times and required endpoints. The same evaluator samples these for preview and prop placement. Other custom bone/pose keyframes are not supported.
- Audio files are stored separately from JSON. Code Mode rejects newly invented audio IDs; users must attach audio in the studio.

## Workflows

1. Open the timeline's **AI Context** menu. Copy Scene-Building Context, Current Scene JSON or Entire Project Timeline JSON, or open Code Mode.
2. Paste context to a model, request valid scene JSON (using only actual IDs), copy its answer.
3. Choose scene or entire movie in Code Mode, paste, validate, apply. Changes are an atomic store edit with Undo/Redo and existing device/cloud autosave.
4. Reopen Code Mode to inspect exactly what the visual editor saved; playback reads the same document.

Code Mode preserves separate unsubmitted drafts when changing between scene/movie tabs. Stale documents are rejected rather than silently overwriting edits made in another UI.

## MCP readiness

Pure helpers `parseSceneCode`, `parseMovieCode`, `validateSceneReplacement`, `validateMovieReplacement` and `applyTimelineEdits` can be wrapped in future authorized RPC/MCP tools. **No MCP server has been implemented or claimed**; auth, policy, concurrency, transport and audit controls would still be required.

## Verification

Run `npm ci && npm run build` (build includes Node tests, TypeScript and Vite). Regression tests are in `tests/movieTimeline.test.ts`, `tests/timelineCode.test.ts` and the existing test suite. Browser-based interaction, live cloud save and real media playback are separate integration checks and must not be claimed without running them.
