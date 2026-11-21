# SIRVIBE — Cartoon Studio · FREE (BETA)

SIRVIBE is a browser-based, timeline-first cartoon creation studio. Bring characters to life, upload a world, record voices, add music and SFX from your computer, direct movements and expressions, then export a cartoon movie.

**Production:** https://cartoon-maker-theta.vercel.app/

## How it works
1. Visit the SIRVIBE landing page and create a free creator profile or sign in via Firebase Authentication.
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

## Setup
1. Install Node 22+, run `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in Firebase Web App environment variables.
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
