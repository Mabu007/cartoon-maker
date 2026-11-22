import { outputSize, type ExportQuality } from '../engine/exportQuality.ts';
import { AudioBufferSource, BufferTarget, CanvasSource, canEncodeAudio, canEncodeVideo, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';
import { locate, MOVIE_FRAME_RATE, projectDuration } from '../engine/evaluate.ts';
import { createRenderer } from '../engine/renderer.ts';
import { exportScale, videoFormats, type Format } from '../engine/videoFormats.ts';
import { createAudioMixer, mixOffline } from './audio.ts';
import { audioBitrate, videoBitrate, type VideoContainer, type VideoExporter } from './exportTypes.ts';

export class UnsupportedFrameEncoder extends Error {}
async function encoderCodecs(format: Format, container: VideoContainer,quality?:ExportQuality) {
  const [width, height] = outputSize(format,quality);
  const audio = container === 'mp4' ? 'aac' : 'opus';
  const options = { width, height, bitrate: videoBitrate };
  const audioSupported = await canEncodeAudio(audio, { numberOfChannels: 2, sampleRate: 48000, bitrate: audioBitrate });
  if (!audioSupported) return;
  const videoCodecs = container === 'mp4' ? ['avc'] as const : ['vp8','vp9'] as const;
  for (const video of videoCodecs) {
    if (await canEncodeVideo(video, options)) return { video, audio } as const;
  }
}
export const frameExporter = (container: VideoContainer): VideoExporter => ({
  async run(project, format, subtitles, signal, progress, quality) {
    const codecs = await encoderCodecs(format, container,quality);
    if (!codecs) throw new UnsupportedFrameEncoder(`The browser cannot encode ${container.toUpperCase()} frame by frame.`);
    signal.throwIfAborted();
    const duration = projectDuration(project.scenes);
    const mixer = createAudioMixer();
    const target = new BufferTarget();
    const output = new Output({ format: container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(), target });
    let renderer: Awaited<ReturnType<typeof createRenderer>> | undefined;
    try {
      const audio = await mixOffline(project.scenes, duration, signal);
      await mixer.prepare(project.scenes);
      signal.throwIfAborted();
      renderer = await createRenderer(format, outputSize(format,quality)[1]/videoFormats[format].viewport[1], true);
      await renderer.prepareImages(project.scenes,project.characters);
      const video = new CanvasSource(renderer.canvas, { codec: codecs.video, bitrate: videoBitrate, latencyMode: 'quality', keyFrameInterval: 2 });
      const sound = new AudioBufferSource({ codec: codecs.audio, bitrate: audioBitrate });
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
      return { blob: new Blob([target.buffer], { type: `video/${container}` }), extension: container };
    } finally {
      if (output.state === 'started' || output.state === 'pending') await output.cancel().catch(() => {});
      renderer?.destroy();
      mixer.close();
    }
  }
});
