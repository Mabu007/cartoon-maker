import { createRenderer } from '../engine/renderer.ts';
import { locate, MOVIE_FRAME_RATE, projectDuration } from '../engine/evaluate.ts';
import type { Project } from '../engine/schema.ts';
import { createAudioMixer } from './audio.ts';
import { exportScale } from '../engine/videoFormats.ts';
import { audioBitrate, hasFrameEncoder, videoBitrate, type VideoContainer, type VideoExporter } from './exportTypes.ts';

const mimeTypes: Record<VideoContainer, string[]> = {
  mp4: ['video/mp4;codecs=avc1.42002A,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2'],
  webm: ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
};
const recorderCodec = (container: VideoContainer) =>
  typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream
    ? undefined : mimeTypes[container].find(codec => MediaRecorder.isTypeSupported(codec));
export const canExportVideo = () => hasFrameEncoder() || Boolean(recorderCodec('mp4') || recorderCodec('webm'));
const recorderExporter = (mimeType: string): VideoExporter => ({
  async run(project, format, subtitles, signal, progress) {
    const mixer = createAudioMixer();
    let renderer: Awaited<ReturnType<typeof createRenderer>> | undefined;
    let stream: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    try {
      await mixer.context.resume();
      await mixer.prepare(project.scenes);
      signal.throwIfAborted();
      renderer = await createRenderer(format, exportScale(format), true);
      await renderer.prepareImages(project.scenes,project.characters);
      signal.throwIfAborted();
      const renderAt = (time: number) => {
        const { scene, local } = locate(project.scenes, time);
        renderer!.draw(scene, project.characters, local, { subtitles, amplitude: (id, t) => mixer.amplitude(scene, id, t) });
      };
      renderAt(0);
      const duration = projectDuration(project.scenes);
      const destination = mixer.context.createMediaStreamDestination();
      mixer.output.connect(destination);
      stream = renderer.canvas.captureStream(MOVIE_FRAME_RATE);
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
      if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) throw new Error('The browser did not provide both export tracks.');
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: videoBitrate, audioBitsPerSecond: audioBitrate });
      const chunks: Blob[] = [];
      let frame = 0;
      let frameHandle = 0;
      const movie = await new Promise<Blob>((resolve, reject) => {
        const finish = (reason: unknown) => { clean(); cancelAnimationFrame(frameHandle); reject(reason); };
        const abort = () => finish(new DOMException('Export cancelled', 'AbortError'));
        const onVisibility = () => { if (document.hidden) finish(new Error('The editor was hidden during recording. Keep this tab visible and try again.')); };
        const clean = () => { signal.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', onVisibility); };
        recorder!.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder!.onerror = () => { clean(); finish(new Error('The browser could not encode the video.')); };
        recorder!.onstop = () => { clean(); resolve(new Blob(chunks, { type: recorder!.mimeType || mimeType })); };
        signal.addEventListener('abort', abort, { once: true });
        document.addEventListener('visibilitychange', onVisibility);
        try { recorder!.start(500); } catch (error) { clean(); finish(error); return; }
        const start = mixer.context.currentTime + .045;
        mixer.schedule(project.scenes, 0, start);
        const tick = () => {
          try {
            const time = Math.max(0, mixer.context.currentTime - start);
            if (time >= duration) { renderAt(duration); progress(1); recorder!.stop(); return; }
            const next = Math.floor(time * MOVIE_FRAME_RATE);
            if (next !== frame) { renderAt(next / MOVIE_FRAME_RATE); frame = next; progress(time / duration); }
            frameHandle = requestAnimationFrame(tick);
          } catch (error) { clean(); finish(error); }
        };
        frameHandle = requestAnimationFrame(tick);
      });
      if (!movie.size) throw new Error('The encoder returned an empty recording.');
      if (movie.type.includes('mp4')) return { blob: movie, extension: 'mp4' };
      const { finalizeRecorderWebm } = await import('./recorderWebm.ts');
      const blob = await finalizeRecorderWebm(movie, signal);
      return { blob, extension: 'webm' };
    } finally {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      stream?.getTracks().forEach(track => track.stop());
      renderer?.destroy(); mixer.close();
    }
  }
});

export const browserExporter: VideoExporter = {
  async run(project, format, subtitles, signal, progress) {
    const frame = hasFrameEncoder() ? await import('./frameExport.ts') : undefined;
    for (const container of ['mp4', 'webm'] as const) {
      signal.throwIfAborted();
      if (frame) {
        try { return await frame.frameExporter(container).run(project, format, subtitles, signal, progress); }
        catch (error) { if (!(error instanceof frame.UnsupportedFrameEncoder)) throw error; }
      }
      const codec = recorderCodec(container);
      if (codec) return recorderExporter(codec).run(project, format, subtitles, signal, progress);
    }
    throw new Error('This browser cannot export video with audio. Try opening the studio in a current Chrome, Edge or Firefox browser.');
  }
};
