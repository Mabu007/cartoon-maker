# Vector Character Studio staged roadmap

The current work is Stage 0. Later stages below record proposed contracts for review. The [stage ledger](stage-ledger.md) holds completion evidence.

| Stage | Deliverable | Contract and gate |
| --- | --- | --- |
| 0. Anatomy recovery and baseline | Integrate the existing four contours and their optional schema choice from PR #43. Capture preview and stage evidence for Studio Sbu and Zee. | Preserve prior project and rig behavior. Verify tests, build, hosted CI, offline reopen, five saved views, walking, sitting, gestures, speech and hand custody. Record device and browser details. Record the deployed revision if release is approved. |
| 1. Vector artwork contract | Define versioned bone-local geometry, paint and view assets, fixture characters and deterministic validation. | Resolve the same pose, facing, paint and layer inputs repeatably. Bound parsed geometry and cache entries. Require backward-compatible reads and a representative fixture comparison with Stage 0. |
| 2. Editable character assembly | Use the contract for modular silhouettes and supported body edits. Validate familiar actions and turns before extending the asset catalog. | Preserve joint, hand and shoe pivots, two-hand custody, layer order, lip-sync timing and camera selection. Test selected fallback/export features and imported raster slot compatibility. |
| 3. Outfit and artwork authoring | Add validated native variant authoring and import for agreed character, garment and prop art. | Declare slot coverage, fit, masks, dependencies and fallbacks. Confirm packages stay portable and usable offline. Check renderer cache bounds on a realistic scene. |
| 4. Production verification | Validate a complete film through preview, edit, backup, restore and export on supported browsers and the target laptop. | Record repeatable motion and visual fixtures, frame-time distributions, memory under sustained play, optional local vision assets and a live recorded take. Use the target workload to set budgets before optimizing or expanding defaults. |

## Handoff inputs for Stage 1

1. Use the Stage 0 fixture and timings for an initial same-scene comparison. Add a matching Linux Chromium capture on the Celeron N4020, 4 GB RAM and UHD 600 before using them as release budgets.
2. Specify path units, pivots, five-view identity and fallback behavior with actual examples. Keep imported artwork's existing contract readable and keep project storage version changes explicit.
3. Verify that vector draw operations consume solved pose, view and character data and preserve hand ownership, contact frames and dialogue cue precedence.
4. Keep live capture, timeline evaluation, storage, offline caching and export as integration boundaries. Require separate implementation and validation for the next stage.
