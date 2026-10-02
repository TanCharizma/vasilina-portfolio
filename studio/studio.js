import {
  portfolioBackendReady, hasOwnerSession, signIn, signOut, getOwnedPortfolio,
  getDraft, saveOwnerDraft, publishOwnerDraft, getPublishedPortfolio, uploadOwnerImage, uploadOwnerVideo, ownerVideoFormat,
} from '../portfolio-backend.js?v=3';
import { renderMotionGallery, renderMotionStills } from '../portfolio-motion.js';
import { applyBookingContent, mountBookingCalendar, normalizeCalLink } from '../portfolio-booking.js?v=2';

const DRAFT_KEY = 'folio-lab-vasilina-demo-draft-v1';
const PUBLISHED_KEY = 'folio-lab-vasilina-demo-published-v1';
const ASSET_PREFIX = 'demo-asset:';
const sectionTitles = {
  identity: ['Profile & measurements', 'Edit your profile and measurements.'],
  home: ['Homepage', 'Edit your cover, selected work, and homepage wording.'],
  portfolio: ['Your photos', 'Choose where each photo appears.'],
  digitals: ['Digitals', 'Update your digitals.'],
  motion: ['Motion', 'Upload and arrange your videos.'],
  about: ['About & bio', 'Tell your story.'],
  booking: ['Booking', 'Edit your contact details, calendar, and page wording.'],
  compCard: ['Comp card', 'Upload your comp card.'],
};
const measurementNames = {
  height: 'Height', bust: 'Bust', waist: 'Waist', hips: 'Hips',
  shoes: 'Shoes', hair: 'Hair', eyes: 'Eyes',
};
const measurementOrder = ['height', 'bust', 'waist', 'hips', 'shoes', 'hair', 'eyes'];

const editor = document.querySelector('#editorContent');
const frame = document.querySelector('#previewFrame');
const previewCanvas = document.querySelector('#previewCanvas');
const previewWrap = document.querySelector('.preview-frame-wrap');
const previewZoom = document.querySelector('#previewZoom');
const status = document.querySelector('#saveStatus');
let seed;
let draft;
let published;
let activeSection = 'home';
let editLanguage = 'en';
let previewVersion = 'draft';
let previewAnchor = '';
let previewDevice = 'desktop';
let previewAutoFit = true;
let previewTimer;
let remotePortfolio;
let draftRevision = 0;
let savedSnapshot = null;
let publishedSnapshot = null;
let saveInProgress = false;
let publishInProgress = false;
let hiddenPhotosOpen = false;
const objectUrls = new Map();
const previewSizes = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

function updatePreviewScale() {
  const { width, height } = previewSizes[previewDevice];
  const availableWidth = previewWrap.clientWidth - 32;
  if (availableWidth <= 0) return;
  if (previewAutoFit) {
    const fit = Math.min(1, availableWidth / width);
    previewZoom.value = String(Math.max(20, Math.min(150, Math.round(fit * 100 / 5) * 5)));
  }
  const scale = Number(previewZoom.value) / 100;
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frame.style.transform = `scale(${scale})`;
  previewCanvas.style.width = `${width * scale}px`;
  previewCanvas.style.height = `${height * scale}px`;
  document.querySelector('#previewZoomValue').value = `${Math.round(scale * 100)}%`;
}

function setPreviewDevice(device) {
  previewDevice = device;
  previewAutoFit = true;
  for (const [name, id] of [['desktop', 'desktopPreviewButton'], ['mobile', 'mobilePreviewButton']]) {
    const button = document.querySelector(`#${id}`);
    button.classList.toggle('selected', name === device);
    button.setAttribute('aria-pressed', String(name === device));
  }
  previewWrap.scrollTo(0, 0);
  updatePreviewScale();
  requestAnimationFrame(scrollPreviewToSection);
}

function setMobileView(view) {
  const workspace = document.querySelector('#studioWorkspace');
  workspace.dataset.mobileView = view;
  for (const [name, id] of [['edit', 'editViewButton'], ['preview', 'previewViewButton']]) {
    const button = document.querySelector(`#${id}`);
    button.classList.toggle('selected', name === view);
    button.setAttribute('aria-pressed', String(name === view));
  }
  if (view === 'preview') requestAnimationFrame(() => {
    updatePreviewScale();
    scrollPreviewToSection();
  });
  if (matchMedia('(max-width: 700px)').matches) {
    document.querySelector('.workspace-view-switch').scrollIntoView({ block: 'start' });
  }
}

