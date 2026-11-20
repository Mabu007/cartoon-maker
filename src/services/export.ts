import { createRenderer, type Format } from '../engine/renderer.ts';
import { locate, projectDuration } from '../engine/evaluate.ts';
import type { Project } from '../engine/schema.ts';
import { createAudioMixer } from './audio.ts';

const codecs = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
export const exportCodec = () => typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream ? undefined : codecs.find(codec => MediaRecorder.isTypeSupported(codec));
export interface VideoExporter { run: (project: Project, format: Format, subtitles: boolean, signal: AbortSignal, progress: (value: number) => void) => Promise<{ blob: Blob; extension: string }>; }
export const browserExporter: VideoExporter = {
  async run(project, format, subtitles, signal, progress) {
    const mimeType = exportCodec();
    if (!mimeType) throw new Error('This browser cannot record a canvas with audio. Open the studio in a current Chrome, Edge, or Firefox browser.');
    const mixer = createAudioMixer();
    let renderer: Awaited<ReturnType<typeof createRenderer>> | undefined;
    let stream: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    try {
      await mixer.context.resume();
      await mixer.prepare(project.scenes);
      signal.throwIfAborted();
      renderer = await createRenderer(format, format === '9:16' ? 1280 / 540 : 4 / 3, true);
      signal.throwIfAborted();
      const renderAt = (time: number) => {
        const { scene, local } = locate(project.scenes, time);
        renderer!.draw(scene, project.characters, local, { subtitles, amplitude: (id, t) => mixer.amplitude(scene, id, t) });
      };
      renderAt(0);
      const duration = projectDuration(project.scenes);
      const destination = mixer.context.createMediaStreamDestination();
      mixer.output.connect(destination);
      stream = renderer.canvas.captureStream(30);
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
      if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) throw new Error('The browser did not provide both export tracks.');
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 });
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
            const next = Math.floor(time * 30);
            if (next !== frame) { renderAt(time); frame = next; progress(time / duration); }
            frameHandle = requestAnimationFrame(tick);
          } catch (error) { clean(); finish(error); }
        };
        frameHandle = requestAnimationFrame(tick);
      });
      if (!movie.size) throw new Error('The encoder returned an empty recording.');
      if (movie.type.includes('mp4')) return { blob: movie, extension: 'mp4' };
      const { default: setDuration } = await import('fix-webm-duration');
      const blob = await setDuration(movie, duration * 1000, { logger: false });
      signal.throwIfAborted();
      return { blob, extension: 'webm' };
    } finally {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      stream?.getTracks().forEach(track => track.stop());
      renderer?.destroy(); mixer.close();
    }
  }
};
