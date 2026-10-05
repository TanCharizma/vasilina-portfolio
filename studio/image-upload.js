export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif';
export const HEIC_ACCEPT = 'image/heic,image/heif,.heic,.heif';
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

export function isHeicImage(file) {
  return /\.(heic|heif)$/i.test(file.name || '') || /^image\/hei[cf](?:-sequence)?$/i.test(file.type || '');
}

export function acceptsImage(file, accept = IMAGE_ACCEPT) {
  const formats = accept.split(',');
  return formats.includes(file.type) || (isHeicImage(file) && formats.some(format => HEIC_ACCEPT.split(',').includes(format)));
}

export function validateImage(file, accept = IMAGE_ACCEPT) {
  if (!acceptsImage(file, accept)) throw new Error('Choose a supported photo: JPG, PNG, WebP, AVIF, HEIC, or HEIF.');
  if (file.size > MAX_IMAGE_SIZE) throw new Error('Choose a photo smaller than 20 MB.');
}

// Load the decoder only when needed. Decoding happens in its web worker;
// photos remain on the device until the resulting JPEG is uploaded.
export async function prepareImage(file, onConverting = () => {}) {
  validateImage(file);
  if (!isHeicImage(file)) return file;
  onConverting();
  let jpeg;
  try {
    const { heicTo } = await import('./vendor/heic-to/heic-to.js');
    jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
    if (!jpeg?.size || jpeg.type !== 'image/jpeg') throw new Error('No JPEG was produced.');
  } catch {
    throw new Error('This HEIC photo could not be converted. Try exporting it as JPG from Photos.');
  }
  if (jpeg.size > MAX_IMAGE_SIZE) throw new Error('The converted photo is over 20 MB. Export a smaller JPG from Photos.');
  return new File([jpeg], (file.name || 'photo.heic').replace(/\.(heic|heif)$/i, '') + '.jpg', {
    type: 'image/jpeg', lastModified: file.lastModified,
  });
}
