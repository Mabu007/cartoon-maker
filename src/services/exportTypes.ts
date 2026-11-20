import type { Format } from '../engine/renderer.ts';
import type { Project } from '../engine/schema.ts';

export type ExportResult = { blob: Blob; extension: string };
export interface VideoExporter {
  run(project: Project, format: Format, subtitles: boolean, signal: AbortSignal, progress: (value: number) => void): Promise<ExportResult>;
}
export const hasFrameEncoder = () => typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
export const exportScale = (format: Format) => format === '9:16' ? 1280 / 540 : 4 / 3;
