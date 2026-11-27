# Stage 0 browser and performance evidence

Captured on 27 November 2026 with candidate source tree `c31ab4eecab348856ce09f6539e19537b90bb4ab`.

| Capture | What was exercised |
| --- | --- |
| [Studio Sbu](studio-sbu.jpg) | Front, three-quarter front, side, three-quarter back and back. Separate frames show the walk, sit, wave and talk auditions. The boots stay at foot scale across repeated draws. |
| [Studio Zee](studio-zee.jpg) | The same five views and four auditions. |
| [Stage and offline playback](stage.jpg) | The built-in living-room film with the Studio avatars. At 1.20 s Sbu walks while Zee sits and holds the cup in her right hand. At 9.45 s Sbu speaks in close-up. At 17.60 s he points while Zee keeps the cup. The evaluation returned five distinct mouth shapes during Zee's first line. |
| [SVG fallback](svg-fallback.jpg) | Triggered the character preview's WebGL context-loss handler in the built app. Both characters switched to SVG and rendered the authored path layers. |

The screen captures show the existing overlap of the bent legs in the isolated sit audition. The timeline fixture tests Zee seated on the sofa with a held cup. SVG shows simpler hair, face, wardrobe and shoes than the stage. No live webcam was connected.

## Offline playback

1. Imported a test copy of the built-in demo through the production-build UI. The fixture has Studio Sbu and Zee with `anatomical-v1`.
2. Confirmed that the browser's service worker controlled the page and Cache Storage contained `sirvibe-shell-750fadc72b340df07c72`.
3. Disabled network access in the browser context. Reloaded into My cartoons, reopened the imported project from IndexedDB and verified the anatomy setting on Zee.
4. Played the movie beyond 0.75 s while offline and captured the stage. No uncaught page errors were reported.

A separate three-second crop of the same fixture exported through the built app with the browser network disabled after precache. The downloaded WebM measured 1280 × 720 at 30 fps, with VP8 video and Opus audio. FFprobe reported 3.02 s and 1,533,449 bytes. FFmpeg measured a non-silent audio track at −14.4 dB mean volume.

## Benchmark conditions

Debian 13 x86-64, Linux 6.18.57, AMD EPYC 7763, nine visible logical CPUs and 9,967 MiB visible memory. Chromium 158.0.8127.0 used ANGLE WebGL through Vulkan SwiftShader in a headless browser. Browser viewport was 1440 × 1000 at device scale 1. The Pixi capture-mode canvas was 960 × 540. One 30 s scene used two actors, eight props and 44 timeline clips. Built-in art, camera cues and subtitles were active.

To reproduce the comparison, load the modules from Vite, build the fixture using `makeProject(true)` and replace its two actors' character records with `studioCharacters` while retaining the original IDs. Use `createRenderer('16:9', 1, true)` and `draw(scene, characters, time, { subtitles: true })`. For legacy samples, omit only `visual.limbArt` from each preset. Warm up for 60 draws and time 160 at sampled 24 fps scene times between 0.20 s and 4.16 s. Repeat in legacy, anatomy, anatomy and legacy order. The timing covers synchronous evaluation, drawing and command submission. It excludes a GPU-completion wait, the playback clock and audio mixing.

| Run | Samples | Median draw | 95th percentile draw |
| --- | ---: | ---: | ---: |
| Original illustrated 1 | 160 | 7.2 ms | 13.7 ms |
| Anatomical v1 1 | 160 | 8.0 ms | 19.9 ms |
| Anatomical v1 2 | 160 | 7.6 ms | 17.4 ms |
| Original illustrated 2 | 160 | 7.1 ms | 16.6 ms |

After the scene initialized, Chromium DevTools reported 41.5 MiB used JS heap before the four timed runs and 41.8 MiB after. Browser API heap values were coarse. Process RSS, GPU memory, sustained playback and target hardware remain unmeasured. The anatomy renderer took longer in both observed median runs. Use these figures as a headless Linux comparison and confirm performance on the Celeron N4020 with 4 GB RAM and Intel UHD 600.

[Raw browser results](browser-results.json)
