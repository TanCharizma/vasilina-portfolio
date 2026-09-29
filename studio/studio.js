import {
  portfolioBackendReady, hasOwnerSession, signIn, signOut, getOwnedPortfolio,
  getDraft, saveOwnerDraft, publishOwnerDraft, getPublishedPortfolio, uploadOwnerImage,
} from '../portfolio-backend.js';

const DRAFT_KEY = 'folio-lab-vasilina-demo-draft-v1';
const PUBLISHED_KEY = 'folio-lab-vasilina-demo-published-v1';
const ASSET_PREFIX = 'demo-asset:';
const sectionTitles = {
  identity: ['Profile', 'Your name, role, and model details appear throughout the site.'],
  home: ['Home photos', 'Choose the images people see first.'],
  portfolio: ['Portfolio', 'Arrange your approved photos within the finished design.'],
  digitals: ['Digitals', 'Keep your current digitals ready for casting teams.'],
  motion: ['Motion', 'Prepare the video order and links for your website.'],
  about: ['About', 'Tell your story in your own words.'],
  booking: ['Booking', 'Control the details around your existing calendar.'],
  compCard: ['Comp card', 'Upload the card you already use with clients.'],
};
const measurementNames = {
  height: 'Height', bust: 'Bust', waist: 'Waist', hips: 'Hips',
  shoes: 'Shoes', hair: 'Hair', eyes: 'Eyes',
};
const measurementOrder = ['height', 'bust', 'waist', 'hips', 'shoes', 'hair', 'eyes'];

const editor = document.querySelector('#editorContent');
const frame = document.querySelector('#previewFrame');
const status = document.querySelector('#saveStatus');
let seed;
let draft;
let published;
let activeSection = 'home';
let editLanguage = 'en';
let previewVersion = 'draft';
let previewTimer;
let remotePortfolio;
let draftRevision = 0;
const objectUrls = new Map();

function copy(value) { return structuredClone(value); }
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function markChanged() {
  status.textContent = portfolioBackendReady ? 'Changes not saved yet' : 'Unsaved changes in this browser';
  clearTimeout(previewTimer);
  previewTimer = setTimeout(applyPreview, 150);
}
function group(title, note) {
  const node = element('section', 'field-group');
  node.append(element('h3', 'group-title', title));
  if (note) node.append(element('p', 'group-note', note));
  editor.append(node);
  return node;
}
function textField(parent, label, value, update, multiline = false) {
  const wrap = element('label', 'field');
  wrap.append(element('span', '', label));
  const input = document.createElement(multiline ? 'textarea' : 'input');
  if (!multiline) input.type = 'text';
  input.value = value ?? '';
  input.addEventListener('input', () => { update(input.value); markChanged(); });
  wrap.append(input);
  parent.append(wrap);
  return input;
}
function bilingual(parent, label, value) {
  const row = element('div', 'field-row');
  const english = textField(row, label, value.en, next => { value.en = next; }, true);
  english.setAttribute('aria-label', `${label} · English`);
  english.closest('.field').dataset.editLanguage = 'en';
  english.closest('.field').hidden = editLanguage !== 'en';
  const thai = textField(row, label, value.th, next => { value.th = next; }, true);
  thai.setAttribute('aria-label', `${label} · Thai`);
  thai.closest('.field').dataset.editLanguage = 'th';
  thai.closest('.field').hidden = editLanguage !== 'th';
  parent.append(row);
}
function detailBlock(title, note) {
  const details = element('details', 'edit-details');
  details.append(element('summary', '', title));
  if (note) details.append(element('p', 'group-note', note));
  editor.append(details);
  return details;
}
function checkbox(parent, label, checked, update) {
  const wrap = element('label', 'field-check');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => { update(input.checked); markChanged(); });
  wrap.append(input, element('span', '', label));
  parent.append(wrap);
  return input;
}
function smallButton(label, action, disabled = false) {
  const button = element('button', 'small-action', label);
  button.type = 'button';
  button.disabled = disabled;
  button.addEventListener('click', action);
  return button;
}
function filePicker(parent, label, update, accept = 'image/jpeg,image/png,image/webp,image/avif') {
  const wrap = element('label', 'file-action', label);
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!accept.split(',').includes(file.type)) { alert('Choose one of the supported file types.'); return; }
    if (file.size > 20 * 1024 * 1024) { alert('Choose a file smaller than 20 MB.'); return; }
    try {
      const src = await storeAsset(file);
      update(src, file);
      markChanged();
      renderSection();
    } catch (error) {
      alert(`The image could not be uploaded: ${error.message}`);
    }
  });
  wrap.append(input);
  parent.append(wrap);
}
function moveItem(items, index, direction) {
  const next = index + direction;
  if (next < 0 || next >= items.length) return;
  [items[index], items[next]] = [items[next], items[index]];
  markChanged();
  renderSection();
}
function removeFromArray(items, index) {
  items.splice(index, 1);
  markChanged();
  renderSection();
}
function imageCard(parent, photo, items, index, options = {}) {
  const card = element('div', 'media-card');
  const image = document.createElement('img');
  image.alt = photo.alt || 'Portfolio image';
  imageFromSource(photo.src).then(src => { image.src = src; });
  const details = element('div', 'media-details');
  details.append(element('strong', '', options.title || photo.caption?.en || photo.alt || `Image ${index + 1}`));
  const actions = element('div', 'media-actions');
  filePicker(actions, 'Replace image', src => {
    photo.src = src;
    options.onReplace?.(src);
  });
  if (items) {
    actions.append(
      smallButton('←', () => moveItem(items, index, -1), index === 0),
      smallButton('→', () => moveItem(items, index, 1), index === items.length - 1),
    );
    if (options.removable) actions.append(smallButton('Remove', () => removeFromArray(items, index)));
  }
  details.append(actions);
  if (photo.caption && typeof photo.caption === 'object' || photo.alt !== undefined) {
    const more = element('details', 'image-details');
    more.append(element('summary', '', 'Image details'));
    if (photo.caption && typeof photo.caption === 'object') bilingual(more, 'Caption', photo.caption);
    if (photo.alt !== undefined) textField(more, 'Image description', photo.alt, next => { photo.alt = next; });
    details.append(more);
  }
  card.append(image, details);
  parent.append(card);
  return card;
}

