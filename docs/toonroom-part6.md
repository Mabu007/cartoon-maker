# Toonroom — Implementation Part 6: Real Rhubarb lip-sync

## Evidence-based CLI contract
Official Rhubarb Lip Sync v1.14.0 supports WAV/OGG input, English `pocketSphinx` and language-independent `phonetic` recognizers, `-d transcript.txt`, `-f json`, and `--extendedShapes GHX`.
Output JSON: `{ metadata:{duration}, mouthCues:[{start,end,value:'A'..'H'|'X'}] }` where timestamps are **source-recording seconds**, not timeline clip seconds. Official:
https://github.com/DanielSWolf/rhubarb-lip-sync/blob/master/README.adoc
https://github.com/DanielSWolf/rhubarb-lip-sync/releases/tag/v1.14.0

Mapping is based on Rhubarb's actual A–H/X definitions, not unrelated phoneme-labelled mappings:
A=bilabial closure (M/B/P), B=slightly-open clenched teeth, C=open, D=wide open, E=rounded, F=pucker, G=lower lip to upper teeth (F/V), H=raised tongue (L), X=idle/rest/silence.
Toonroom maps these to `closed/wide/open/open/round/pucker/bite/tongue/rest`, and stores intensity for intermediate openings. Closed consonants retain full weight, gaps insert explicit rest.

## Deployed architecture
1. Each generated, uploaded or microphone recording is decoded in-browser and resampled into a **16 kHz mono 16-bit PCM WAV** (max 120 seconds / 5 MB normalized); original audio remains intact.
2. The `/api/lipsync` endpoint authenticates Firebase bearer tokens by default, enforces length/header/recognizer limits, and runs either configured native `RHUBARB_BINARY` or a private dedicated worker at `RHUBARB_WORKER_URL`. No client-controlled command, binary path, or worker URL.
3. The worker in `workers/rhubarb/` is **real** Node+native CLI, not a stub. It downloads official Rhubarb v1.14.0 Linux with its model resources at image build time, limits concurrent executions to two, imposes a 40s subprocess timeout, validates WAV and returned cues, cleans temp directories, and requires a 32+ character private `WORKER_TOKEN`.
4. Client validates the returned JSON and persists only **successful Rhubarb** alignments in IndexedDB under SHA256(audio original bytes + normalized transcript + recognizer + analysis engine version). In-flight same-key requests coalesce. Failures use text-estimated cues labeled `estimated` and are **not cached**, allowing a later retry.
5. Each dialogue clip and archived version stores `visemes` plus `lipSync:{source,engine,cacheKey?,analyzedDuration}` in canonical scene JSON. Portable backups/cloud sync already preserve this metadata; changing start, duration, position or offset does not invalidate the original source-audio cue cache.
6. Rendering uses `sourceAudioTime = sceneTime - clip.start + clip.offset`, driven in preview by `AudioContext.currentTime` and in offline export by fixed sample timestamps. Pauses stop audio sources, seeking reschedules sources, trimming advances offset, and gaps/rest close the mouth. SFX and music remain separate.
7. The Inspector shows **Rhubarb · Audio aligned**, **Estimated · NOT audio aligned**, or **Legacy cues · Unverified**. Existing clips can be analyzed without regenerating voice; choose PocketSphinx (English) or phonetic (other languages). A replaceable analyzer adapter permits future phoneme-grade aligners.

### Deployment on a Docker-capable host

```bash
docker build -f workers/rhubarb/Dockerfile -t toonroom-rhubarb .
docker run -d -p 8788:8788 -e WORKER_TOKEN='<32+-character-random-server-secret>' toonroom-rhubarb
```

Expose the worker only through HTTPS behind your host's TLS terminator. Configure these secrets on the **Toonroom server only**:
- `RHUBARB_WORKER_URL=https://your-private-worker-host`
- `RHUBARB_WORKER_TOKEN=<same private token as WORKER_TOKEN>`
- `FIREBASE_AUTH_API_KEY` for signed-in authenticated requests

Alternately on a compatible host set `RHUBARB_BINARY=/absolute/path/to/rhubarb` and retain the native resources next to the binary. For local *private development only*, `RHUBARB_GUEST_ENABLED=true` permits guests; do not enable anonymous costly compute in production without rate limiting and abuse controls.

The Docker image downloads official Rhubarb (about 87MB); check platform architecture, OS libraries, licensing and provider image-build permissions before deployment. This is a Docker worker, **not** a Vercel serverless binary bundled into the Vite app.

### Verification commands

```bash
npm ci
npm test
npm run build
RHUBARB_BINARY=/absolute/path/to/rhubarb node scripts/smoke-rhubarb.mjs
```

`tests/lipSyncProduction.test.ts` covers genuine Rhubarb JSON, all shapes, invalid cue rejection, silence gaps, M/B/P closures, seeking, offset trimming, moving clips, frame parity, cache key invalidation, parallel requests, uncached error fallbacks, provenance and voice version restoration.

The native smoke script analyzes **three real bundled clips**, `sbu-food.mp3`, `sbu-lunch.mp3` and `zee-safe.mp3`, using ffmpeg and a real Rhubarb binary; it exits non-zero for malformed cues.

## Current verification limitations
The dedicated Docker worker has been implemented but not yet built or deployed to an accessible runtime in this session. Vercel Hobby had exceeded the daily deployment cap; GitHub Actions had preexisting fast-failing checks. Thus actual browser playback/visual inspection, Docker smoke, and full TypeScript+build success require execution in an environment with dependencies, the native binary, and available build capacity. No estimated result should be described as true Rhubarb alignment.
