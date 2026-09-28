import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const content = JSON.parse(readFileSync(resolve(projectRoot, 'studio/vasilina-content.json'), 'utf8'));
const failures = [];

if (content.schemaVersion !== 1) failures.push('Unsupported content version');

const allPhotos = [
  ...content.home.selectedWork,
  ...content.home.portfolioPhotos,
  ...content.home.digitals,
];
const photoIds = allPhotos.map((photo) => photo.id);
if (new Set(photoIds).size !== photoIds.length) failures.push('Duplicate photo IDs');

const portfolioIds = new Set(content.home.portfolioPhotos.map((photo) => photo.id));
for (const chapter of content.home.portfolioChapters) {
  for (const id of chapter.photos) {
    if (!portfolioIds.has(id)) failures.push(`Missing portfolio photo ${id}`);
  }
}
for (const id of content.home.motionStills) {
  if (!portfolioIds.has(id)) failures.push(`Missing selected photo ${id}`);
}
const assets = new Set();
function collectAssets(value) {
  if (typeof value === 'string' && value.startsWith('image/')) assets.add(value);
  else if (Array.isArray(value)) value.forEach(collectAssets);
  else if (value && typeof value === 'object') Object.values(value).forEach(collectAssets);
}
collectAssets(content);
for (const asset of assets) {
  if (!existsSync(resolve(projectRoot, asset))) failures.push(`Missing file ${asset}`);
}

const publicImages = new Set();
for (const page of ['index.html', 'about.html', 'booking.html']) {
  const html = readFileSync(resolve(projectRoot, page), 'utf8');
  for (const match of html.matchAll(/<img\b[^>]*\bsrc=["'](image\/[^"']+)["']/g)) {
    publicImages.add(match[1].split('?')[0]);
  }
}
for (const image of publicImages) {
  if (!assets.has(image)) failures.push(`Public image absent from seed: ${image}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Vasilina content valid: ${allPhotos.length} photos, ${assets.size} assets, ${publicImages.size} public images covered.`);
}
