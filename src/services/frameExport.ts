import { AudioBufferSource, BufferTarget, CanvasSource, canEncodeAudio, canEncodeVideo, Output, WebMOutputFormat } from 'mediabunny';
import { locate, MOVIE_FRAME_RATE, projectDuration } from '../engine/evaluate.ts';
import { createRenderer, dimensions } from '../engine/renderer.ts';
import { createAudioMixer, mixOffline } from './audio.ts';
import { exportScale, type VideoExporter } from './exportTypes.ts';

export class UnsupportedFrameEncoder extends Error {}
export const frameExporter: VideoExporter = {
  async run(project, format, subtitles, signal, progress) {
    const scale = exportScale(format);
    const [width, height] = dimensions(format, scale);
    const [vp8, vp9, opus] = await Promise.all([
      canEncodeVideo('vp8', { width, height, bitrate: 2_500_000 }),
      canEncodeVideo('vp9', { width, height, bitrate: 2_500_000 }),
      canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000, bitrate: 128_000 })
    ]);
    if ((!vp8 && !vp9) || !opus) throw new UnsupportedFrameEncoder('The browser does not support frame-by-frame WebM encoding.');
    signal.throwIfAborted();
    const duration = projectDuration(project.scenes);
    const mixer = createAudioMixer();
    const target = new BufferTarget();
    const output = new Output({ format: new WebMOutputFormat(), target });
    let renderer: Awaited<ReturnType<typeof createRenderer>> | undefined;
    try {
      const audio = await mixOffline(project.scenes, duration, signal);
      await mixer.prepare(project.scenes);
      signal.throwIfAborted();
      renderer = await createRenderer(format, scale, true);
      await renderer.prepareImages(project.scenes);
      const video = new CanvasSource(renderer.canvas, { codec: vp8 ? 'vp8' : 'vp9', bitrate: 2_500_000, latencyMode: 'quality', keyFrameInterval: 2 });
      const sound = new AudioBufferSource({ codec: 'opus', bitrate: 128_000 });
      output.addVideoTrack(video, { frameRate: MOVIE_FRAME_RATE });
      output.addAudioTrack(sound);
      await output.start();
      const audioWork = sound.add(audio).then(() => undefined, error => { throw error; });
      audioWork.catch(() => {});
      const frames = Math.ceil(duration * MOVIE_FRAME_RATE);
      for (let frame = 0; frame < frames; frame++) {
        signal.throwIfAborted();
        const time = frame / MOVIE_FRAME_RATE;
        const { scene, local } = locate(project.scenes, time);
        renderer.draw(scene, project.characters, local, { subtitles, amplitude: (id, at) => mixer.amplitude(scene, id, at) });
        await video.add(time, Math.min(1 / MOVIE_FRAME_RATE, duration - time));
        if (frame % 6 === 0) {
          progress((frame + 1) / frames * .985);
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      }
      video.close();
      await audioWork;
      sound.close();
      signal.throwIfAborted();
      await output.finalize();
      if (!target.buffer?.byteLength) throw new Error('The encoder returned an empty recording.');
      progress(1);
      return { blob: new Blob([target.buffer], { type: 'video/webm' }), extension: 'webm' };
    } finally {
      if (output.state === 'started' || output.state === 'pending') await output.cancel().catch(() => {});
      renderer?.destroy();
      mixer.close();
    }
  }
};
