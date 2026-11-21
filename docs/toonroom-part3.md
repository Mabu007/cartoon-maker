# Toonroom — Part 3: Professional timeline editor

The visual editor still operates on the exact scene/project documents from Parts 1–2. Timeline edits use the existing Zustand history, project validation, undo/redo and autosave paths.

## Interactions
Single click, Shift range selection and Ctrl/Cmd toggle; multi-clip drag and edge resize with preview; split, copy/cut/paste, duplicate, delete and right-click clip commands. Audio and music clips may change tracks; incompatible moves are rejected. Drag Actions and built-in SFX from the asset library into compatible lanes. Markers can be added by double-clicking the ruler and removed by right-clicking them.

Snapping uses playhead, clip edges and markers, is switchable, and has a pixel tolerance. Ruler scrubbing uses pointer capture. Timeline zoom (1–9×), fit width, and both-axis scrolling are independent from actual scene duration. Duration inputs shrink safely by trimming crossing clips and removing those past the end, as well as out-of-range markers.

Each track can mute, lock, collapse/expand; these settings live in the canonical scene document. Muting affects actual evaluation and audio scheduling. Clip audio still remains included in project backup even when its track is muted.

## Mandatory Backspace behavior
Backspace and Delete remove the selected timeline clip(s), or the selected interior keyframe, including when a clip or keyframe has keyboard focus. Edits in inputs, textareas, contenteditable controls, and code editors are excluded. First/last movement keyframes cannot be removed (they are required for a valid animation path).

## Shortcuts
Space play/pause, Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z or Ctrl+Y redo, Ctrl/Cmd+C/X/V copy/cut/paste, Ctrl/Cmd+D duplicate, S split, Ctrl/Cmd+A select all when the timeline has selection or focus, Backspace/Delete remove, Escape clear, +/− zoom when clip focused. The timeline contains a shortcut help popover.

## Verification
Regression tests are in `tests/timelineEditing.test.ts`. Run `npm ci && npm run build`; then manually test browser drag, trim, split, delete, undo/redo, zoom, scrubbing, desktop, narrow screens and touch. CI has been failing immediately on the original branch before Part 3 and cannot yet supply execution logs. Real Computer Use browsing is not exposed to this Chat-mode tool session. Do not treat tests as verified passing until executed.
