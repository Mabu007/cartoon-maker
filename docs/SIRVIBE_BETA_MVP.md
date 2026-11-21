# SIRVIBE — FREE (BETA) MVP release notes

## Public product
- Platform name: **SIRVIBE**. The underlying Toonroom schema, IDs and local storage keys stay unchanged to avoid losing previously authored movies.
- Initial page: premium public landing with the real native starter characters and the official R2 logo located at `toonroom/logo.png`, proxied via `GET /api/logo`.
- Accounts: Firebase Email/Password login and creator signup. Signup saves the display name to Firebase Authentication. Signed-out users can view the public page, but not the editor/projects.
- Pricing: **FREE (BETA)**. No payments or billing setup.

## Creation flows
- Eight editable starter characters, scene worlds, imported image props, eye focus and gesture actions.
- Sit anywhere, with or without an object. An optional object can inform orientation but does not teleport the character or force a placement.
- Visible Actors lane supports placing new characters and timed walk/run entrances and exits.
- Record microphone audio with an on-screen waveform/meter and create mouth cues via the local DSP engine.
- Upload music and SFX from a computer using Audio → Upload music / Upload SFX. MP3/WAV/M4A/WebM/OGG decode support depends on browser; music and SFX can be as long as 20 minutes and are clipped to the current 180-second maximum scene.
- Imported audio is saved to IndexedDB immediately, even when offline. Authenticated project cloud syncing then uploads media to private R2 before the Firestore project transaction. Failed R2 sync preserves device audio and reports a cloud save failure.

## Security / configuration
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` must be present at production build time.
- Firebase Authentication → Sign-in methods → Email/Password must be enabled.
- Firestore per-user project rules are in `firestore.rules`.
- Server-only `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` must be present.
- Set the production origin in R2 bucket CORS for PUT/GET/HEAD and Content-Type, as documented in `docs/R2_V1_RELEASE.md`.
- Keep the bucket private: individual user media is served with short-lived, per-user signed URLs after Firebase token verification. Public brand logo is a single fixed object served by a server proxy.

## MVP limitations and follow-ups
- R2 needs bucket CORS and successful live sign-in upload/download verification.
- R2 object garbage collection, per-account usage quotas, organization collaboration, and user-uploaded video compositing are not shipped.
- Uploaded song/voice media size is currently limited to 20 MB; long media is trimmed to the scene.
- Vercel deployment quota may temporarily prevent a production build; production status must be verified after a merge.
- Tests/build checks and signed-in browser testing should be verified on the *exact* release SHA; a prior green preview is not proof of a later commit.
- Exports remain subject to browser MediaRecorder/codec support.

## Smoke test before inviting beta users
1. Open production in a private browser. See SIRVIBE landing, real starter characters, FREE (BETA) and R2 logo.
2. Create an account with name/email/password; log out and log back in; confirm projects are scoped to the user.
3. Create a scene, add two actors, at 8s walk in a third, then walk them out; verify playback and Actors/Movement lanes.
4. Add Sit without a chair. Place a chair far away and sit again. Verify the actor stays at the authored coordinates.
5. Upload a song and SFX from the computer. Confirm waveforms, playback and cloud-saved cross-device recovery.
6. Record voice with input meter; confirm local DSP lipsync, save/reopen and export.
7. Check R2 signed PUT/GET, Firestore project save, logo response, 16:9 export and Undo/Redo.
