# Toonroom

Toonroom is a browser-based studio for directing editable 2D cartoons. The first launch opens **Who Ate My Food?**, a 30-second living-room comedy with Bra Sbu and Zee. Every actor, shot, sound, and action in the sample can be edited on the timeline.

## Run the studio

```sh
npm ci
npm run dev
npm test
npm run build
```

Use Node.js 22.18+ or 24. The editor runs without service credentials and saves projects in the current browser. Use **Projects** to start a fresh cartoon or reopen a saved one. Choose **Arrange** to place actors and props. Use **Add clip** to direct their performance. Video exports capture all scenes with mixed audio and support landscape, portrait, and square layouts. The render runs in real time at up to 30 fps. Chrome with hardware acceleration is the preferred starting point.

## Connect Firebase and deploy

1. Create or select a dedicated Firebase project and web application. Enable the Email/Password sign-in provider, create Firestore and Storage, and add the Vercel hostname to Authorized Domains.
2. Deploy the repository's `firestore.rules` and `storage.rules` to that project using `firebase deploy --only firestore:rules,storage --project YOUR_PROJECT_ID`. For authenticated browser audio downloads, configure the Storage bucket CORS policy for the Vercel hostname.
3. Set the five `VITE_FIREBASE_*` variables from `.env.example` in Vercel and redeploy. The client Firebase config identifies your app. Firestore and Storage rules enforce access using the signed-in user's UID.
4. Optionally enable hosted speech or story generation with the variables in `.env.example`. Keep provider keys and the Firebase token verification key server-side. The editor comes with an offline-capable Flite speech engine, voice recording and an editable scripted story example. Natural-language story generation requires a compatible provider and a signed-in user.

The project name in the UI is configurable with `VITE_STUDIO_NAME`. The browser stores audio files in IndexedDB and project snapshots in local storage. Cloud projects sync to an owner-scoped Firestore collection, with audio in owner-scoped Storage.

The artwork, scripts, and synthesized sound effects are original to the demo. The included synthetic dialogue and local speech engine use [Flite](https://github.com/festvox/flite). Audio lip sync uses a precomputed amplitude envelope.
