# Vector Character Studio stage ledger

## Stage 0. Anatomy recovery and production baseline

| Revision | Evidence |
| --- | --- |
| Production baseline at start | `d7783fa7236c3f6f86661efb890ee4304a4b7605`. GitHub `main` and the public Vercel production alias pointed to this commit. The public landing page returned HTTP 200. |
| Recovered work | `83a8f3c0497d2f9811687ca47b1c09789db0c7ac`. Git refs for [draft PR #43](https://github.com/Mabu007/cartoon-maker/pull/43) and its feature branch matched. The merge base was `d7783fa`, with 0 commits exclusive to main and 1 exclusive to the feature. The anatomy work had not merged. |
| Serialization fix | `cbf615e809183a761c77cddaff4e7566913dd952`. Legacy project and character fields stay absent through backup and restore. The explicit anatomy opt-in survives profile edits and can be cleared in the editor. |
| Candidate code under test | `1f8dd6679a94f6b1b13687bad8202749bef4332e`, tree `c31ab4eecab348856ce09f6539e19537b90bb4ab`. The code sits on the inspected main ancestry. Documentation and QA images follow in the evidence commit. |

### Failure diagnosis

- Original hosted [GitHub Actions run 463](https://github.com/Mabu007/cartoon-maker/actions/runs/46030880924) recorded a failed `verify` job. The [check annotation](https://api.github.com/repos/Mabu007/cartoon-maker/check-runs/140614049055/annotations) identified an account billing lock. GitHub returned empty job steps, no artifacts and a missing log blob. The original [Vercel preview build log](https://vercel.com/mabu007s-projects/cartoon-maker/ExBndbuuT4PNzYyVT8cNhNA9pUtq) was available and showed 441 passes and one failure in `visualAssetStorage.test.ts`. The same test failed locally with `npm run build` and on Node 22 with `npm test`. The legacy profile constructor inserted an own `limbArt: undefined` property, which JSON omitted. Restoring the backup therefore changed the character object's shape. The fix only sets the property when the project opts in. The unchanged backup regression test now passes.
- [GitHub Actions job 140630049236](https://github.com/Mabu007/cartoon-maker/actions/runs/46035590311/job/140630049236) for the serialization fix has a [check annotation](https://api.github.com/repos/Mabu007/cartoon-maker/check-runs/140630049236/annotations) that says the account billing lock prevented the job from starting. The [Vercel preview for that SHA](https://vercel.com/mabu007s-projects/cartoon-maker/7MxsyGWgqZC2taqD5jhUhDHckseA) independently completed with all 442 tests passing.
- Studio Sbu's boots sometimes grew across the Pixi character preview and covered the scene. The behavior also affects the existing wardrobe transform code on main. A non-identity graphics context transform recursively mutated nested path instructions shared with the SVG path cache. The render helper now applies local transforms to independent instructions before queuing the path. A regression test exercises both toe directions and the actual Studio Sbu foot-size transform across repeated draws. Its first repeat failed on the original code and it passes on the candidate.

### Local verification

| Check | Observed result |
| --- | --- |
| npm from the repository lockfile | `npm ci` installed successfully. The workflow uses Node 22 and npm. The candidate build used Node 22.23.5 with npm 11.19.1 in Debian 13. |
| Full tests, TypeScript and production bundle | `npm run build` passed all 443 tests and ran `tsc --noEmit` and Vite successfully. Vite reported dependency annotation and chunk-size warnings. |
| Offline bundle | `npm run verify:offline` verified manifest `750fadc72b340df07c72`, 59 files and 3.42 MiB, including lazy chunks, DSP worker and video exporters. |
| Legacy storage | Existing portable backup, restoration and device project tests passed. The browser smoke used a new browser profile and a fixture through the public app import. |
| Linux Chromium visual, offline and performance evidence | [Browser evidence](../visual-assets/qa/anatomy-baseline/README.md). |
| Offline video export | Rendered and downloaded a three-second 720p WebM from the built app while offline. FFprobe confirmed 30 fps video and an audio stream. |

### Release gate

Stage 0 is blocked on a successful GitHub Actions run for the candidate. The hosted runner rejected the previous candidate before launching its job. Keep PR #43 in draft until the hosted checks can run and pass. Production is still verified at the starting baseline. A live webcam, the target N4020/UHD 600 laptop and target-device memory behavior are unverified.

See [architecture decisions](architecture-decisions.md) for inventory and [the staged roadmap](roadmap.md) for next-stage contracts.
