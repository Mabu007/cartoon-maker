# Toonroom V1 R2 setup and release verification

## Media ownership
- Firebase Authentication verifies a user ID token for `POST /api/media`.
- The API only signs R2 keys under `users/<verified UID>/{audio|image|video}/<validated asset ID>`.
- Short-lived 120-second R2 S3 SigV4 PUT and GET URLs come from the server.
- Cloud Firestore stores project *metadata*, timeline clips, private media references, and character data.
- New imported voice, music and SFX go to R2 when the user is signed in. Existing device media remains cached locally. Legacy Firebase Storage audio is read only for migration.
- New world/prop WebP artwork goes to R2 when signed in. Old embedded images are migrated on cloud saves. Guest projects still use local embedded artwork.
- Video uploads are **not yet part of the V1 editor**. The API recognizes video for future integration, but V1 has no video track, streaming renderer or export support. Do not advertise video editing.

## Required Vercel variables
Production **browser config** (public Firebase web application details):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_STORAGE_BUCKET` (optional only for reading pre-R2 Firebase audio; required if migrating old audio)

Production **server-only private credentials**, never prefix with `VITE_`:
- `R2_ENDPOINT` (https://<account-id>.r2.cloudflarestorage.com)
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

The Firebase server verifies ID tokens using `FIREBASE_AUTH_API_KEY` if available, otherwise `VITE_FIREBASE_API_KEY`. The web API key is a public Firebase app config value, *not* a service-account private key. Keep Firebase service-account credentials separate.

## Configure R2 CORS manually

In Cloudflare Dashboard → R2 → your bucket → Settings → CORS policy, add the following and select **Save**:

```json
[
  {
    "AllowedOrigins": ["https://cartoon-maker-theta.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Keep bucket public access **disabled**. If smoke-testing a preview build that uses R2, explicitly add only that trusted preview's origin and use a testing bucket or isolated account; do **not** use `*`.

## Firebase rules
- `firestore.rules` continues to protect `users/{uid}/projects/{projectId}`.
- After successful R2 cutover, publish the repository's updated `storage.rules` in Firebase Storage → Rules: authenticated owners can read legacy audio, but cannot add new media there.
- Do not publish read-only Storage rules *before* releasing a working R2 integration, or older clients will fail uploads.

## Mandatory release acceptance tests
1. Sign in on the production domain, upload a WAV voice, a music file and a sound effect. Confirm they remain after hard reload, reopening the project and switching devices.
2. Upload PNG and SVG artwork as worlds/props, export a short film, reopen on a second device, and download/restore a full offline backup.
3. Confirm unauthenticated POST /api/media responds 401. A user cannot read another user's R2 object. Confirm missing/expired uploads report a recoverable error.
4. Test the R2 bucket's PUT/GET CORS from the actual production origin, using signed-in browser requests.
5. Place two characters at 0 seconds. At 8 seconds add a third one using **Walk in**, verify hidden before 8 seconds, then run an **Exit** and re-enter later. Confirm the timeline and export match preview.
6. Record microphone audio and verify waveform level, stop/start cleanup, preview, lip sync, audio clip editing, and cross-device R2 recovery.
7. Confirm existing Firebase Storage audio and embedded backgrounds from old projects migrate without data loss.
8. Exercise timeline drag, trim, split, copy/paste, Undo/Redo, camera cuts, actor presence rows and Backspace/Delete.
9. Test on desktop, mobile and a low-end laptop in Chrome and Firefox; verify WebGL recovery and 16:9 / 9:16 export.
10. Verify no orphaned media or excessive R2 storage growth across repeated autosaves and project deletion. A garbage-collection lifecycle must be implemented before general public launch.

## Known risks and gates
- Presigned PUT does not enforce the client-declared size at the bucket level. Production requires upload quotas/rate limits and cleanup. Current client-side MIME and size checks are not a substitute for a hard server/storage quota.
- The Vercel preview does not automatically receive Production-only Firebase/R2 secrets. The unit test / TypeScript build proves code quality, not live bucket integration.
- Full browser automation cannot run when the Vercel Sandbox allowance is exhausted. Manual filmmaker QA remains mandatory.
- R2 object deletion/garbage collection, multi-device sync collision handling, and video timeline compositing are not finished. Do not call these complete.