function renderIdentity() {
  const profile = group('Identity', 'These details appear on the website and will feed the generated comp card.');
  bilingual(profile, 'Name', draft.identity.name);
  bilingual(profile, 'Role', draft.identity.role);
  bilingual(profile, 'Tagline', draft.identity.tagline);
  bilingual(profile, 'Location', draft.identity.location);
  const measurements = group('Measurements', 'You decide which values visitors can see.');
  for (const key of measurementOrder) {
    const item = draft.identity.measurements[key];
    if (!item) continue;
    const block = element('div', 'field-group');
    const label = measurementNames[key] || key;
    if (typeof item.value === 'object') bilingual(block, label, item.value);
    else textField(block, label, item.value, next => { item.value = next; });
    checkbox(block, `Show ${label.toLowerCase()} on the public site`, item.visible, next => { item.visible = next; });
    measurements.append(block);
  }
}
function renderHome() {
  const hero = group('Cover image', 'The first photo visitors see.');
  hero.classList.add('hero-edit');
  const heroCard = { src: draft.home.heroImage, alt: 'Vasilina portfolio hero' };
  imageCard(hero, heroCard, null, 0, { title: 'Hero image', onReplace: src => { draft.home.heroImage = src; } });
  const selected = group('Selected work', 'Four photos that introduce your work. Move them into your preferred order.');
  selected.classList.add('media-grid-group');
  draft.home.selectedWork.forEach((photo, index) => imageCard(selected, photo, draft.home.selectedWork, index));
  const more = detailBlock('Edit homepage words & clients', 'Open this when you want to change the writing, client logos, or footer.');
  const words = group('Opening words');
  bilingual(words, 'Statement', draft.home.manifesto.lead);
  bilingual(words, 'Introduction', draft.home.manifesto.body);
  const clients = group('Selected clients');
  draft.home.selectedClients.forEach((client, index) => {
    const card = element('div', 'media-card');
    const image = document.createElement('img');
    image.alt = client.name;
    imageFromSource(client.logo).then(src => { image.src = src; });
    const details = element('div', 'media-details');
    textField(details, 'Client name', client.name, next => { client.name = next; });
    filePicker(details, 'Replace logo', src => { client.logo = src; });
    const actions = element('div', 'media-actions');
    actions.append(smallButton('←', () => moveItem(draft.home.selectedClients, index, -1), index === 0));
    actions.append(smallButton('→', () => moveItem(draft.home.selectedClients, index, 1), index === draft.home.selectedClients.length - 1));
    details.append(actions);
    card.append(image, details);
    clients.append(card);
  });
  const closing = group('Booking invitation');
  bilingual(closing, 'Invitation', draft.home.availabilityIntro);
  const footer = group('Footer');
  bilingual(footer, 'Short description', draft.footer.description);
  more.append(words, clients, closing, footer);
}
function renderPortfolio() {
  const upload = group('Add a photo', 'Choose a photo you have already approved. It will appear in Portraits first.');
  filePicker(upload, 'Choose a photo', (src, file) => {
    const id = `portfolio-${crypto.randomUUID()}`;
    draft.home.portfolioPhotos.push({ id, src, alt: file.name.replace(/\.[^.]+$/, ''), caption: { en: '', th: '' } });
    draft.home.portfolioChapters[0].photos.push(id);
  });
  const photoMap = new Map(draft.home.portfolioPhotos.map(photo => [photo.id, photo]));
  for (const chapter of draft.home.portfolioChapters) {
    const block = group(chapter.title.en, `${chapter.photos.length} photos · Use the arrows to change their order.`);
    block.classList.add('chapter-edit');
    const titleDetails = element('details', 'chapter-details');
    titleDetails.append(element('summary', '', 'Edit chapter name'));
    bilingual(titleDetails, 'Chapter title', chapter.title);
    block.append(titleDetails);
    const grid = element('div', 'chapter-grid');
    chapter.photos.forEach((id, index) => {
      const photo = photoMap.get(id);
      if (!photo) return;
      const card = element('div', 'portfolio-tile');
      const image = document.createElement('img');
      image.alt = photo.alt;
      imageFromSource(photo.src).then(src => { image.src = src; });
      const details = element('div', 'media-details');
      details.append(element('strong', '', photo.caption.en || photo.alt));
      const actions = element('div', 'media-actions');
      const earlier = smallButton('←', () => moveItem(chapter.photos, index, -1), index === 0);
      earlier.setAttribute('aria-label', 'Move earlier');
      earlier.title = 'Move earlier';
      const later = smallButton('→', () => moveItem(chapter.photos, index, 1), index === chapter.photos.length - 1);
      later.setAttribute('aria-label', 'Move later');
      later.title = 'Move later';
      actions.append(earlier, later);
      const selector = document.createElement('select');
      selector.setAttribute('aria-label', `Move ${photo.caption.en || photo.alt} to chapter`);
      selector.append(new Option('Move to another chapter…', ''));
      for (const target of draft.home.portfolioChapters) {
        if (target !== chapter) selector.append(new Option(target.title.en, target.id));
      }
      selector.addEventListener('change', () => {
        const target = draft.home.portfolioChapters.find(item => item.id === selector.value);
        if (!target) return;
        chapter.photos.splice(index, 1);
        target.photos.push(id);
        markChanged(); renderSection();
      });
      const more = element('details', 'image-details');
      more.append(element('summary', '', 'More options'), selector,
        smallButton('Remove from page', () => removeFromArray(chapter.photos, index)));
      details.append(actions, more);
      card.append(image, details);
      grid.append(card);
    });
    block.append(grid);
    const unused = draft.home.portfolioPhotos.filter(photo => !draft.home.portfolioChapters.some(item => item.photos.includes(photo.id)));
    if (unused.length) {
      const selector = document.createElement('select');
      selector.setAttribute('aria-label', `Add a photo to ${chapter.title.en}`);
      selector.append(new Option('Add an unplaced photo…', ''));
      unused.forEach(photo => selector.append(new Option(photo.caption.en || photo.alt || photo.id, photo.id)));
      selector.addEventListener('change', () => { chapter.photos.push(selector.value); markChanged(); renderSection(); });
      block.append(selector);
    }
  }
  const libraryToggle = element('details', 'library-details');
  libraryToggle.append(element('summary', '', `Photo library · ${draft.home.portfolioPhotos.length} images`));
  const library = element('div', 'library-content');
  library.append(element('p', 'group-note', 'Replace images and edit captions here. Photos remain available for your comp card even when removed from the public page.'));
  draft.home.portfolioPhotos.forEach((photo, index) => imageCard(library, photo, null, index, { title: `Photo ${index + 1}` }));
  libraryToggle.append(library);
  editor.append(libraryToggle);
}
function renderDigitals() {
  const groupNode = group('Current digitals', 'Replace, arrange, or add the photos casting teams need.');
  groupNode.classList.add('media-grid-group');
  draft.home.digitals.forEach((photo, index) => imageCard(groupNode, photo, draft.home.digitals, index, { removable: true }));
  filePicker(groupNode, 'Add a digital', (src, file) => {
    draft.home.digitals.push({ id: `digital-${crypto.randomUUID()}`, src, alt: file.name.replace(/\.[^.]+$/, ''), caption: { en: '', th: '' } });
  });
}
function renderMotion() {
  const videos = group('Videos', 'Use the Wistia video ID from the video you already host. Video changes are saved in this demo, but the preview still shows the current videos.');
  draft.home.motion.forEach((video, index) => {
    const block = element('div', 'field-group');
    textField(block, `Video ${index + 1} · Wistia ID`, video.mediaId, next => { video.mediaId = next.trim(); });
    const actions = element('div', 'media-actions');
    actions.append(
      smallButton('Move earlier', () => moveItem(draft.home.motion, index, -1), index === 0),
      smallButton('Move later', () => moveItem(draft.home.motion, index, 1), index === draft.home.motion.length - 1),
      smallButton('Remove', () => removeFromArray(draft.home.motion, index)),
    );
    block.append(actions); videos.append(block);
  });
  videos.append(smallButton('Add a video', () => {
    draft.home.motion.push({ id: `motion-${crypto.randomUUID()}`, provider: 'wistia', mediaId: '' });
    markChanged(); renderSection();
  }));
  const stills = group('Motion stills', 'These images sit below the videos.');
  const photoMap = new Map(draft.home.portfolioPhotos.map(photo => [photo.id, photo]));
  draft.home.motionStills.forEach((id, index) => {
    const photo = photoMap.get(id);
    if (!photo) return;
    const card = imageCard(stills, photo, null, index);
    card.querySelector('.file-action')?.remove();
    const actions = card.querySelector('.media-actions');
    actions.append(
      smallButton('←', () => moveItem(draft.home.motionStills, index, -1), index === 0),
      smallButton('→', () => moveItem(draft.home.motionStills, index, 1), index === draft.home.motionStills.length - 1),
    );
  });
}
function renderAbout() {
  const portrait = group('Portrait');
  imageCard(portrait, draft.about.portrait, null, 0, { title: 'About portrait' });
  textField(portrait, 'Photo caption', draft.about.portrait.caption, next => { draft.about.portrait.caption = next; });
  const story = group('Your story');
  bilingual(story, 'Introduction', draft.about.intro);
  draft.about.biography.forEach((paragraph, index) => {
    const block = element('div', 'field-group');
    bilingual(block, `Biography paragraph ${index + 1}`, paragraph);
    if (index > 0) block.append(smallButton('Remove paragraph', () => removeFromArray(draft.about.biography, index)));
    story.append(block);
  });
  story.append(smallButton('Add a paragraph', () => {
    draft.about.biography.push({ en: '', th: '' }); markChanged(); renderSection();
  }));
  const agency = group('Agency');
  textField(agency, 'Agency name', draft.about.agency.name, next => { draft.about.agency.name = next; });
  bilingual(agency, 'Agency description', draft.about.agency.description);
  textField(agency, 'Agency link', draft.about.agency.url, next => { draft.about.agency.url = next; });
  checkbox(agency, 'Show agency section', draft.about.agency.visible, next => { draft.about.agency.visible = next; });
  const closing = group('Closing words');
  bilingual(closing, 'Invitation', draft.about.closing);
}
function renderBooking() {
  const calendar = group('Direct booking', 'Your availability is still managed by Cal.com. This link is saved for the future connection; the preview keeps the current calendar.');
  textField(calendar, 'Cal.com booking link', draft.booking.calLink, next => { draft.booking.calLink = next; });
  bilingual(calendar, 'Booking headline', draft.booking.headline);
  bilingual(calendar, 'Booking introduction', draft.booking.intro);
  bilingual(calendar, 'Rates note', draft.booking.note);
  bilingual(calendar, 'Calendar instruction', draft.booking.calendarIntro);
  bilingual(calendar, 'Contact introduction', draft.booking.contactIntro);
  const contact = group('Contact options', 'Choose which ways clients can reach you.');
  for (const [name, item] of Object.entries(draft.booking.contact)) {
    const block = element('div', 'field-group');
    textField(block, name[0].toUpperCase() + name.slice(1), item.value, next => { item.value = next; });
    checkbox(block, `Show ${name} publicly`, item.visible, next => { item.visible = next; });
    contact.append(block);
  }
}
function renderCompCard() {
  const card = group('Your current comp card', 'Use the file you already share with clients. You can replace it whenever you update your card.');
  const uploaded = draft.compCard.uploadedFile;
  const preview = element('div', 'comp-upload-preview');
  if (uploaded?.type?.startsWith('image/')) {
    const image = document.createElement('img');
    image.alt = 'Uploaded comp card preview';
    imageFromSource(uploaded.src).then(src => { image.src = src; });
    preview.append(image);
  } else if (uploaded?.type === 'application/pdf') {
    preview.append(element('div', 'pdf-badge', 'PDF'));
  } else {
    const image = document.createElement('img');
    image.alt = 'Current Vasilina comp card';
    imageFromSource(draft.compCard.currentPreview).then(src => { image.src = src; });
    preview.append(image);
  }
  const info = element('div', 'comp-upload-info');
  info.append(element('strong', '', uploaded?.name || 'Vasilina comp card'));
  info.append(element('p', 'group-note', uploaded ? 'Saved in this browser for this demonstration.' : 'The current card is ready to view and download.'));
  const download = element('a', 'outline-button', 'Download card');
  download.href = uploaded ? '#' : `../${draft.compCard.currentPdf}`;
  download.download = uploaded?.name || 'Vasilina_Comp_Card.pdf';
  if (uploaded) imageFromSource(uploaded.src).then(src => { download.href = src; });
  info.append(download);
  preview.append(info);
  card.append(preview);
  filePicker(card, uploaded ? 'Replace comp card' : 'Upload your comp card', async (src, file) => {
    draft.compCard.uploadedFile = { src, name: file.name, type: file.type };
  }, 'application/pdf,image/jpeg,image/png,image/webp');
  const uploadNote = uploaded?.type === 'application/pdf'
    ? 'Your PDF is ready to download. The website preview keeps showing the current card artwork.'
    : uploaded
      ? 'Your uploaded image is ready to preview and download in this browser.'
      : 'Accepted files: PDF, JPG, PNG, or WebP · Up to 20 MB. Photo-based card creation can come later.';
  card.append(element('p', 'group-note', uploadNote));
}
function renderSection() {
  editor.replaceChildren();
  document.querySelectorAll('.studio-nav button').forEach(button => {
    button.classList.toggle('active', button.dataset.section === activeSection);
  });
  document.querySelector('#sectionTitle').textContent = sectionTitles[activeSection][0];
  document.querySelector('#sectionDescription').textContent = sectionTitles[activeSection][1];
  ({ identity: renderIdentity, home: renderHome, portfolio: renderPortfolio,
    digitals: renderDigitals, motion: renderMotion, about: renderAbout,
    booking: renderBooking, compCard: renderCompCard })[activeSection]();
  document.querySelector('.more-sections').open = ['identity', 'about', 'motion', 'booking'].includes(activeSection);
  updateLanguageVisibility();
}
function updateLanguageVisibility() {
  const textFields = editor.querySelectorAll('[data-edit-language="en"]');
  document.querySelector('.language-switch').hidden = ![...textFields].some(field => {
    for (let parent = field.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && !parent.open) return false;
    }
    return true;
  });
}

function openAssetDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('folio-lab-vasilina-demo-assets', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storeAsset(file) {
  if (portfolioBackendReady) {
    status.textContent = 'Uploading photo…';
    return uploadOwnerImage(file);
  }
  const db = await openAssetDb();
  const id = crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').put({ id, file });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return `${ASSET_PREFIX}${id}`;
}
async function imageFromSource(source) {
  if (/^https?:\/\//.test(source || '')) return source;
  if (!source?.startsWith(ASSET_PREFIX)) return new URL(`../${source || ''}`, location.href).href;
  const id = source.slice(ASSET_PREFIX.length);
  if (objectUrls.has(id)) return objectUrls.get(id);
  const db = await openAssetDb();
  const item = await new Promise((resolve, reject) => {
    const request = db.transaction('images').objectStore('images').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (!item) return '';
  const url = URL.createObjectURL(item.file);
  objectUrls.set(id, url);
  return url;
}
function setLang(doc, selector, value) {
  const root = doc.querySelector(selector);
  if (!root || !value) return;
  for (const lang of ['en', 'th']) {
    const target = root.querySelector(`[lang="${lang}"]`);
    if (target) target.textContent = value[lang] || '';
  }
}
async function setImage(img, source, alt) {
  if (!img || !source) return;
  img.src = await imageFromSource(source);
  if (alt) img.alt = alt;
}
async function applyHomePreview(doc, content) {
  const hero = doc.querySelector('.home-hero .hero-bg');
  if (hero) hero.style.backgroundImage = `url("${await imageFromSource(content.home.heroImage)}")`;
  const nameParts = content.identity.name.en.trim().split(/\s+/);
  const nameSpans = doc.querySelectorAll('.hero-content h1 > span');
  if (nameSpans[0]) nameSpans[0].textContent = nameParts[0] || '';
  if (nameSpans[1]) nameSpans[1].textContent = nameParts.slice(1).join(' ');
  setLang(doc, '.hero-role', content.identity.role);
  setLang(doc, '.hero-tagline', content.identity.tagline);
  setLang(doc, '.manifesto-lead', content.home.manifesto.lead);
  for (const lang of ['en', 'th']) {
    const target = doc.querySelector(`.manifesto-detail p[lang="${lang}"]`);
    if (target) target.textContent = content.home.manifesto.body[lang];
  }
  const frames = doc.querySelectorAll('.story-grid .story-frame');
  for (let i = 0; i < frames.length; i++) {
    const photo = content.home.selectedWork[i];
    frames[i].hidden = !photo;
    if (!photo) continue;
    await setImage(frames[i].querySelector('img'), photo.src, photo.alt);
    setLang(frames[i], 'figcaption', photo.caption);
  }
  const logos = doc.querySelectorAll('.client-logos img');
  for (let i = 0; i < logos.length; i++) {
    const client = content.home.selectedClients[i];
    logos[i].hidden = !client;
    if (client) await setImage(logos[i], client.logo, client.name);
  }
  const measurementItems = measurementOrder.map(key => content.identity.measurements[key]);
  doc.querySelectorAll('.info-strip > div').forEach((row, index) => {
    const item = measurementItems[index];
    if (!item) return;
    row.hidden = item.visible === false;
    const value = row.querySelector('b');
    if (!value) return;
    if (typeof item.value === 'object') {
      value.replaceChildren();
      for (const lang of ['en', 'th']) {
        const span = doc.createElement('span');
        span.lang = lang;
        span.textContent = item.value[lang] || '';
        value.append(span);
      }
    } else value.textContent = item.value;
  });
  const photoMap = new Map(content.home.portfolioPhotos.map(photo => [photo.id, photo]));
  const chapters = doc.querySelectorAll('.work-chapter');
  for (let c = 0; c < chapters.length; c++) {
    const chapter = content.home.portfolioChapters[c];
    if (!chapter) continue;
    setLang(chapters[c], '.chapter-heading h3', chapter.title);
    const container = chapters[c].querySelector('.chapter-images');
    container.querySelectorAll('.studio-added-spread').forEach(spread => spread.remove());
    const images = container.querySelectorAll('img');
    for (let i = 0; i < images.length; i++) {
      const photo = photoMap.get(chapter.photos[i]);
      images[i].style.display = photo ? '' : 'none';
      if (photo) await setImage(images[i], photo.src, photo.alt);
    }
    for (let i = images.length; i < chapter.photos.length; i += 2) {
      const spread = doc.createElement('div');
      spread.className = 'portfolio-spread portfolio-spread-left studio-added-spread';
      for (const id of chapter.photos.slice(i, i + 2)) {
        const photo = photoMap.get(id);
        if (!photo) continue;
        const image = doc.createElement('img');
        image.className = 'reveal active';
        image.loading = 'lazy';
        await setImage(image, photo.src, photo.alt);
        spread.append(image);
      }
      container.append(spread);
    }
  }
  const digitalsContainer = doc.querySelector('.digitals-grid');
  digitalsContainer.querySelectorAll('.studio-added-digital').forEach(image => image.remove());
  const digitals = digitalsContainer.querySelectorAll('img');
  for (let i = 0; i < digitals.length; i++) {
    const photo = content.home.digitals[i];
    digitals[i].style.display = photo ? '' : 'none';
    if (photo) await setImage(digitals[i], photo.src, photo.alt);
  }
  for (let i = digitals.length; i < content.home.digitals.length; i++) {
    const photo = content.home.digitals[i];
    const image = doc.createElement('img');
    image.className = 'reveal active studio-added-digital';
    image.loading = 'lazy';
    await setImage(image, photo.src, photo.alt);
    digitalsContainer.append(image);
  }
  setLang(doc, '.home-availability .availability-copy > p', content.home.availabilityIntro);
  const compImage = doc.querySelector('#compCardImg');
  const uploadedCard = content.compCard.uploadedFile;
  if (compImage) await setImage(compImage,
    uploadedCard?.type?.startsWith('image/') ? uploadedCard.src : content.compCard.currentPreview,
    'Vasilina Panina comp card');
  const download = doc.querySelector('#compCardDownload');
  if (download && uploadedCard?.type?.startsWith('image/')) {
    download.href = await imageFromSource(uploadedCard.src);
    download.download = uploadedCard.name;
  }
  applyFooterPreview(doc, content);
}
async function applyAboutPreview(doc, content) {
  const nameHeading = doc.querySelector('.about-opening h1');
  for (const lang of ['en', 'th']) {
    const part = nameHeading?.querySelector(`[lang="${lang}"]`);
    if (!part) continue;
    const words = content.identity.name[lang].trim().split(/\s+/);
    const firstText = [...part.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (firstText) firstText.textContent = words[0] || '';
    const surname = part.querySelector('em');
    if (surname) surname.textContent = `${words.slice(1).join(' ')}.`;
  }
  setLang(doc, '.about-opening .subpage-kicker', content.identity.role);
  await setImage(doc.querySelector('.about-image img'), content.about.portrait.src, content.about.portrait.alt);
  const caption = doc.querySelector('.about-image figcaption span:last-child');
  if (caption) caption.textContent = content.about.portrait.caption;
  setLang(doc, '.portrait-intro', content.about.intro);
  for (const lang of ['en', 'th']) {
    const lead = doc.querySelector(`.about-lead[lang="${lang}"]`);
    if (lead) lead.textContent = content.about.biography[0]?.[lang] || '';
    const paragraphs = doc.querySelectorAll(`.about-body p[lang="${lang}"]`);
    paragraphs.forEach((p, index) => { p.textContent = content.about.biography[index + 1]?.[lang] || ''; });
    const agency = doc.querySelector(`.practice-copy p[lang="${lang}"]`);
    if (agency) agency.textContent = content.about.agency.description[lang];
  }
  const agency = doc.querySelector('.about-practice');
  if (agency) agency.hidden = content.about.agency.visible === false;
  const agencyName = doc.querySelector('.practice-copy h2');
  if (agencyName) agencyName.textContent = content.about.agency.name;
  const agencyLink = doc.querySelector('.practice-copy a');
  if (agencyLink) agencyLink.href = content.about.agency.url;
  setLang(doc, '.about-closing .closing-statement', content.about.closing);
  const logos = doc.querySelectorAll('.about-client-logos img');
  for (let i = 0; i < logos.length; i++) {
    const client = content.home.selectedClients[i];
    logos[i].hidden = !client;
    if (client) await setImage(logos[i], client.logo, client.name);
  }
  applyFooterPreview(doc, content);
}
function applyBookingPreview(doc, content) {
  setLang(doc, '.booking-opening .subpage-kicker', content.identity.location);
  setLang(doc, '.booking-opening h1', content.booking.headline);
  for (const lang of ['en', 'th']) {
    const intro = doc.querySelector(`.booking-intro p[lang="${lang}"]`);
    if (intro) intro.textContent = content.booking.intro[lang];
  }
  setLang(doc, '.booking-intro > span', content.booking.note);
  setLang(doc, '.calendar-heading p:not(.subpage-index)', content.booking.calendarIntro);
  setLang(doc, '.inquiry-copy > p', content.booking.contactIntro);
  doc.querySelectorAll('.inquiry-links a').forEach(link => {
    const name = link.querySelector('b')?.textContent.trim().toLowerCase();
    const item = content.booking.contact[name];
    if (!item) return;
    link.hidden = item.visible === false;
    link.href = name === 'email' ? `mailto:${item.value}` : item.value;
  });
  applyFooterPreview(doc, content);
}
function applyFooterPreview(doc, content) {
  const footer = doc.querySelector('footer');
  if (!footer) return;
  for (const lang of ['en', 'th']) {
    const p = footer.querySelector(`.footer-column p[lang="${lang}"]:not(.footer-label)`);
    if (p) p.textContent = content.footer.description[lang];
  }
  const email = footer.querySelector('a[href^="mailto:"]');
  if (email) {
    email.href = `mailto:${content.booking.contact.email.value}`;
    email.textContent = content.booking.contact.email.value;
    email.hidden = content.booking.contact.email.visible === false;
  }
}
async function applyPreview() {
  const doc = frame.contentDocument;
  if (!doc?.body || !draft) return;
  const content = previewVersion === 'published' ? published : draft;
  const page = document.querySelector('#previewPage').value;
  if (page === 'home') await applyHomePreview(doc, content);
  if (page === 'about') await applyAboutPreview(doc, content);
  if (page === 'booking') applyBookingPreview(doc, content);
}
function loadPreviewPage() {
  const page = document.querySelector('#previewPage').value;
  const anchors = {
    identity: '#measurements', portfolio: '#portfolio', digitals: '#digitals',
    motion: '#motion', compCard: '#measurements',
    about: '#about-portrait', booking: '#availability',
  };
  const hash = activeSection === 'home' ? '' : anchors[activeSection] || '';
  frame.src = `../${page === 'home' ? 'index' : page}.html?studio-preview=13${hash}`;
}
async function saveDraft() {
  if (!portfolioBackendReady) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    status.textContent = 'Draft saved on this device';
    return true;
  }
  const button = document.querySelector('#saveButton');
  button.disabled = true;
  status.textContent = 'Saving draft…';
  try {
    draftRevision = await saveOwnerDraft(remotePortfolio.id, draft, draftRevision);
    status.textContent = 'Draft saved privately';
    return true;
  } catch (error) {
    status.textContent = error.message;
    return false;
  } finally {
    button.disabled = false;
  }
}
async function simulatePublish() {
  const button = document.querySelector('#publishButton');
  button.disabled = true;
  try {
    if (!await saveDraft()) return;
    if (portfolioBackendReady) {
      status.textContent = 'Publishing portfolio photos…';
      await publishOwnerDraft(remotePortfolio.id);
      published = copy(draft);
      status.textContent = 'Published · your public portfolio now shows these photos';
    } else {
      published = copy(draft);
      localStorage.setItem(PUBLISHED_KEY, JSON.stringify(published));
      status.textContent = 'Simulated publication saved on this device · public site unchanged';
    }
    if (previewVersion === 'published') applyPreview();
  } catch (error) {
    status.textContent = `Could not publish: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}
function resetDemo() {
  if (!confirm('Reset this local demonstration to Vasilina’s current portfolio?')) return;
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(PUBLISHED_KEY);
  draft = copy(seed);
  published = copy(seed);
  renderSection();
  loadPreviewPage();
  status.textContent = 'Demo reset to Vasilina’s current portfolio';
}
function showLogin(message = '') {
  document.querySelector('#studioLogin').hidden = false;
  document.querySelector('#studioActions').hidden = true;
  document.querySelector('#studioWorkspace').hidden = true;
  document.querySelector('#studioNav').hidden = true;
  document.querySelector('#signOutButton').hidden = true;
  document.querySelector('#loginStatus').textContent = message;
}
async function loadRemotePortfolio() {
  remotePortfolio = await getOwnedPortfolio();
  const [savedDraft, publication] = await Promise.all([
    getDraft(remotePortfolio.id, seed), getPublishedPortfolio(),
  ]);
  draft = copy(savedDraft.content);
  draftRevision = savedDraft.revision;
  published = copy(publication?.content || seed);
  activeSection = 'portfolio';
  previewVersion = 'draft';
  document.querySelector('#studioLogin').hidden = true;
  document.querySelector('#studioActions').hidden = false;
  document.querySelector('#studioWorkspace').hidden = false;
  document.querySelector('#studioNav').hidden = false;
  document.querySelector('#signOutButton').hidden = false;
  document.querySelector('#previewPage').value = 'home';
  document.querySelector('#draftPreviewButton').classList.add('selected');
  document.querySelector('#publishedPreviewButton').classList.remove('selected');
  renderSection();
  loadPreviewPage();
  status.textContent = 'Ready to edit portfolio photos';
}
function configureRemoteInterface() {
  document.querySelector('#studioMode').textContent = 'Connected portfolio';
  document.querySelector('#studioNotice').textContent = 'Arrange approved photos here, preview the page, then publish when you are happy with it. Other sections will be connected later.';
  document.querySelector('#resetButton').hidden = true;
  document.querySelector('#saveButton').textContent = 'Save draft';
  document.querySelector('#publishButton').textContent = 'Publish photos';
  document.querySelector('#publishedPreviewButton').textContent = 'Published version';
  document.querySelector('.preview-note').textContent = 'Your changes appear on the public portfolio after you press Publish photos.';
  document.querySelectorAll('.studio-nav button').forEach(button => { button.hidden = button.dataset.section !== 'portfolio'; });
  document.querySelector('.more-sections').hidden = true;
  document.querySelector('.sidebar-note').textContent = 'Arrange first. Publish when the page feels right.';
}
async function start() {
  const response = await fetch('/studio/vasilina-content.json?v=studio-12', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load Vasilina’s starting content');
  seed = await response.json();
  document.querySelectorAll('.studio-nav button').forEach(button => {
    button.addEventListener('click', () => {
      activeSection = button.dataset.section;
      renderSection();
      document.querySelector('#previewPage').value = activeSection === 'about' ? 'about' : activeSection === 'booking' ? 'booking' : 'home';
      loadPreviewPage();
    });
  });
  document.querySelector('#previewPage').addEventListener('change', loadPreviewPage);
  document.querySelector('#saveButton').addEventListener('click', saveDraft);
  document.querySelector('#publishButton').addEventListener('click', simulatePublish);
  document.querySelector('#resetButton').addEventListener('click', resetDemo);
  document.querySelector('#draftPreviewButton').addEventListener('click', () => setPreviewVersion('draft'));
  document.querySelector('#publishedPreviewButton').addEventListener('click', () => setPreviewVersion('published'));
  document.querySelector('#signOutButton').addEventListener('click', () => {
    signOut();
    draft = null;
    published = null;
    remotePortfolio = null;
    showLogin('Signed out.');
  });
  document.querySelector('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    document.querySelector('#loginStatus').textContent = 'Signing in…';
    try {
      await signIn(form.elements.namedItem('email').value.trim(), form.elements.namedItem('password').value);
      form.elements.namedItem('password').value = '';
      await loadRemotePortfolio();
    } catch (error) {
      document.querySelector('#loginStatus').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  editor.addEventListener('toggle', () => requestAnimationFrame(updateLanguageVisibility), true);
  for (const [lang, buttonId] of [['en', 'editEnglish'], ['th', 'editThai']]) {
    document.querySelector(`#${buttonId}`).addEventListener('click', () => {
      editLanguage = lang;
      for (const field of document.querySelectorAll('[data-edit-language]')) field.hidden = field.dataset.editLanguage !== lang;
      for (const code of ['en', 'th']) {
        const button = document.querySelector(code === 'en' ? '#editEnglish' : '#editThai');
        button.classList.toggle('selected', code === lang);
        button.setAttribute('aria-pressed', String(code === lang));
      }
    });
  }
  frame.addEventListener('load', applyPreview);
  if (portfolioBackendReady) {
    configureRemoteInterface();
    showLogin();
    if (hasOwnerSession()) {
      try { await loadRemotePortfolio(); }
      catch (error) { showLogin(error.message); }
    }
    return;
  }
  draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || copy(seed);
  published = JSON.parse(localStorage.getItem(PUBLISHED_KEY) || 'null') || copy(seed);
  for (const content of [draft, published]) {
    content.compCard.currentPdf = seed.compCard.currentPdf;
    delete content.compCard.currentDownload;
  }
  renderSection();
  status.textContent = 'Ready to edit · demo changes stay on this device';
  applyPreview();
}
function setPreviewVersion(version) {
  previewVersion = version;
  document.querySelector('#draftPreviewButton').classList.toggle('selected', version === 'draft');
  document.querySelector('#publishedPreviewButton').classList.toggle('selected', version === 'published');
  applyPreview();
}
start().catch(error => { status.textContent = error.message; console.error(error); });