function copy(value) { return structuredClone(value); }
function snapshot(value) { return JSON.stringify(value); }
function hasUnsavedChanges() { return !!draft && savedSnapshot !== null && snapshot(draft) !== savedSnapshot; }
function setSaveStatus(state, message) {
  status.dataset.state = state;
  status.textContent = message;
}
function updatePreviewVersionNote() {
  if (!draft || !published) return;
  const note = document.querySelector('#previewVersionNote');
  note.dataset.version = previewVersion;
  if (previewVersion === 'published') {
    note.textContent = portfolioBackendReady
      ? 'Published site · this is what visitors see now.'
      : 'Demo published version · the public website is unchanged.';
  } else {
    note.textContent = snapshot(draft) === publishedSnapshot
      ? 'Working preview · matches the published site.'
      : 'Working preview · changes here are not public yet.';
  }
}
function updateSaveStatus() {
  if (hasUnsavedChanges()) {
    setSaveStatus('unsaved', portfolioBackendReady
      ? 'Unsaved changes · save your draft to keep them'
      : 'Unsaved demo changes · save your draft on this device');
  } else if (portfolioBackendReady) {
    setSaveStatus(savedSnapshot === publishedSnapshot ? 'published' : 'saved',
      savedSnapshot === publishedSnapshot
        ? 'Public website up to date'
        : 'Draft saved privately · public website unchanged');
  } else {
    setSaveStatus('saved', 'Demo draft saved on this device · public website unchanged');
  }
  updatePreviewVersionNote();
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function markChanged() {
  updateSaveStatus();
  document.querySelector('#undoButton').hidden = true;
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
function bilingual(parent, label, value, multiline = true) {
  const row = element('div', 'field-row');
  const english = textField(row, label, value.en, next => { value.en = next; }, multiline);
  english.setAttribute('aria-label', `${label} · English`);
  english.closest('.field').dataset.editLanguage = 'en';
  english.closest('.field').hidden = editLanguage !== 'en';
  const thai = textField(row, label, value.th, next => { value.th = next; }, multiline);
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
      updateSaveStatus();
      alert(`The image could not be uploaded: ${error.message}`);
    }
  });
  wrap.append(input);
  parent.append(wrap);
}
function videoPicker(parent) {
  const wrap = element('label', 'file-action', 'Upload a video');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.mp4,.mov,.webm,video/mp4,video/quicktime,video/webm';
  const progress = element('p', 'group-note video-upload-status', 'MP4, MOV, or WebM · up to 50 MB. Short clips work best.');
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    let format;
    try { format = ownerVideoFormat(file); } catch (error) {
      progress.textContent = error.message;
      input.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      progress.textContent = 'This video is over 50 MB. Please choose a shorter or compressed clip.';
      input.value = '';
      return;
    }
    input.disabled = true;
    progress.textContent = 'Preparing video…';
    try {
      const src = portfolioBackendReady
        ? await uploadOwnerVideo(file, percent => { progress.textContent = `Uploading video… ${percent}%`; })
        : await storeAsset(file);
      draft.home.motion.push({
        id: `motion-${crypto.randomUUID()}`,
        provider: 'file', src, name: file.name, type: format.type,
      });
      markChanged();
      renderSection();
    } catch (error) {
      progress.textContent = `Upload failed: ${error.message}`;
      input.disabled = false;
      input.value = '';
    }
  });
  wrap.append(input);
  parent.append(wrap, progress);
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
function changePortfolioPlacement(change, message) {
  const previous = draft.home.portfolioChapters.map(chapter => [chapter, [...chapter.photos]]);
  const previousHiddenPhotosOpen = hiddenPhotosOpen;
  change();
  markChanged();
  renderSection();
  if (message && hasUnsavedChanges()) setSaveStatus('unsaved', `${message} · unsaved changes`);
  const undo = document.querySelector('#undoButton');
  undo.hidden = false;
  undo.onclick = () => {
    for (const [chapter, photos] of previous) chapter.photos.splice(0, chapter.photos.length, ...photos);
    hiddenPhotosOpen = previousHiddenPhotosOpen;
    markChanged();
    renderSection();
  };
}
function movePortfolioPhoto(chapter, index, direction) {
  const next = index + direction;
  if (next < 0 || next >= chapter.photos.length) return;
  changePortfolioPlacement(() => {
    [chapter.photos[index], chapter.photos[next]] = [chapter.photos[next], chapter.photos[index]];
  }, 'Photo reordered');
}
function enablePhotoDrag(handle, card, grid, chapter, id) {
  let startX = 0;
  let startY = 0;
  let pointerId = null;
  let dragging = false;
  let targetCard = null;
  let placeAfter = false;
  const clearTarget = () => {
    targetCard?.classList.remove('drop-before', 'drop-after');
    targetCard = null;
  };
  const finish = (commit) => {
    if (pointerId === null) return;
    const destination = targetCard?.dataset.photoId;
    const after = placeAfter;
    clearTarget();
    card.classList.remove('is-dragging');
    card.style.transform = '';
    document.body.classList.remove('is-reordering');
    pointerId = null;
    if (!commit || !dragging || !destination) return;
    const from = chapter.photos.indexOf(id);
    const to = chapter.photos.indexOf(destination);
    if (from < 0 || to < 0) return;
    const insertion = to + (after ? 1 : 0);
    const adjusted = insertion > from ? insertion - 1 : insertion;
    if (adjusted === from) return;
    changePortfolioPlacement(() => {
      chapter.photos.splice(from, 1);
      chapter.photos.splice(adjusted, 0, id);
    }, 'Photo reordered');
    requestAnimationFrame(() => editor.querySelector(`[data-photo-id="${CSS.escape(id)}"] .drag-handle`)?.focus({ preventScroll: true }));
  };
  handle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    startX = event.clientX;
    startY = event.clientY;
    pointerId = event.pointerId;
    dragging = false;
    handle.setPointerCapture(pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging && Math.hypot(dx, dy) < 6) return;
    dragging = true;
    card.classList.add('is-dragging');
    document.body.classList.add('is-reordering');
    card.style.transform = `translate(${dx}px, ${dy}px)`;
    const hovered = document.elementFromPoint(event.clientX, event.clientY)?.closest('.portfolio-tile');
    clearTarget();
    if (!hovered || hovered === card || hovered.parentElement !== grid) return;
    targetCard = hovered;
    // Dropping anywhere on a photo moves the dragged photo to that slot.
    // A hidden half-card threshold made dropping onto the first photo appear broken.
    placeAfter = chapter.photos.indexOf(id) < chapter.photos.indexOf(hovered.dataset.photoId);
    hovered.classList.add(placeAfter ? 'drop-after' : 'drop-before');
  });
  handle.addEventListener('pointerup', event => { if (event.pointerId === pointerId) finish(true); });
  handle.addEventListener('pointercancel', () => finish(false));
  handle.addEventListener('keydown', event => {
    if (event.key === 'Escape') finish(false);
  });
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
    const earlier = smallButton('←', () => moveItem(items, index, -1), index === 0);
    earlier.setAttribute('aria-label', `Move ${photo.caption?.en || photo.alt || 'photo'} earlier`);
    earlier.title = 'Move earlier';
    const later = smallButton('→', () => moveItem(items, index, 1), index === items.length - 1);
    later.setAttribute('aria-label', `Move ${photo.caption?.en || photo.alt || 'photo'} later`);
    later.title = 'Move later';
    actions.append(earlier, later);
    if (options.removable) actions.append(smallButton('Remove', () => removeFromArray(items, index)));
  }
  details.append(actions);
  if (photo.caption && typeof photo.caption === 'object' || photo.alt !== undefined) {
    const more = element('details', 'image-details');
    more.append(element('summary', '', photo.caption && typeof photo.caption === 'object' ? 'Edit caption' : 'Image details'));
    if (photo.caption && typeof photo.caption === 'object') bilingual(more, 'Caption', photo.caption, false);
    if (photo.alt !== undefined) textField(more, 'Image description', photo.alt, next => { photo.alt = next; });
    details.append(more);
  }
  card.append(image, details);
  parent.append(card);
  return card;
}

