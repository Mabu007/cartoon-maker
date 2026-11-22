import type { ExportQuality } from '../engine/exportQuality.ts';
import type { Format } from '../engine/videoFormats.ts';
import type { Project } from '../engine/schema.ts';

export type VideoContainer = 'mp4' | 'webm';
export type ExportResult = { blob: Blob; extension: VideoContainer };
export interface VideoExporter {
  run(project: Project, format: Format, subtitles: boolean, signal: AbortSignal, progress: (value: number) => void, quality?:ExportQuality): Promise<ExportResult>;
}
export const hasFrameEncoder = () => typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
export const videoBitrate = 6_000_000;
export const audioBitrate = 128_000;
