import { videoFormats, type Format } from './videoFormats.ts';
export type ExportQuality='balanced'|'full';
export function outputSize(format:Format,quality:ExportQuality='full'){
  const [w,h]=videoFormats[format].pixels;
  const ratio=quality==='balanced'?Math.min(1,720/Math.min(w,h)):1;
  return [Math.round(w*ratio/2)*2,Math.round(h*ratio/2)*2] as const;
}
