# Toonroom — Part 5: Speech and Audio Production

## Provider verification (20 Nov 2026)
OpenRouter publicly lists `fish-audio/s2.1-pro-free:free` as a free **text-to-speech** model (for development/prototyping; no production SLA), with audio output. OpenRouter documents `POST https://openrouter.ai/api/v1/audio/speech`, `model`, `input`, provider-specific `voice`, and `response_format: "mp3"` with raw audio response (not JSON). Voice IDs are model-specific; the Fish speech API advertises voice as an unpublished/unknown list. **An authenticated request returning playable bytes was not performed**. Set server environment `OPENROUTER_API_KEY` and `FIREBASE_AUTH_API_KEY`; optional `SPEECH_MODEL`, `FISH_VOICE_WARM`, `FISH_VOICE_BRIGHT`, `FISH_VOICE_DEEP`. Opt into hosted generation using the public UI flag `VITE_HOSTED_SPEECH=true` when Firebase Auth is enabled.

Source: https://openrouter.ai/fish-audio/s2.1-pro-free:free and https://openrouter.ai/docs/guides/overview/multimodal/tts .

No provider key is bundled into the client. `api/speech.ts` uses an authenticated server-side request, validates errors and the actual MIME/byte count, and uses a fixed provider endpoint. The browser client falls back to the existing local flite-WASI engine when hosted generation is unavailable. Model voice IDs must be tested in the deployed account; do not invent them.

## Voices and clip-level regeneration
`CharacterDefinition.voicePreset` and optional `hostedVoiceId` persist per character across scenes. Character Editor exposes both. New Audio Dialog uses the selected actor's persistent voice preset and ID. Each dialogue clip stores its voice preset. VoiceClipControls provides Generate Voice, Regenerate Voice, clip playback, and archived-version restoration. A successful replacement updates only that clip, preserves the old recording in at most five version slots and retains original sound until synthesis, decoding, duration validation and lip sync finish. Explicit Regenerate bypasses the content-addressed IndexedDB speech cache.

Length increases may extend the scene up to 180 seconds if no new dialogue collisions occur. If an overlap would be introduced, the edit is rejected without altering existing audio. A failed operation keeps the previous clip/audio. Undo/Redo uses the canonical project store.

Original and archived generated recordings are included in cloud upload and portable .toonroom backup, with asset remapping on restore. Cloud downloads continue to use the existing authenticated Firebase Storage path.

## Mixer
Three distinct existing tracks: Dialogue, SFX and Music. Clip controls provide volume, mute, offset, fade-in/out and loop (SFX/music). Tracks additionally support mute/solo. `src/engine/audioMix.ts` applies the same deterministic gain automation in real-time preview and offline export: music ducks to ~38% during audible dialogue with ~90ms attack and 220ms release; multiple speaking clips combine without pushing music back up. All clips stay overlappable unless a newly lengthened dialogue would create an unintended dialogue collision.

## QA and limitations
`tests/audioProduction.test.ts` covers per-clip regeneration, versions, collision recovery, audio references, undo, track solo, ducking, fades, loops and persistent voices. Run `npm ci && npm run build`, then generate and regenerate a line, deliberately trigger a provider failure, upload SFX/music, preview, save/reopen, restore versions, and export a mixed file.

Browser Computer Use is not exposed in this chat session. GitHub Actions preexisting CI fails near-instantly without logs. **Do not claim runtime/production QA or authenticated voice inference passing** until exercised. Stop after Part 5.

Solo/mute are applied through `audibleAudioTrack` consistently in the deterministic scene evaluator (mouth movement), preview audio envelopes, real-time playback, and offline export. Voice cache keys now include backend identity; a local WAV fallback is never reused as a permanent hosted response. Fish requests only use documented speech endpoint parameters, with voice IDs supplied where configured.
