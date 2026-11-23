# SIRVIBE — Cartoon Studio · FREE (BETA)

SIRVIBE is a browser-based, timeline-first cartoon creation studio. Bring characters to life, upload a world, record voices, add music and SFX from your computer, direct movements and expressions, then export a cartoon movie.

**Production:** https://cartoon-maker-theta.vercel.app/

## Run locally (no Firebase account required)

SIRVIBE now opens directly into **My cartoons** when you run the Vite development
server at `http://localhost:5173`. The local workspace needs **no Firebase
project, API keys, internet account, email, or password**.

```bash
git clone https://github.com/Mabu007/cartoon-maker.git
cd cartoon-maker
npm ci
npm run dev
```

Open `http://localhost:5173` on the same computer. Select an existing cartoon
or create a new one; saved projects persist in this browser's IndexedDB and
large media in OPFS/IndexedDB. **The local workspace is convenience access,
not a password-protected account.** Back up important movies with **Download
project backup**, as clearing browser/site data can erase local projects.

Use `localhost` or `127.0.0.1` rather than a network IP. The local mode is
restricted to development loopback origins and does not disable cloud
authentication for the public production deployment. The existing `guest`
project namespace is retained, so previous local projects remain accessible
in the same browser and origin. Firebase settings are unnecessary for this
workflow.

For optional fully offline webcam performance tracking, install models while
online with `npm run assets:performance`, then restart the dev server.

## Local MediaPipe performance capture troubleshooting

SIRVIBE loads `public/mediapipe/vision_bundle.mjs` as a **static asset**
rather than importing it as a Vite source module. This is necessary because
Vite 7 rejects direct JavaScript imports from the `public/` directory.

For fully local capture (body, hands, optional facial expressions):

```bash
npm run assets:performance
# Stop the running dev server with Ctrl+C, then restart:
npm run dev -- --host 127.0.0.1
```

Open `http://localhost:5173/` and use **Performance → camera icon**.
The character and webcam appear side by side. Select **Front**, **¾ Front Left**
or **¾ Front Right** in Performance Studio to choose the cartoon's direction
independently of your webcam posture. These are slight three-quarter turns,
not full side profiles. You can change this again after
recording in the take's **Inspector → Facing for this take**. Each saved take
remembers its direction; older takes continue to inherit the actor's facing. On 4 GB laptops facial tracking
starts **off** to reduce inference load; enable `Track face` in Performance
Studio *before* starting the camera if you need recorded facial expressions.
The hand and face models are staggered across frames to avoid simultaneous
CPU spikes.

If the tracker still reports a missing bundle, run
`curl -I http://localhost:5173/mediapipe/vision_bundle.mjs` and confirm
HTTP 200; then refresh the browser with Ctrl+Shift+R. A 404 indicates
that the local model assets were not installed correctly. Only the browser
can authorize camera and microphone access; this is not a Firebase login.

## Cinematic Camera Director

From **Movie timeline → Add → Camera**, select your shot from the grouped
**Shot size / classic preset** menu, optionally layer a separate
**Subject framing / perspective** (for example, Medium Close-Up + OTS).
Pick an actor or prop as the focus, then choose a **Camera angle**,
**Camera movement**, and **Cut / Glide**. Edit any
camera clip afterward in its Inspector; movement intensity and Dutch tilt
are adjustable there. Only one camera clip is active at any instant.

Shot sizes include Extreme Wide, Wide, Full, Medium Long, Cowboy, Medium,
Medium Close-Up, Close-Up, Big Close-Up and Extreme Close-Up. Subject framing
includes Establishing, Master, Two/Three/Group, OTS, POV, Insert, Cutaway,
Reaction and Shot / Reverse Shot. Camera motions include pan, tilt, dolly,
truck, pedestal, zoom, whip pan, crane, handheld, Steadicam and gimbal.

**2D limitation:** overhead / low / high aerial viewpoints and dolly zoom
are stylized reframing effects in the existing flat cartoon universe, not
literal 3D perspective or physical lens optics. No additional renderer or
AI model is required. Existing camera clips remain compatible.

## How it works
1. Open the local studio without signing in, or visit the public landing page and optionally create a Firebase account for online backup.
2. Start a project with eight customizable starter characters (including Bra Sbu, Zee, Naledi, Milo and others) and a scene.
3. Place characters, schedule a walk/run entrance, sit anywhere, adjust movement and camera clips, and record dialogue.
4. Upload your own music or SFX, inspect the waveforms, preview and export the movie.

## Architecture
- React, TypeScript, Vite, PixiJS and Zustand.
- Deterministic animation, camera, and audio timeline.
- Local browser recorder with Web Audio waveform and DSP mouth animation.
- Firebase Authentication and Firestore for per-user project data.
- Cloudflare R2 for signed-in image/audio assets, via a Firebase ID-token authenticated server signing endpoint.
- Official logo served publicly from **`toonroom/logo.png`** in the private R2 bucket through **`/api/logo`**. All user media remains private.
- Guest/legacy offline data keys and Toonroom backup JSON format are retained for compatibility.

## Cloud deployment setup (optional for local development)
1. Install Node 22+, run `npm ci`.
2. For public Firebase sign-in and cloud backups only, copy `.env.example` to `.env.local` and fill in Firebase Web App environment variables.
3. Configure Vercel **Production** environment variables matching `.env.example`. R2 secrets remain server-only.
4. Set your private R2 bucket's CORS policy to allow production origin GET/PUT/HEAD and the Content-Type request header, as described in [R2 setup](docs/R2_V1_RELEASE.md).
5. Enable Firebase Email/Password Authentication and publish `firestore.rules`.
6. Run `npm run build` (tests + TypeScript validation + Vite). To develop locally, use `npm run dev`.

## MVP scope
- Customizable built-in characters, worlds, props and full timeline editing.
- Movement/entrances/exits, action poses, expressions, eye focus, voice capture, live waveform, music/SFX import.
- Camera shots, save/reopen/export, project backups.
- Music and sound effects from a computer currently have a 20 MB upload limit; long media is trimmed to the active scene duration.
- User-uploaded video compositing, advanced R2 asset lifecycle cleanup, quotas and team collaboration are out of scope for this beta.

**Important:** Project data uses existing internal `toonroom.*` storage keys and legacy `toonroom-backup-1` identifiers so rebranding does **not** delete or invalidate previous movies.

The product was previously developed under the name Toonroom. SIRVIBE is its public-facing brand.
