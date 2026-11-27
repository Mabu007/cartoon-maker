# Vector Character Studio roadmap

Stages 0–14 converge in [consolidation PR #59](https://github.com/Mabu007/cartoon-maker/pull/59). Consult the [stage ledger](stage-ledger.md) for evidence tied to revisions and the [acceptance matrix](consolidation-acceptance.md) for open release gates.

| Stage | Candidate scope |
| --- | --- |
| 0–2 | Recover native Bézier anatomy, establish canonical vector artwork, and validate the Studio Sbu and Studio Zee character direction. Professional model sheets and action review remain open. |
| 3–5 | Character DNA and morphology, facial identity and lip-sync geometry, layered hair. |
| 6–7 | Modular garment fit and pose-aware primary contour deformation. |
| 8–9 and VVLE | Fixed-step Living Vector Engine, bounded character response, and optional volumetric surface lighting. |
| 10–11 | Coordinated procedural acting and Character Factory auditions and editing. |
| 12–13 | Reusable native vector packages and an optional schema-derived external asset specification. |
| 14 | Living vector worlds, shared environmental forces and native props with existing contact anchors. |
| Consolidation | Validate the combined application, clear required hosted CI, document limitations and release the intended commit through the existing production project. |
| 15 | Parametric Deformation Engine. Start after consolidation. See the [interface inventory](architecture-decisions.md#002-consolidate-the-stage-14-stack-before-adding-new-deformation). |

The release workload is a two- or three-character 720p scene in Chromium with dialogue, authored movement and camera, including an opt-in physics and lighting variant. Record p50 and p95 frame times, memory, seek time and active solver complexity on the N4020, UHD 600, 4 GB Linux laptop before certifying its 30 fps target. Record live webcam and long editing sessions separately.