function renderIdentity() {
  const profile = group('Your profile', 'Your name and location.');
  bilingual(profile, 'Name', draft.identity.name, false);
  bilingual(profile, 'Location', draft.identity.location, false);
  const measurements = group('Measurements', 'Choose what to show.');
  for (const key of measurementOrder) {
    const item = draft.identity.measurements[key];
    if (!item) continue;
    const block = element('div', 'field-group');
    const label = measurementNames[key] || key;
    if (typeof item.value === 'object') bilingual(block, label, item.value, false);
    else textField(block, label, item.value, next => { item.value = next; });
    checkbox(block, `Show ${label.toLowerCase()} on the public site`, item.visible, next => { item.visible = next; });
    measurements.append(block);
  }
  const wording = detailBlock('Role & tagline', 'Introduce your work.');
  bilingual(wording, 'Role', draft.identity.role, false);
  bilingual(wording, 'Tagline', draft.identity.tagline, false);
}
function renderHome() {
  const hero = group('Cover image', 'The first photo visitors see.');
  hero.classList.add('hero-edit');
  const heroCard = { src: draft.home.heroImage, alt: 'Vasilina portfolio hero' };
  imageCard(hero, heroCard, null, 0, { title: 'Hero image', onReplace: src => { draft.home.heroImage = src; } });
  const selected = group('Selected work', 'Choose the order of your four featured photos.');
  selected.classList.add('media-grid-group');
  draft.home.selectedWork.forEach((photo, index) => imageCard(selected, photo, draft.home.selectedWork, index));
  const more = detailBlock('Homepage wording', 'Opening words and the invitation to book you.');
  const words = group('Opening words');
  bilingual(words, 'Statement', draft.home.manifesto.lead);
  bilingual(words, 'Introduction', draft.home.manifesto.body);
  const closing = group('Booking invitation');
  bilingual(closing, 'Invitation', draft.home.availabilityIntro);
  more.append(words, closing);
  const clientOptions = detailBlock('Client logos', 'Edit names, logos, and order.');
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
  clientOptions.append(clients);
  const footer = detailBlock('Footer wording', 'Your description at the bottom of the page.');
  bilingual(footer, 'Short description', draft.footer.description);
}
function renderPortfolio() {
  const upload = group('Add a photo', 'Choose a photo and a section.');
  const uploadSection = element('label', 'field upload-section');
  uploadSection.append(element('span', '', 'Add to section'));
  const uploadTarget = document.createElement('select');
  draft.home.portfolioChapters.forEach(chapter => uploadTarget.append(new Option(chapter.title.en, chapter.id)));
  uploadSection.append(uploadTarget);
  upload.append(uploadSection);
  filePicker(upload, 'Choose a photo', (src, file) => {
    const id = `portfolio-${crypto.randomUUID()}`;
    draft.home.portfolioPhotos.push({ id, src, alt: file.name.replace(/\.[^.]+$/, ''), caption: { en: '', th: '' } });
    const target = draft.home.portfolioChapters.find(chapter => chapter.id === uploadTarget.value) || draft.home.portfolioChapters[0];
    target.photos.push(id);
  });
  const photoMap = new Map(draft.home.portfolioPhotos.map(photo => [photo.id, photo]));
  const placedIds = new Set(draft.home.portfolioChapters.flatMap(chapter => chapter.photos));
  const offPagePhotos = draft.home.portfolioPhotos.filter(photo => !placedIds.has(photo.id));
  const offPage = element('details', 'hidden-photos');
  offPage.id = 'hiddenPhotos';
  offPage.open = hiddenPhotosOpen;
  const hiddenSummary = element('summary', '', `Hidden photos (${offPagePhotos.length})`);
  hiddenSummary.addEventListener('click', () => { hiddenPhotosOpen = !offPage.open; });
  offPage.append(hiddenSummary);
  offPage.append(element('p', 'group-note', 'Choose a section to show a hidden photo again.'));
  if (!offPagePhotos.length) {
    offPage.append(element('p', 'group-note off-page-empty', 'No hidden photos right now.'));
  } else {
    const offPageGrid = element('div', 'off-page-grid');
    offPagePhotos.forEach((photo, index) => {
      const card = element('div', 'media-card');
      const image = document.createElement('img');
      image.alt = photo.alt || 'Portfolio photo';
      imageFromSource(photo.src).then(src => { image.src = src; });
      const details = element('div', 'media-details');
      details.append(element('strong', '', photo.caption.en || photo.alt || `Photo ${index + 1}`));
      const sectionField = element('label', 'field');
      sectionField.append(element('span', '', 'Return to section'));
      const selector = document.createElement('select');
      selector.setAttribute('aria-label', `Choose section for ${photo.caption.en || photo.alt || 'photo'}`);
      draft.home.portfolioChapters.forEach(chapter => selector.append(new Option(chapter.title.en, chapter.id)));
      sectionField.append(selector);
      const addButton = smallButton('Add back', () => {
        const target = draft.home.portfolioChapters.find(chapter => chapter.id === selector.value);
        if (!target) return;
        changePortfolioPlacement(() => target.photos.push(photo.id), `Photo returned to ${target.title.en}`);
      });
      addButton.classList.add('add-page-action');
      const editOptions = element('details', 'off-page-options');
      editOptions.append(element('summary', '', 'Edit photo'));
      filePicker(editOptions, 'Replace image', src => { photo.src = src; });
      bilingual(editOptions, 'Caption', photo.caption, false);
      textField(editOptions, 'Image description', photo.alt, next => { photo.alt = next; }, true);
      details.append(sectionField, addButton, editOptions);
      card.append(image, details);
      offPageGrid.append(card);
    });
    offPage.append(offPageGrid);
  }
  editor.append(offPage);
  for (const chapter of draft.home.portfolioChapters) {
    const block = group(chapter.title.en, `${chapter.photos.length} photos · Drag or use the arrows to reorder.`);
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
      card.dataset.photoId = id;
      const image = document.createElement('img');
      image.alt = photo.alt;
      imageFromSource(photo.src).then(src => { image.src = src; });
      const dragHandle = element('button', 'drag-handle', '⠿');
      dragHandle.type = 'button';
      dragHandle.setAttribute('aria-label', `Drag ${photo.caption.en || photo.alt} to reorder`);
      dragHandle.title = 'Drag to reorder';
      enablePhotoDrag(dragHandle, card, grid, chapter, id);
      const details = element('div', 'media-details');
      details.append(element('strong', '', photo.caption.en || photo.alt));
      const actions = element('div', 'media-actions');
      actions.classList.add('portfolio-order-actions');
      actions.append(element('span', 'portfolio-order-label', 'Order'));
      const earlier = smallButton('←', () => movePortfolioPhoto(chapter, index, -1), index === 0);
      earlier.setAttribute('aria-label', `Move ${photo.caption.en || photo.alt} earlier`);
      earlier.title = 'Move earlier';
      const later = smallButton('→', () => movePortfolioPhoto(chapter, index, 1), index === chapter.photos.length - 1);
      later.setAttribute('aria-label', `Move ${photo.caption.en || photo.alt} later`);
      later.title = 'Move later';
      actions.append(earlier, later);
      details.append(actions);
      const photoOptions = element('details', 'photo-options');
      photoOptions.append(element('summary', '', 'Edit / move photo'));
      const optionContent = element('div', 'photo-option-content');
      const sectionLabel = element('label', 'field');
      sectionLabel.append(element('span', '', 'Show in section'));
      const selector = document.createElement('select');
      selector.setAttribute('aria-label', `Move ${photo.caption.en || photo.alt} to another section`);
      selector.append(new Option(chapter.title.en, ''));
      for (const target of draft.home.portfolioChapters) {
        if (target !== chapter) selector.append(new Option(target.title.en, target.id));
      }
      selector.addEventListener('change', () => {
        const target = draft.home.portfolioChapters.find(item => item.id === selector.value);
        if (!target) return;
        changePortfolioPlacement(() => {
          chapter.photos.splice(index, 1);
          target.photos.push(id);
        }, `Photo moved to ${target.title.en}`);
      });
      sectionLabel.append(selector);
      const photoActions = element('div', 'portfolio-photo-actions');
      filePicker(photoActions, 'Replace photo', src => { photo.src = src; });
      const remove = smallButton('Remove from page', () => {
        changePortfolioPlacement(() => {
          chapter.photos.splice(index, 1);
          hiddenPhotosOpen = true;
        }, 'Moved to Hidden photos');
      });
      remove.classList.add('remove-page-action');
      remove.title = 'Keep this photo in Hidden photos';
      photoActions.append(remove);
      optionContent.append(sectionLabel);
      bilingual(optionContent, 'Caption', photo.caption, false);
      textField(optionContent, 'Image description', photo.alt, next => { photo.alt = next; }, true);
      optionContent.append(photoActions);
      photoOptions.append(optionContent);
      details.append(photoOptions);
      card.append(image, dragHandle, details);
      grid.append(card);
    });
    block.append(grid);
  }
}
function renderDigitals() {
  const groupNode = group('Current digitals', 'Add, replace, or reorder your digitals.');
  groupNode.classList.add('media-grid-group');
  draft.home.digitals.forEach((photo, index) => imageCard(groupNode, photo, draft.home.digitals, index, { removable: true }));
  filePicker(groupNode, 'Add a digital', (src, file) => {
    draft.home.digitals.push({ id: `digital-${crypto.randomUUID()}`, src, alt: file.name.replace(/\.[^.]+$/, ''), caption: { en: '', th: '' } });
  });
}
const knownMotionTitles = {
  '72zcf1ea44': "LEVI'S",
  dzx8dcdotx: 'Fashion show',
};
function motionTitle(video, index) {
  if (video.title?.trim()) return video.title.trim();
  if (knownMotionTitles[video.mediaId]) return knownMotionTitles[video.mediaId];
  const filename = (video.name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return filename || `Video ${index + 1}`;
}
function renderMotion() {
  const videos = group('Your videos', 'Add videos and choose their order.');
  draft.home.motion.forEach((video, index) => {
    const block = element('div', 'motion-edit-card');
    const preview = element('div', 'motion-edit-preview');
    const details = element('div', 'motion-edit-details');
    const fallbackTitle = motionTitle(video, index);
    const name = element('p', 'motion-edit-name', fallbackTitle);
    details.append(name);
    if (video.provider === 'file' && video.src) {
      const player = document.createElement('video');
      player.controls = true;
      player.playsInline = true;
      player.preload = 'metadata';
      player.setAttribute('aria-label', `${fallbackTitle} preview`);
      player.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(player.duration) && player.duration > 0.1) {
          player.currentTime = Math.min(0.1, player.duration / 2);
        }
      });
      const playbackNote = element('p', 'group-note motion-playback-note',
        video.type === 'video/quicktime' || /\.mov$/i.test(video.name || '')
          ? 'MOV playback can vary by browser. Check the preview before publishing.' : '');
      player.addEventListener('error', () => {
        playbackNote.textContent = 'This browser cannot play this clip. It may also fail for visitors; use an MP4 before publishing.';
      });
      imageFromSource(video.src).then(src => { player.src = src; });
      preview.append(player);
      if (playbackNote.textContent) details.append(playbackNote);
      else player.addEventListener('error', () => details.append(playbackNote), { once: true });
    } else if (video.provider === 'wistia' && video.mediaId) {
      const thumbnail = document.createElement('img');
      thumbnail.src = `https://fast.wistia.com/embed/medias/${encodeURIComponent(video.mediaId)}/swatch`;
      thumbnail.alt = `${fallbackTitle} video thumbnail`;
      thumbnail.loading = 'lazy';
      thumbnail.addEventListener('error', () => {
        thumbnail.replaceWith(element('span', 'motion-existing-label', fallbackTitle));
      }, { once: true });
      preview.append(thumbnail);
      details.append(element('p', 'group-note', 'Already on your portfolio'));
    } else {
      preview.append(element('span', 'motion-existing-label', fallbackTitle));
    }
    const rename = element('details', 'motion-rename');
    rename.append(element('summary', '', 'Rename video'));
    textField(rename, 'Video name', video.title || fallbackTitle, next => {
      video.title = next;
      name.textContent = next.trim() || fallbackTitle;
      const player = preview.querySelector('video');
      if (player) player.setAttribute('aria-label', `${name.textContent} preview`);
    });
    details.append(rename);
    const actions = element('div', 'media-actions');
    actions.append(
      smallButton('Move earlier', () => moveItem(draft.home.motion, index, -1), index === 0),
      smallButton('Move later', () => moveItem(draft.home.motion, index, 1), index === draft.home.motion.length - 1),
      smallButton('Remove', () => removeFromArray(draft.home.motion, index)),
    );
    details.append(actions);
    block.append(preview, details);
    videos.append(block);
  });
  videoPicker(videos);
  const stills = group('Motion stills', 'Choose two photos to show below your videos.');
  const photoMap = new Map(draft.home.portfolioPhotos.map(photo => [photo.id, photo]));
  for (let index = 0; index < 2; index++) {
    const id = draft.home.motionStills[index];
    const photo = photoMap.get(id);
    const card = element('div', 'media-card motion-still-card');
    const image = document.createElement('img');
    image.alt = photo?.alt || `Motion still ${index + 1}`;
    if (photo) imageFromSource(photo.src).then(src => { image.src = src; });
    const details = element('div', 'media-details');
    details.append(element('strong', '', `Still ${index + 1}`));
    if (photo) details.append(element('p', 'group-note', photo.caption?.en || photo.alt || 'Selected photo'));
    filePicker(details, 'Upload a new still', (src, file) => {
      const newPhoto = {
        id: `motion-still-${crypto.randomUUID()}`,
        src,
        alt: file.name.replace(/\.[^.]+$/, ''),
        caption: { en: '', th: '' },
      };
      draft.home.portfolioPhotos.push(newPhoto);
      draft.home.motionStills[index] = newPhoto.id;
    });
    const picker = element('details', 'motion-still-picker');
    picker.append(element('summary', '', 'Choose from your photos'));
    const choices = element('div', 'gallery-pick motion-still-choices');
    for (const choice of draft.home.portfolioPhotos) {
      const label = element('label', 'motion-still-choice');
      const thumbnail = document.createElement('img');
      thumbnail.alt = choice.alt || 'Portfolio photo';
      thumbnail.loading = 'lazy';
      imageFromSource(choice.src).then(src => { thumbnail.src = src; });
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `motion-still-${index}`;
      radio.value = choice.id;
      radio.checked = choice.id === id;
      radio.setAttribute('aria-label', choice.caption?.en || choice.alt || 'Portfolio photo');
      radio.addEventListener('change', () => {
        draft.home.motionStills[index] = choice.id;
        markChanged();
        renderSection();
      });
      label.append(thumbnail, radio, element('span', '', choice.caption?.en || choice.alt || 'Portfolio photo'));
      choices.append(label);
    }
    picker.append(choices);
    card.append(image, details, picker);
    stills.append(card);
  }
}
function renderAbout() {
  const story = group('Your story', 'Your introduction and biography.');
  bilingual(story, 'Introduction', draft.about.intro);
  draft.about.biography.forEach((paragraph, index) => {
    const block = element('div', 'field-group');
    bilingual(block, `Biography paragraph ${index + 1}`, paragraph);
    if (!portfolioBackendReady && index > 0) block.append(smallButton('Remove paragraph', () => removeFromArray(draft.about.biography, index)));
    story.append(block);
  });
  if (!portfolioBackendReady) story.append(smallButton('Add a paragraph', () => {
    draft.about.biography.push({ en: '', th: '' }); markChanged(); renderSection();
  }));
  const portrait = group('Portrait');
  imageCard(portrait, draft.about.portrait, null, 0, { title: 'About portrait' });
  textField(portrait, 'Photo caption', draft.about.portrait.caption, next => { draft.about.portrait.caption = next; });
  const agency = detailBlock('Agency details', 'Edit your agency and choose whether to show it.');
  textField(agency, 'Agency name', draft.about.agency.name, next => { draft.about.agency.name = next; });
  bilingual(agency, 'Agency description', draft.about.agency.description);
  textField(agency, 'Agency link', draft.about.agency.url, next => { draft.about.agency.url = next; });
  checkbox(agency, 'Show agency section', draft.about.agency.visible, next => { draft.about.agency.visible = next; });
  const closing = detailBlock('Closing invitation', 'The final words on your About page.');
  bilingual(closing, 'Invitation', draft.about.closing);
}
function renderBooking() {
  const contact = group('Contact options', 'Choose how clients can reach you.');
  for (const [name, item] of Object.entries(draft.booking.contact)) {
    const block = element('div', 'field-group');
    textField(block, name[0].toUpperCase() + name.slice(1), item.value, next => { item.value = next; });
    checkbox(block, `Show ${name} publicly`, item.visible, next => { item.visible = next; });
    contact.append(block);
  }
  const calendarTools = group('Your calendar', 'Manage availability and event details in Cal.com.');
  const openCalendar = element('a', 'calendar-account-link', 'Open Cal.com ↗');
  openCalendar.href = 'https://app.cal.com/event-types';
  openCalendar.target = '_blank';
  openCalendar.rel = 'noopener noreferrer';
  openCalendar.setAttribute('aria-label', 'Open Cal.com in a new tab');
  calendarTools.append(openCalendar);
  const calendar = detailBlock('Calendar connection', 'Change the event shown on your website.');
  const link = textField(calendar, 'Cal.com event link', draft.booking.calLink, next => { draft.booking.calLink = next; });
  link.placeholder = 'https://cal.com/your-name/your-event';
  link.addEventListener('change', () => {
    if (normalizeCalLink(link.value) && document.querySelector('#previewPage').value === 'booking') loadPreviewPage();
  });
  const words = detailBlock('Booking page wording', 'Headlines and instructions around the calendar. The calendar’s own text is edited in Cal.com.');
  bilingual(words, 'Page headline', draft.booking.headline);
  bilingual(words, 'Introduction above calendar', draft.booking.intro);
  bilingual(words, 'Rates note above calendar', draft.booking.note);
  bilingual(words, 'Instruction beside calendar', draft.booking.calendarIntro);
  bilingual(words, 'Introduction above contact links', draft.booking.contactIntro);
}
function renderCompCard() {
  const card = group('Your current comp card', 'Upload or replace your comp card.');
  const uploaded = draft.compCard.uploadedFile;
  const uploadedImage = uploaded?.type?.startsWith('image/') && uploaded?.src;
  const downloadSource = uploadedImage ? uploaded.src : draft.compCard.currentDownload || seed.compCard.currentDownload;
  const downloadName = uploadedImage ? uploaded.name : 'Lina_Comp_Card.png';
  const preview = element('div', 'comp-upload-preview');
  if (uploadedImage) {
    const image = document.createElement('img');
    image.alt = 'Uploaded comp card preview';
    imageFromSource(uploaded.src).then(src => { image.src = src; });
    preview.append(image);
  } else {
    const image = document.createElement('img');
    image.alt = 'Current Vasilina comp card';
    imageFromSource(draft.compCard.currentPreview).then(src => { image.src = src; });
    preview.append(image);
  }
  const info = element('div', 'comp-upload-info');
  info.append(element('strong', '', uploadedImage ? uploaded.name : 'Vasilina comp card'));
  info.append(element('p', 'group-note', uploadedImage
    ? portfolioBackendReady ? 'Uploaded image saved to your private draft when you press Save draft.' : 'This image stays in this browser until you save it.'
    : 'The current image is ready to view and download.'));
  const download = element('a', 'outline-button', 'Download comp card');
  download.href = '#';
  download.download = downloadName;
  download.addEventListener('click', async event => {
    event.preventDefault();
    if (download.dataset.downloading) return;
    download.dataset.downloading = 'true';
    download.textContent = 'Preparing download…';
    try {
      const response = await fetch(await imageFromSource(downloadSource));
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const url = URL.createObjectURL(await response.blob());
      const link = element('a');
      link.href = url;
      link.download = downloadName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setSaveStatus('error', `Could not download the comp card: ${error.message}`);
    } finally {
      download.textContent = 'Download comp card';
      delete download.dataset.downloading;
    }
  });
  info.append(download);
  preview.append(info);
  card.append(preview);
  filePicker(card, uploadedImage ? 'Replace comp card' : 'Upload your comp card', (src, file) => {
    draft.compCard.uploadedFile = { src, name: file.name, type: file.type };
  }, 'image/png,image/jpeg,image/webp');
  card.append(element('p', 'group-note', 'PNG, JPG, or WebP · Up to 20 MB. Publish to update the public download.'));
}
function renderSection() {
  editor.replaceChildren();
  document.querySelectorAll('.studio-nav button').forEach(button => {
    button.classList.toggle('active', button.dataset.section === activeSection);
  });
  document.querySelector('#studioSectionPicker').value = activeSection;
  document.querySelector('#sectionTitle').textContent = sectionTitles[activeSection][0];
  document.querySelector('#sectionDescription').textContent = sectionTitles[activeSection][1];
  ({ identity: renderIdentity, home: renderHome, portfolio: renderPortfolio,
    digitals: renderDigitals, motion: renderMotion, about: renderAbout,
    booking: renderBooking, compCard: renderCompCard })[activeSection]();
  updateLanguageVisibility();
}
function chooseSection(section) {
  if (!sectionTitles[section]) return;
  activeSection = section;
  renderSection();
  document.querySelector('#previewPage').value = section === 'about' ? 'about' : section === 'booking' ? 'booking' : 'home';
  loadPreviewPage();
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
    setSaveStatus('busy', 'Uploading photo…');
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
function setEditorialLang(doc, selector, value) {
  const root = doc.querySelector(selector);
  if (!root || !value) return;
  for (const lang of ['en', 'th']) {
    const target = root.querySelector(`[lang="${lang}"]`);
    if (!target) continue;
    const next = value[lang] || '';
    if (target.textContent.replace(/\s+/g, '') !== next.replace(/\s+/g, '')) target.textContent = next;
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
  setEditorialLang(doc, '.manifesto-lead', content.home.manifesto.lead);
  for (const lang of ['en', 'th']) {
    const target = doc.querySelector(`.manifesto-detail p[lang="${lang}"]`);
    if (target) target.textContent = content.home.manifesto.body[lang];
  }
  const frames = doc.querySelectorAll('.story-grid .story-frame');
  for (let i = 0; i < frames.length; i++) {
    const photo = content.home.selectedWork[i];
    frames[i].hidden = !photo;
    if (!photo) continue;
    const image = frames[i].querySelector('img');
    await setImage(image, photo.src, photo.alt);
    image.dataset.captionEn = photo.caption?.en || '';
    image.dataset.captionTh = photo.caption?.th || '';
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
    row.style.display = item.visible === false ? 'none' : '';
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
      if (photo) {
        await setImage(images[i], photo.src, photo.alt);
        images[i].dataset.captionEn = photo.caption?.en || '';
        images[i].dataset.captionTh = photo.caption?.th || '';
      }
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
        image.dataset.captionEn = photo.caption?.en || '';
        image.dataset.captionTh = photo.caption?.th || '';
        spread.append(image);
      }
      container.append(spread);
    }
  }
  const digitalsContainer = doc.querySelector('.digitals-grid');
  digitalsContainer.replaceChildren();
  for (const photo of content.home.digitals) {
    const image = doc.createElement('img');
    image.className = 'reveal active';
    image.loading = 'lazy';
    await setImage(image, photo.src, photo.alt);
    image.dataset.captionEn = photo.caption?.en || '';
    image.dataset.captionTh = photo.caption?.th || '';
    digitalsContainer.append(image);
  }
  await renderMotionGallery(doc, content.home.motion, imageFromSource);
  await renderMotionStills(doc, content.home.motionStills, content.home.portfolioPhotos, imageFromSource);
  setLang(doc, '.home-availability .availability-copy > p', content.home.availabilityIntro);
  const compImage = doc.querySelector('#compCardImg');
  const uploadedCard = content.compCard.uploadedFile;
  const uploadedImage = uploadedCard?.type?.startsWith('image/') && uploadedCard?.src;
  if (compImage) await setImage(compImage,
    uploadedImage ? uploadedCard.src : content.compCard.currentPreview,
    'Vasilina Panina comp card');
  const download = doc.querySelector('#compCardDownload');
  if (download) {
    download.href = await imageFromSource(uploadedImage ? uploadedCard.src : content.compCard.currentDownload || seed.compCard.currentDownload);
    download.download = uploadedImage ? uploadedCard.name : 'Lina_Comp_Card.png';
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
    if (surname) surname.textContent = words.slice(1).join(' ') + (lang === 'en' ? '.' : '');
  }
  await setImage(doc.querySelector('.about-image img'), content.about.portrait.src, content.about.portrait.alt);
  const caption = doc.querySelector('.about-image figcaption span:last-child');
  if (caption) caption.textContent = content.about.portrait.caption;
  const portraitName = doc.querySelector('.about-image figcaption span:first-child');
  if (portraitName) portraitName.textContent = content.identity.name.en;
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
  if (agencyName) {
    const [first, ...rest] = content.about.agency.name.trim().split(/\s+/);
    agencyName.replaceChildren(first || '', doc.createElement('br'), rest.join(' ') + (rest.length ? '.' : ''));
  }
  const agencyLink = doc.querySelector('.practice-copy a');
  if (agencyLink) agencyLink.href = content.about.agency.url;
  setEditorialLang(doc, '.about-closing .closing-statement', content.about.closing);
  const logos = doc.querySelectorAll('.about-client-logos img');
  for (let i = 0; i < logos.length; i++) {
    const client = content.home.selectedClients[i];
    logos[i].hidden = !client;
    if (client) await setImage(logos[i], client.logo, client.name);
  }
  applyFooterPreview(doc, content);
}
function applyBookingPreview(doc, content) {
  applyBookingContent(doc, content.booking, content.identity);
  mountBookingCalendar(doc, content.booking.calLink);
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
  const pageRoot = { home: '.home-hero', about: '.about-opening', booking: '.booking-opening' }[page];
  if (!doc.querySelector(pageRoot)) return;
  if (page === 'home') await applyHomePreview(doc, content);
  if (page === 'about') await applyAboutPreview(doc, content);
  if (page === 'booking') applyBookingPreview(doc, content);
}
function loadPreviewPage() {
  const page = document.querySelector('#previewPage').value;
  const anchors = {
    identity: '#measurements', portfolio: '#portfolio', digitals: '#digitals',
    motion: '#motion', compCard: '#measurements',
    about: '#about-portrait', booking: '.booking-desk',
  };
  previewAnchor = activeSection === 'home' ? '' : anchors[activeSection] || '';
  frame.src = `../${page === 'home' ? 'index' : page}.html?studio-preview=15`;
}
function scrollPreviewToSection() {
  if (!previewAnchor) return;
  const target = frame.contentDocument?.querySelector(previewAnchor);
  if (!target) return;
  const previewWindow = frame.contentWindow;
  previewWindow.scrollTo(0, target.getBoundingClientRect().top + previewWindow.scrollY - 64);
}
async function saveDraft() {
  if (saveInProgress) return false;
  if (!normalizeCalLink(draft.booking?.calLink)) {
    setSaveStatus('error', 'Could not save · enter a valid Cal.com event link');
    return false;
  }
  const versionToSave = snapshot(draft);
  const button = document.querySelector('#saveButton');
  const publishButton = document.querySelector('#publishButton');
  saveInProgress = true;
  button.disabled = true;
  publishButton.disabled = true;
  setSaveStatus('busy', 'Saving draft…');
  try {
    if (portfolioBackendReady) {
      draftRevision = await saveOwnerDraft(remotePortfolio.id, JSON.parse(versionToSave), draftRevision);
    } else {
      localStorage.setItem(DRAFT_KEY, versionToSave);
    }
    savedSnapshot = versionToSave;
    updateSaveStatus();
    return !hasUnsavedChanges();
  } catch (error) {
    setSaveStatus('error', `Could not save draft: ${error.message}`);
    return false;
  } finally {
    saveInProgress = false;
    button.disabled = false;
    publishButton.disabled = publishInProgress;
  }
}
function openPublishDialog() {
  if (saveInProgress || publishInProgress) return;
  const dialog = document.querySelector('#publishDialog');
  const demo = !portfolioBackendReady;
  document.querySelector('#publishDialogTitle').textContent = demo ? 'Simulate publication?' : 'Publish to website?';
  document.querySelector('#publishDialogDescription').textContent = demo
    ? 'This saves your demo edits and updates only the published preview on this device. The public website will not change.'
    : 'This saves your current edits and updates Vasilina’s public website. Anyone with the link can see the changes.';
  document.querySelector('#publishConfirmButton').textContent = demo ? 'Simulate publish' : 'Publish now';
  dialog.showModal();
}
async function simulatePublish() {
  if (saveInProgress || publishInProgress) return;
  const button = document.querySelector('#publishButton');
  const saveButton = document.querySelector('#saveButton');
  publishInProgress = true;
  button.disabled = true;
  try {
    if (!await saveDraft()) return;
    const versionToPublish = savedSnapshot;
    saveButton.disabled = true;
    if (portfolioBackendReady) {
      setSaveStatus('busy', 'Publishing changes to your public website…');
      await publishOwnerDraft(remotePortfolio.id);
      published = JSON.parse(versionToPublish);
      publishedSnapshot = versionToPublish;
      if (hasUnsavedChanges()) updateSaveStatus();
      else setSaveStatus('published', 'Published · public website updated');
    } else {
      published = JSON.parse(versionToPublish);
      publishedSnapshot = versionToPublish;
      localStorage.setItem(PUBLISHED_KEY, JSON.stringify(published));
      if (hasUnsavedChanges()) updateSaveStatus();
      else setSaveStatus('published', 'Simulated publication · public website unchanged');
    }
    updatePreviewVersionNote();
    if (previewVersion === 'published') {
      if (document.querySelector('#previewPage').value === 'booking') loadPreviewPage();
      else applyPreview();
    }
  } catch (error) {
    setSaveStatus('error', `Could not publish: ${error.message}`);
  } finally {
    publishInProgress = false;
    button.disabled = false;
    saveButton.disabled = false;
  }
}
function resetDemo() {
  if (!confirm('Reset this local demonstration to Vasilina’s current portfolio?')) return;
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(PUBLISHED_KEY);
  draft = copy(seed);
  published = copy(seed);
  savedSnapshot = snapshot(draft);
  publishedSnapshot = snapshot(published);
  renderSection();
  loadPreviewPage();
  setSaveStatus('saved', 'Demo reset · public website unchanged');
  updatePreviewVersionNote();
}
function showLogin(message = '') {
  document.querySelector('#studioLogin').hidden = false;
  document.querySelector('#studioActions').hidden = true;
  document.querySelector('#studioWorkspace').hidden = true;
  document.querySelector('#studioNav').hidden = true;
  document.querySelector('.mobile-section-picker').hidden = true;
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
  savedSnapshot = snapshot(draft);
  publishedSnapshot = snapshot(published);
  activeSection = 'portfolio';
  previewVersion = 'draft';
  document.querySelector('#studioLogin').hidden = true;
  document.querySelector('#studioActions').hidden = false;
  document.querySelector('#studioWorkspace').hidden = false;
  document.querySelector('#studioNav').hidden = false;
  document.querySelector('.mobile-section-picker').hidden = false;
  document.querySelector('#signOutButton').hidden = false;
  document.querySelector('#previewPage').value = 'home';
  document.querySelector('#draftPreviewButton').classList.add('selected');
  document.querySelector('#publishedPreviewButton').classList.remove('selected');
  document.querySelector('#draftPreviewButton').setAttribute('aria-pressed', 'true');
  document.querySelector('#publishedPreviewButton').setAttribute('aria-pressed', 'false');
  renderSection();
  loadPreviewPage();
  requestAnimationFrame(updatePreviewScale);
  updateSaveStatus();
}
function configureRemoteInterface() {
  document.querySelector('.studio-shell').classList.add('connected-studio');
  document.querySelector('#studioMode').textContent = 'Connected portfolio';
  document.querySelector('#studioNotice').hidden = true;
  document.querySelector('#resetButton').hidden = true;
  document.querySelector('#saveButton').textContent = 'Save draft';
  document.querySelector('#publishButton').textContent = 'Publish to website';
  document.querySelector('#publishedPreviewButton').textContent = 'Published site';
  document.querySelector('.preview-note').textContent = 'Preview your changes here. Publish to update your website.';
  document.querySelectorAll('.studio-nav button').forEach(button => { button.hidden = !['home', 'portfolio', 'digitals', 'motion', 'identity', 'about', 'compCard', 'booking'].includes(button.dataset.section); });
  document.querySelector('.sidebar-note').textContent = 'Edit your photos and story. Publish when the page feels right.';
}
async function start() {
  const response = await fetch('/studio/vasilina-content.json?v=studio-12', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load Vasilina’s starting content');
  seed = await response.json();
  if (matchMedia('(max-width: 700px)').matches) setPreviewDevice('mobile');
  document.querySelectorAll('.studio-nav button').forEach(button => {
    button.addEventListener('click', () => chooseSection(button.dataset.section));
  });
  document.querySelector('#studioSectionPicker').addEventListener('change', event => chooseSection(event.target.value));
  document.querySelector('#previewPage').addEventListener('change', loadPreviewPage);
  document.querySelector('#saveButton').addEventListener('click', saveDraft);
  document.querySelector('#publishButton').addEventListener('click', openPublishDialog);
  document.querySelector('#publishCancelButton').addEventListener('click', () => document.querySelector('#publishDialog').close());
  document.querySelector('#publishConfirmButton').addEventListener('click', () => {
    document.querySelector('#publishDialog').close();
    simulatePublish();
  });
  document.querySelector('#resetButton').addEventListener('click', resetDemo);
  document.querySelector('#draftPreviewButton').addEventListener('click', () => setPreviewVersion('draft'));
  document.querySelector('#publishedPreviewButton').addEventListener('click', () => setPreviewVersion('published'));
  document.querySelector('#editViewButton').addEventListener('click', () => setMobileView('edit'));
  document.querySelector('#previewViewButton').addEventListener('click', () => setMobileView('preview'));
  document.querySelector('#desktopPreviewButton').addEventListener('click', () => setPreviewDevice('desktop'));
  document.querySelector('#mobilePreviewButton').addEventListener('click', () => setPreviewDevice('mobile'));
  document.querySelector('#fitPreviewButton').addEventListener('click', () => {
    previewAutoFit = true;
    updatePreviewScale();
  });
  previewZoom.addEventListener('input', () => {
    previewAutoFit = false;
    updatePreviewScale();
  });
  new ResizeObserver(updatePreviewScale).observe(previewWrap);
  document.querySelector('#signOutButton').addEventListener('click', () => {
    if (hasUnsavedChanges() && !confirm('You have unsaved changes. Sign out and discard them?')) return;
    signOut();
    draft = null;
    published = null;
    savedSnapshot = null;
    publishedSnapshot = null;
    remotePortfolio = null;
    showLogin('Signed out.');
  });
  window.addEventListener('beforeunload', event => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
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
  frame.addEventListener('load', async () => {
    const doc = frame.contentDocument;
    const splash = doc?.querySelector('#splash-screen');
    if (splash) {
      splash.remove();
      doc.documentElement.classList.remove('scroll-locked');
      doc.documentElement.style.overflow = '';
      doc.body.style.overflow = '';
      doc.body.classList.add('hero-loaded');
      doc.querySelector('#hero')?.classList.add('loaded');
      doc.querySelectorAll('.hero .reveal').forEach(item => item.classList.add('active'));
    }
    await applyPreview();
    requestAnimationFrame(scrollPreviewToSection);
  });
  if (portfolioBackendReady) {
    configureRemoteInterface();
    if (hasOwnerSession()) {
      try { await loadRemotePortfolio(); }
      catch (error) { showLogin(error.message); }
    } else showLogin();
    document.querySelector('#studioOpening').hidden = true;
    return;
  }
  draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || copy(seed);
  published = JSON.parse(localStorage.getItem(PUBLISHED_KEY) || 'null') || copy(seed);
  for (const content of [draft, published]) {
    content.compCard.currentDownload = seed.compCard.currentDownload;
    delete content.compCard.currentPdf;
  }
  savedSnapshot = snapshot(draft);
  publishedSnapshot = snapshot(published);
  renderSection();
  requestAnimationFrame(updatePreviewScale);
  setSaveStatus('saved', 'Demo ready · public website unchanged');
  updatePreviewVersionNote();
  applyPreview();
  document.querySelector('#studioOpening').hidden = true;
}
function setPreviewVersion(version) {
  previewVersion = version;
  document.querySelector('#draftPreviewButton').classList.toggle('selected', version === 'draft');
  document.querySelector('#publishedPreviewButton').classList.toggle('selected', version === 'published');
  document.querySelector('#draftPreviewButton').setAttribute('aria-pressed', String(version === 'draft'));
  document.querySelector('#publishedPreviewButton').setAttribute('aria-pressed', String(version === 'published'));
  updatePreviewVersionNote();
  if (document.querySelector('#previewPage').value === 'booking') loadPreviewPage();
  else applyPreview();
}
start().catch(error => {
  setSaveStatus('error', error.message);
  document.querySelector('#studioOpening p').textContent = `Could not open Studio: ${error.message}`;
  console.error(error);
});
