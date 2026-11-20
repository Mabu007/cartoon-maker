/**
 * Image imports are flattened to compact transparent WebP, including SVG.
 * No extra network service or browser settings are required; optimized images
 * are embedded in saved projects so local/cloud/JSON/video export all work.
 */
const ACCEPTED = new Set(['image/png','image/jpeg','image/webp','image/svg+xml']);
export type ImportedImage = { data: string; width: number; height: number };

async function imageFromFile(file: File): Promise<HTMLImageElement> {
  if (!ACCEPTED.has(file.type)) throw new Error('Please use a PNG, JPG, WebP or SVG image.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image under 12 MB.');
  let blob: Blob = file;
  if (file.type === 'image/svg+xml') {
    const source = await file.text();
    if (source.length > 1_000_000) throw new Error('SVG is too large.');
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg')
      throw new Error('This SVG file is invalid.');
    // Imported SVGs are rasterized, not mounted as live markup. Reject external
    // resource references and active content before the browser ever loads it.
    if (document.querySelector('script,foreignObject,iframe,object,embed,image,use,a,animate,animateTransform,set'))
      throw new Error('For safety, imported SVGs must contain artwork only (no scripts or linked content).');
    for (const node of Array.from(document.querySelectorAll('*'))) for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name) || /(?:href|src|style)/i.test(attr.name) && /(?:url\(|https?:|data:|javascript:)/i.test(attr.value))
        throw new Error('Please remove external links and scripts from this SVG.');
      if (/url\s*\(/i.test(attr.value) && !/^url\(#[-_a-zA-Z0-9]+\)$/i.test(attr.value.trim()))
        throw new Error('External SVG artwork links are not supported.');
    }
    blob = new Blob([new XMLSerializer().serializeToString(document)], { type: 'image/svg+xml' });
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve,reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The browser could not decode this image.'));
      image.src = url;
    });
  } finally {
    // The decoded image remains usable after revoking its source URL.
    // Revoke on next turn so canvas has finished reading its source.
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
}

export async function prepareArtwork(file: File, kind: 'world' | 'prop'): Promise<ImportedImage> {
  const image = await imageFromFile(file);
  const naturalWidth = image.naturalWidth, naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight) throw new Error('This image has no dimensions.');
  const canvas = document.createElement('canvas');
  let width: number, height: number;
  if (kind === 'world') { width = 960; height = 540; }
  else {
    const ratio = Math.min(1, 520 / Math.max(naturalWidth, naturalHeight));
    width = Math.max(20, Math.round(naturalWidth * ratio));
    height = Math.max(20, Math.round(naturalHeight * ratio));
  }
  const limit = kind === 'world' ? 270_000 : 95_000;
  for (let attempt = 0; attempt < 10; attempt++) {
    canvas.width = width; canvas.height = height;
    const g = canvas.getContext('2d', { alpha: kind !== 'world' });
    if (!g) throw new Error('Image processing is unavailable in this browser.');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    if (kind === 'world') {
      const cover = Math.max(width / naturalWidth, height / naturalHeight);
      const w = naturalWidth * cover, h = naturalHeight * cover;
      g.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    } else g.drawImage(image, 0, 0, width, height);
    const quality = Math.max(.36, .84 - attempt * .065);
    const data = canvas.toDataURL('image/webp', quality);
    if (!data.startsWith('data:image/webp;base64,')) throw new Error('This browser cannot optimize WebP images.');
    if (data.length <= limit) {
      return { data, width, height };
    }
    if (attempt > 3) {
      width = Math.max(120, Math.floor(width * .82));
      height = Math.max(100, Math.floor(height * .82));
    }
  }
  throw new Error('The artwork is too complex to fit. Try a simpler or smaller image.');
}
