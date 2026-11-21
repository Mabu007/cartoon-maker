import { BlobSource, BufferTarget, Conversion, Input, Output, WEBM, WebMOutputFormat } from 'mediabunny';

/** Write a seekable file from MediaRecorder's streaming WebM clusters without re-encoding. */
export async function finalizeRecorderWebm(recording: Blob, signal: AbortSignal) {
  const input = new Input({ source: new BlobSource(recording), formats: [WEBM] });
  try {
    const target = new BufferTarget();
    const output = new Output({ target, format: new WebMOutputFormat() });
    const conversion = await Conversion.init({ input, output, showWarnings: false });
    if (!conversion.isValid || conversion.discardedTracks.length || conversion.utilizedTracks.length !== 2)
      throw new Error('The recording could not retain both its audio and video tracks.');
    const cancel = () => { void conversion.cancel().catch(() => {}); };
    signal.throwIfAborted();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      await conversion.execute();
      signal.throwIfAborted();
      if (!target.buffer?.byteLength) throw new Error('The recorder returned an empty video.');
      return new Blob([target.buffer], { type: 'video/webm' });
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  } finally {
    input.dispose();
  }
}
