export const videoFormats = {
  '16:9': { label: 'YouTube', viewport: [960, 540], pixels: [1920, 1080] },
  '9:16': { label: 'TikTok', viewport: [303.75, 540], pixels: [1080, 1920] },
  '1:1': { label: 'Square', viewport: [540, 540], pixels: [720, 720] }
} as const;

export type Format = keyof typeof videoFormats;
export const formats = Object.keys(videoFormats) as Format[];
export const formatLabel = (format: Format) => `${videoFormats[format].label} · ${format}`;
export const exportFormatLabel = (format: Format) => `${formatLabel(format)} · ${videoFormats[format].pixels.join(' × ')}`;
export const exportScale = (format: Format) => videoFormats[format].pixels[1] / videoFormats[format].viewport[1];
