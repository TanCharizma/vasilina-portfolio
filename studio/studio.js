import {
  portfolioBackendReady as configuredBackendReady, hasOwnerSession, signIn, signOut, getOwnedPortfolio,
  getDraft, saveOwnerDraft, publishOwnerDraft, getPublishedPortfolio, uploadOwnerImage, uploadOwnerVideo, ownerVideoFormat,
} from '../portfolio-backend.js?v=4';
import { renderPortfolioChapters } from '../portfolio-layout.js?v=1';
import { renderMotionGallery, renderMotionStills } from '../portfolio-motion.js';
import { applyBookingContent, mountBookingCalendar, normalizeCalLink } from '../portfolio-booking.js?v=3';
import { IMAGE_ACCEPT, HEIC_ACCEPT, validateImage, prepareImage } from './image-upload.js?v=1';

// The visual workspace shares the editor; the local trial keeps separate storage.
const visualLocal = new URLSearchParams(location.search).has('visual-local');
const visualMode = visualLocal || new URLSearchParams(location.search).has('visual-connected');
const portfolioBackendReady = configuredBackendReady && !visualLocal;
const DRAFT_KEY = visualLocal ? 'folio-lab-visual-draft-v2' : 'folio-lab-vasilina-demo-draft-v1';
const PUBLISHED_KEY = visualLocal ? 'folio-lab-visual-published-v2' : 'folio-lab-vasilina-demo-published-v1';
const ASSET_PREFIX = 'demo-asset:';
const sectionTitles = {
  identity: ['Profile & measurements', 'Edit your profile and measurements.'],
  home: ['Homepage', 'Edit your cover and homepage wording.'],
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
let openingStudio=true;
let seed;
let draft;
let published;
let activeSection = 'home';
let visualTarget = null;
let visualGalleryId = null;
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
let editHistory = [];
let historyPosition = 0;
let historyGroup = null;
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
  if (visualMode) parent.dispatchEvent(new Event('visual-studio-change'));
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
function resetHistory() {
  editHistory=[snapshot(draft)];historyPosition=0;historyGroup=null;updateHistoryButtons();
}
function updateHistoryButtons() {
  const undo=document.querySelector('#undoButton'),redo=document.querySelector('#redoButton');
  const show=editHistory.length>1;
  undo.hidden=redo.hidden=!show;
  undo.disabled=historyPosition===0;
  redo.disabled=historyPosition>=editHistory.length-1;
  undo.onclick=()=>travelHistory(-1);redo.onclick=()=>travelHistory(1);
}
function travelHistory(direction) {
  const next=historyPosition+direction;
  if(saveInProgress||publishInProgress||next<0||next>=editHistory.length)return;
  historyPosition=next;historyGroup=null;draft=JSON.parse(editHistory[next]);
  renderSection();updateHistoryButtons();updateSaveStatus();
  clearTimeout(previewTimer);previewTimer=setTimeout(applyPreview,150);
}
document.addEventListener('focusout',()=>{historyGroup=null;});
document.addEventListener('keydown',event=>{
  if(!(event.metaKey||event.ctrlKey)||event.key.toLowerCase()!=='z'||event.target.closest('input,textarea,[contenteditable]'))return;
  event.preventDefault();travelHistory(event.shiftKey?1:-1);
});
function markChanged(group=null) {
  const next=snapshot(draft);
  if(editHistory.length && next!==editHistory[historyPosition]) {
    if(group && group===historyGroup && historyPosition===editHistory.length-1)editHistory[historyPosition]=next;
    else {editHistory.splice(historyPosition+1);editHistory.push(next);historyPosition++;}
    historyGroup=group;
  }
  updateHistoryButtons();
  updateSaveStatus();
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
  input.addEventListener('input', () => { update(input.value); markChanged(input); });
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
function filePicker(parent, label, update, accept = IMAGE_ACCEPT) {
  const wrap = element('label', 'file-action', label);
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try { validateImage(file, accept); } catch (error) { alert(error.message); return; }
    input.disabled = true;
    try {
      const prepared = await prepareImage(file, () => setSaveStatus('busy', 'Converting HEIC photo…'));
      const src = await storeAsset(prepared);
      update(src, prepared);
      markChanged();
      renderSection();
    } catch (error) {
      updateSaveStatus();
      alert(`The image could not be uploaded: ${error.message}`);
    } finally {
      input.disabled = false;
      input.value = '';
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
  change();
  markChanged();
  renderSection();
  if (message && hasUnsavedChanges()) setSaveStatus('unsaved', `${message} · unsaved changes`);
}
function movePortfolioPhoto(chapter, index, direction) {
  const next = index + direction;
  if (next < 0 || next >= chapter.photos.length) return;
  changePortfolioPlacement(() => {
    [chapter.photos[index], chapter.photos[next]] = [chapter.photos[next], chapter.photos[index]];
  }, 'Photo reordered');
}
function enablePhotoDrag(handle, card, grid, chapter, id, reorder) {
  let startX = 0;
  let startY = 0;
  let pointerId = null;
  let dragging = false;
  let targetCard = null;
  let placeAfter = false;
  let lastX = 0;
  let lastY = 0;
  let startScrollY = 0;
  let dragFrame = 0;
  const clearTarget = () => {
    targetCard?.classList.remove('drop-before', 'drop-after');
    targetCard = null;
  };
  const finish = (commit) => {
    if (pointerId === null) return;
    const destination = targetCard?.dataset.photoId;
    const after = placeAfter;
    clearTarget();
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    card.classList.remove('is-dragging');
    card.style.transform = '';
    document.body.classList.remove('is-reordering');
    const capturedPointer = pointerId;
    pointerId = null;
    if (handle.hasPointerCapture(capturedPointer)) handle.releasePointerCapture(capturedPointer);
    if (!commit || !dragging || !destination) return;
    const from = chapter.photos.indexOf(id);
    const to = chapter.photos.indexOf(destination);
    if (from < 0 || to < 0) return;
    const insertion = to + (after ? 1 : 0);
    const adjusted = insertion > from ? insertion - 1 : insertion;
    if (adjusted === from) return;
    const change = () => {
      chapter.photos.splice(from, 1);
      chapter.photos.splice(adjusted, 0, id);
    };
    if (reorder) reorder(change); else changePortfolioPlacement(change, 'Photo reordered');
    requestAnimationFrame(() => editor.querySelector(`[data-photo-id="${CSS.escape(id)}"] .drag-handle`)?.focus({ preventScroll: true }));
  };
  const drawDrag = () => {
    if (!dragging || pointerId === null) return;
    const dockTop = document.querySelector('#studioActions').getBoundingClientRect().top;
    const bottom = !visualMode && matchMedia('(max-width: 700px)').matches ? dockTop : innerHeight;
    const edge = 64;
    const scrollStep = lastY < edge + 48 ? -Math.min(12, (edge + 48 - lastY) / 5)
      : lastY > bottom - edge ? Math.min(12, (lastY - bottom + edge) / 5) : 0;
    if (scrollStep) window.scrollBy(0, scrollStep);
    card.style.transform = `translate3d(${lastX - startX}px, ${lastY - startY + window.scrollY - startScrollY}px, 0)`;
    const hovered = document.elementFromPoint(lastX, lastY)?.closest('.portfolio-tile');
    if (hovered !== targetCard) {
      clearTarget();
      if (hovered && hovered !== card && hovered.parentElement === grid) {
        targetCard = hovered;
        placeAfter = chapter.photos.indexOf(id) < chapter.photos.indexOf(hovered.dataset.photoId);
        hovered.classList.add(placeAfter ? 'drop-after' : 'drop-before');
      }
    }
    dragFrame = requestAnimationFrame(drawDrag);
  };
  card.addEventListener('dragstart', event => event.preventDefault());
  handle.addEventListener('contextmenu', event => event.preventDefault());
  handle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    startX = event.clientX;
    startY = event.clientY;
    lastX = startX;
    lastY = startY;
    startScrollY = window.scrollY;
    pointerId = event.pointerId;
    dragging = false;
    handle.setPointerCapture(pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging && Math.hypot(dx, dy) < 6) return;
    lastX = event.clientX;
    lastY = event.clientY;
    if (!dragging) {
      dragging = true;
      card.classList.add('is-dragging');
      document.body.classList.add('is-reordering');
      dragFrame = requestAnimationFrame(drawDrag);
    }
  });
  handle.addEventListener('pointerup', event => { if (event.pointerId === pointerId) finish(true); });
  handle.addEventListener('pointercancel', () => finish(false));
  handle.addEventListener('lostpointercapture', () => finish(false));
  handle.addEventListener('keydown', event => {
    if (event.key === 'Escape') finish(false);
  });
}
function imageCard(parent, photo, items, index, options = {}) {
  const card = element('div', 'media-card');
  if (photo.id) card.dataset.photoId = photo.id;
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
  if (!visualMode) {
    const selected = group('Selected work', 'Choose the order of your four featured photos.');
    selected.classList.add('media-grid-group');
    draft.home.selectedWork.forEach((photo, index) => imageCard(selected, photo, draft.home.selectedWork, index));
  }
  const more = detailBlock('Homepage wording', 'Opening words and the invitation to book you.');
  const words = group('Opening words');
  bilingual(words, 'Statement', draft.home.manifesto.lead);
  bilingual(words, 'Introduction', draft.home.manifesto.body);
  const closing = group('Booking invitation');
  bilingual(closing, 'Invitation', draft.home.availabilityIntro);
  more.append(words, closing);
  const clientOptions = detailBlock('Client logos', 'Edit names, logos, and order.');
  const clients = renderClientLogos();
  clientOptions.append(clients);
  const footer = detailBlock('Footer wording', 'Your description at the bottom of the page.');
  bilingual(footer, 'Short description', draft.footer.description);
}
function renderClientLogos() {
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
  return clients;
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
      image.draggable = false;
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
  if (!visualMode) renderMotionStillsEditor();
}
function renderMotionStillsEditor() {
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
  if (!visualMode || visualTarget?.group === 'Contact options') {
    const contact = group('Contact options', 'Choose how clients can reach you.');
    for (const [name, item] of Object.entries(draft.booking.contact)) {
      const block = element('div', 'field-group');
      textField(block, name[0].toUpperCase() + name.slice(1), item.value, next => { item.value = next; });
      checkbox(block, `Show ${name} publicly`, item.visible, next => { item.visible = next; });
      contact.append(block);
  }
  }
  if (!visualMode || visualTarget?.group === 'Your calendar') {
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
    if (visualMode) calendar.open = true;
  }
  if (visualMode) return;
  const words = detailBlock('Booking page wording', 'Headlines and instructions around the calendar. The calendar’s own text is edited in Cal.com.');
  bilingual(words, 'Page headline', draft.booking.headline);
  bilingual(words, 'Introduction above calendar', draft.booking.intro);
  bilingual(words, 'Rates note above calendar', draft.booking.note);
  bilingual(words, 'Instruction beside calendar', draft.booking.calendarIntro);
  bilingual(words, 'Introduction above contact links', draft.booking.contactIntro);
}
function renderCompCard() {
  const card = visualMode ? element('section', 'visual-comp-card-editor') : group('Your current comp card', 'Upload or replace your comp card.');
  if (visualMode) {
    document.documentElement.classList.add('visual-comp-card-focus');
    editor.append(card);
  }
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
  if (!visualMode) info.append(element('p', 'group-note', uploadedImage
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
  const upload = element('div', 'comp-card-upload');
  filePicker(upload, visualMode ? 'Replace comp card' : uploadedImage ? 'Replace comp card' : 'Upload your comp card', (src, file) => {
    draft.compCard.uploadedFile = { src, name: file.name, type: file.type };
  }, 'image/png,image/jpeg,image/webp,' + HEIC_ACCEPT);
  upload.append(element('p', 'group-note', visualMode ? 'PNG, JPG, WebP, or HEIC · Up to 20 MB' : 'PNG, JPG, WebP, or HEIC · Up to 20 MB. Publish to update the public download.'));
  if (visualMode) card.append(upload, preview);
  else card.append(preview, upload);
}
function renderSection() {
  editor.replaceChildren();
  document.documentElement.classList.remove('visual-photo-focus', 'visual-gallery-focus', 'visual-text-focus', 'visual-comp-card-focus');
  document.querySelectorAll('.studio-nav button').forEach(button => {
    button.classList.toggle('active', button.dataset.section === activeSection);
  });
  document.querySelector('#studioSectionPicker').value = activeSection;
  document.querySelector('#sectionTitle').textContent = sectionTitles[activeSection][0];
  document.querySelector('#sectionDescription').textContent = sectionTitles[activeSection][1];
  if (visualMode && renderVisualPhoto()) { updateLanguageVisibility(); return; }
  if (visualMode && renderVisualText()) { updateLanguageVisibility(); return; }
  if (visualMode && renderVisualFocusedSection()) { updateLanguageVisibility(); return; }
  if (visualMode && visualTarget?.gallery==='motion') { renderVisualMotionArrangement();updateLanguageVisibility();return; }
  if (visualMode && (['portfolio','digitals'].includes(activeSection)||visualTarget?.gallery==='selectedWork')) { renderVisualGallery(); updateLanguageVisibility(); return; }
  ({ identity: renderIdentity, home: renderHome, portfolio: renderPortfolio,
    digitals: renderDigitals, motion: renderMotion, about: renderAbout,
    booking: renderBooking, compCard: renderCompCard })[activeSection]();
  updateLanguageVisibility();
}
function renderVisualFocusedSection() {
  const key = visualTarget?.group;
  if (activeSection === 'home' && key === 'Client logos') renderClientLogos();
  else if (activeSection === 'motion' && key === 'Videos') renderMotion();
  else if (activeSection === 'motion' && key === 'Motion stills') renderMotionStillsEditor();
  else if (activeSection === 'booking' && ['Contact options', 'Your calendar'].includes(key)) renderBooking();
  else return false;
  document.documentElement.classList.add('visual-text-focus');
  requestAnimationFrame(() => window.scrollTo(0, 0));
  return true;
}
function renderVisualText() {
  if(!visualTarget)return false;
  const content=element('section','visual-text-editor');
  const key=visualTarget.label||visualTarget.group;
  const words=(label,value,multiline=true)=>bilingual(content,label,value,multiline);
  if(activeSection==='identity' && key==='Name') words('Name',draft.identity.name,false);
  else if(activeSection==='identity' && key==='Profile') {
    words('Name',draft.identity.name,false);words('Location',draft.identity.location,false);
  } else if(activeSection==='identity' && key==='Role & tagline') {
    words('Name',draft.identity.name,false);words('Role',draft.identity.role,false);words('Tagline',draft.identity.tagline,false);
  } else if(activeSection==='identity' && key==='Measurements') {
    for(const name of measurementOrder) {
      const item=draft.identity.measurements[name];if(!item)continue;
      const label=measurementNames[name]||name;
      if(typeof item.value==='object')words(label,item.value,false);
      else textField(content,label,item.value,next=>{item.value=next;});
      checkbox(content,`Show ${label.toLowerCase()}`,item.visible,next=>{item.visible=next;});
    }
  } else if(activeSection==='home' && key==='Introduction') {
    words('Statement',draft.home.manifesto.lead);words('Introduction',draft.home.manifesto.body);
  } else if(activeSection==='home' && key==='Invitation') words('Invitation',draft.home.availabilityIntro);
  else if(activeSection==='home' && key==='Footer wording') words('Short description',draft.footer.description);
  else if(activeSection==='about' && key==='Introduction') words('Introduction',draft.about.intro);
  else if(activeSection==='about' && key==='Your story') {
    draft.about.biography.forEach((paragraph,index)=>{
      const block=element('div','visual-biography-paragraph');bilingual(block,`Paragraph ${index+1}`,paragraph);
      if(index>0)block.append(smallButton('Remove paragraph',()=>removeFromArray(draft.about.biography,index)));
      content.append(block);
    });
    content.append(smallButton('Add paragraph',()=>{draft.about.biography.push({en:'',th:''});markChanged();renderSection();}));
  } else if(activeSection==='about' && key==='Agency details') {
    textField(content,'Agency name',draft.about.agency.name,next=>{draft.about.agency.name=next;});
    words('Agency description',draft.about.agency.description);
    textField(content,'Agency link',draft.about.agency.url,next=>{draft.about.agency.url=next;});
    checkbox(content,'Show agency',draft.about.agency.visible,next=>{draft.about.agency.visible=next;});
  } else if(activeSection==='about' && key==='Closing invitation') words('Invitation',draft.about.closing);
  else if(activeSection==='booking' && key==='Booking page wording') {
    words('Headline',draft.booking.headline);
    content.lastElementChild.classList.add('compact-text-field');
    content.lastElementChild.querySelectorAll('textarea').forEach(field=>{field.rows=2;});
    words('Introduction',draft.booking.intro);words('Rates note',draft.booking.note);
    content.lastElementChild.classList.add('compact-text-field');
    content.lastElementChild.querySelectorAll('textarea').forEach(field=>{field.rows=2;});
    words('Calendar instruction',draft.booking.calendarIntro);words('Contact introduction',draft.booking.contactIntro);
  } else return false;
  document.documentElement.classList.add('visual-text-focus');
  editor.append(content);requestAnimationFrame(()=>window.scrollTo(0,0));return true;
}
function renderVisualPhoto() {
  if (!visualTarget) return false;
  const isCover = activeSection === 'home' && visualTarget.group === 'Cover image';
  const isPortrait = activeSection === 'about' && visualTarget.group === 'Portrait';
  const isStill = activeSection === 'motion' && Number.isInteger(visualTarget.stillIndex);
  const photos = activeSection === 'portfolio' ? draft.home.portfolioPhotos
    : activeSection === 'digitals' ? draft.home.digitals : isStill ? draft.home.portfolioPhotos : draft.home.selectedWork;
  let photo = isCover ? {src:draft.home.heroImage,alt:'Cover photo'}
    : isPortrait ? draft.about.portrait : photos.find(item=>item.id===visualTarget.photoId);
  if (!photo) return false;
  const ownStill=()=>{
    if(isStill && (!photo.id.startsWith('still-') || draft.home.portfolioChapters.some(chapter=>chapter.photos.includes(photo.id)) || draft.home.motionStills.some((id,index)=>index!==visualTarget.stillIndex&&id===photo.id))) {
      photo={...photo,id:`still-${crypto.randomUUID()}`,caption:{...photo.caption}};
      draft.home.portfolioPhotos.push(photo);draft.home.motionStills[visualTarget.stillIndex]=photo.id;visualTarget.photoId=photo.id;
    }
    return photo;
  };
  document.documentElement.classList.add('visual-photo-focus');
  const content = element('section','visual-photo-editor');
  if (photo.id) content.dataset.photoId = photo.id;
  const preview = element('img','visual-photo-preview');
  preview.alt = photo.alt || 'Selected photo';
  imageFromSource(photo.src).then(src=>{preview.src=src;});
  content.append(preview);
  filePicker(content,'Replace photo',src=>{
    ownStill().src=src;if(isCover) draft.home.heroImage=src;
  });
  content.querySelector('.file-action').classList.add('visual-replace');
  if (photo.caption && typeof photo.caption === 'object') {
    const caption=isStill ? {get en(){return photo.caption.en;},set en(value){ownStill().caption.en=value;},get th(){return photo.caption.th;},set th(value){ownStill().caption.th=value;}} : photo.caption;
    bilingual(content,'Caption',caption,false);
  }
  else if (isPortrait) textField(content,'Caption',photo.caption,next=>{photo.caption=next;});
  const more = element('details','visual-photo-more');
  more.append(element('summary','','More options'));
  textField(more,'Image description',photo.alt,next=>{ownStill().alt=next;},true);
  if (activeSection === 'portfolio') {
    const chapter = draft.home.portfolioChapters.find(item=>item.photos.includes(photo.id));
    const field = element('label','field');field.append(element('span','','Show in section'));
    const select = document.createElement('select');
    draft.home.portfolioChapters.forEach(item=>select.append(new Option(item.title.en,item.id)));
    select.value=chapter?.id || '';
    select.addEventListener('change',()=>{
      const next=draft.home.portfolioChapters.find(item=>item.id===select.value);
      if(!chapter||!next||chapter===next)return;
      changePortfolioPlacement(()=>{chapter.photos.splice(chapter.photos.indexOf(photo.id),1);next.photos.push(photo.id);},'Photo moved');
    });
    field.append(select);more.append(field);
    more.append(smallButton('Hide photo',()=>{
      visualTarget=null;
      changePortfolioPlacement(()=>{
        draft.home.portfolioChapters.forEach(item=>{item.photos=item.photos.filter(id=>id!==photo.id);});
        hiddenPhotosOpen=true;
      },'Photo hidden');
      parent.dispatchEvent(new Event('visual-studio-close'));
    }));
  }
  if (activeSection === 'digitals') more.append(smallButton('Remove photo',()=>{
    visualTarget=null;removeFromArray(draft.home.digitals,draft.home.digitals.indexOf(photo));
    parent.dispatchEvent(new Event('visual-studio-close'));
  }));
  if (!isCover) content.append(more);
  if (!visualTarget.fromGallery && (['portfolio','digitals'].includes(activeSection)||(activeSection==='home'&&photo.id))) {
    const all=smallButton('Arrange photos',()=>{
      visualGalleryId = draft.home.portfolioChapters.find(item=>item.photos.includes(photo.id))?.id || visualGalleryId;
      visualTarget=activeSection==='home'?{gallery:'selectedWork'}:null;renderSection();window.scrollTo(0,0);
      parent.dispatchEvent(new Event('visual-studio-arrange'));
    });
    all.classList.add('visual-arrange');content.append(all);
  }
  editor.append(content);
  requestAnimationFrame(()=>window.scrollTo(0,0));
  return true;
}
function renderVisualGallery() {
  document.documentElement.classList.add('visual-gallery-focus');
  const isDigitals = activeSection === 'digitals';
  const isSelected = activeSection === 'home';
  const chapters = draft.home.portfolioChapters;
  const requested = chapters.find(item=>item.id===visualTarget?.chapterId || item.title.en===visualTarget?.group);
  if (requested) visualGalleryId=requested.id;
  const chapter = chapters.find(item=>item.id===visualGalleryId) || chapters[0];
  visualGalleryId=chapter?.id;
  const content=element('section','visual-gallery');
  const toolbar=element('div','visual-gallery-toolbar');
  if (!isDigitals && !isSelected) {
    const label=element('label','field');label.append(element('span','','Section'));
    const select=document.createElement('select');
    select.setAttribute('aria-label','Section');
    chapters.forEach(item=>select.append(new Option(item.title.en,item.id)));
    select.value=chapter.id;
    select.onchange=()=>{visualGalleryId=select.value;visualTarget=null;renderSection();window.scrollTo(0,0);};
    label.append(select);toolbar.append(label);
  }
  const upload=element('label','file-action visual-gallery-add','+ Add photos');
  const input=document.createElement('input');input.type='file';input.multiple=true;input.accept=IMAGE_ACCEPT;
  const progress=element('p','group-note');progress.setAttribute('role','status');
  input.onchange=async()=>{
    const files=[...input.files];if(!files.length)return;
    input.disabled=true;progress.textContent='Adding photos…';
    try {await window.visualStudio.addPhotos(files,isDigitals?'digitals':chapter.id);}
    catch(error){progress.textContent=error.message;input.disabled=false;input.value='';}
  };
  upload.append(input);if(!isSelected)toolbar.append(upload);content.append(toolbar);
  const photos=isSelected?draft.home.selectedWork:isDigitals ? draft.home.digitals : chapter.photos.map(id=>draft.home.portfolioPhotos.find(photo=>photo.id===id)).filter(Boolean);
  content.append(element('p','group-note',`${photos.length} photos · Drag the handle or use the arrows.`),progress);
  const grid=element('div','visual-gallery-grid');
  const order=isDigitals||isSelected ? {photos:photos.map(photo=>photo.id)} : chapter;
  const reorder=change=>{
    if(!isDigitals&&!isSelected){changePortfolioPlacement(change,'Photo reordered');return;}
    const key=isSelected?'selectedWork':'digitals';
    const previous=[...draft.home[key]];change();
    const map=new Map(previous.map(photo=>[photo.id,photo]));
    draft.home[key]=order.photos.map(id=>map.get(id));markChanged();renderSection();
  };
  photos.forEach((photo,index)=>{
    const card=element('div','portfolio-tile visual-gallery-tile');card.dataset.photoId=photo.id;
    const edit=element('button','visual-gallery-photo');edit.type='button';edit.setAttribute('aria-label',`Edit photo ${index+1}`);
    const image=element('img');image.alt=photo.alt||`Photo ${index+1}`;image.draggable=false;
    imageFromSource(photo.src).then(src=>{image.src=src;});edit.append(image);
    edit.onclick=()=>parent.dispatchEvent(new CustomEvent('visual-studio-photo',{detail:{section:activeSection,photoId:photo.id,galleryTarget:isSelected?{gallery:'selectedWork'}:isDigitals?{}:{chapterId:chapter.id},scrollY:window.scrollY}}));
    const handle=element('button','drag-handle','⠿');handle.type='button';handle.setAttribute('aria-label',`Drag photo ${index+1} to reorder`);
    enablePhotoDrag(handle,card,grid,order,photo.id,reorder);
    const actions=element('div','visual-gallery-order');actions.append(element('span','',String(index+1)));
    for(const [direction,symbol,label] of [[-1,'←','earlier'],[1,'→','later']]) {
      const button=smallButton(symbol,()=>{reorder(()=>{const next=index+direction;[order.photos[index],order.photos[next]]=[order.photos[next],order.photos[index]];});requestAnimationFrame(()=>editor.querySelector(`[data-photo-id="${CSS.escape(photo.id)}"] .visual-gallery-order button`)?.focus({preventScroll:true}));},index+direction<0||index+direction>=photos.length);
      button.setAttribute('aria-label',`Move photo ${index+1} ${label}`);actions.append(button);
    }
    card.append(edit,handle,actions);grid.append(card);
  });
  if(!photos.length)grid.append(element('p','empty-state','Add photos to this section.'));
  content.append(grid);
  if(!isDigitals&&!isSelected) {
    const hidden=draft.home.portfolioPhotos.filter(photo=>!chapters.some(item=>item.photos.includes(photo.id)));
    const details=element('details','visual-gallery-hidden');details.append(element('summary','',`Hidden photos (${hidden.length})`));
    const hiddenGrid=element('div','visual-gallery-grid');
    hidden.forEach(photo=>{
      const card=element('div','visual-gallery-tile');const image=element('img');image.alt=photo.alt||'Hidden photo';imageFromSource(photo.src).then(src=>{image.src=src;});
      card.append(image,smallButton('Add to this section',()=>changePortfolioPlacement(()=>chapter.photos.push(photo.id),'Photo restored')));hiddenGrid.append(card);
    });
    if(!hidden.length)details.append(element('p','group-note','No hidden photos.'));
    details.append(hiddenGrid);content.append(details);
    const titles=element('details','visual-gallery-hidden');titles.append(element('summary','','Edit section name'));bilingual(titles,'Section name',chapter.title);content.append(titles);
  }
  editor.append(content);
}
function renderVisualMotionArrangement() {
  document.documentElement.classList.add('visual-gallery-focus');
  const content=element('section','visual-gallery');
  content.append(element('p','group-note','Drag the handle or use the arrows.'));
  const grid=element('div','visual-gallery-grid');
  const order={photos:draft.home.motion.map(video=>video.id||`wistia:${video.mediaId}`)};
  const reorder=change=>{
    const map=new Map(draft.home.motion.map(video=>[video.id||`wistia:${video.mediaId}`,video]));
    change();draft.home.motion=order.photos.map(id=>map.get(id));markChanged();renderSection();
  };
  draft.home.motion.forEach((video,index)=>{
    const id=order.photos[index],card=element('div','portfolio-tile visual-gallery-tile');card.dataset.photoId=id;
    const preview=element('div','visual-motion-thumbnail');
    if(video.provider==='file') {
      const player=element('video');player.muted=true;player.playsInline=true;player.preload='metadata';
      imageFromSource(video.src).then(src=>{player.src=src;});preview.append(player);
    } else {
      const image=element('img');image.src=`https://fast.wistia.com/embed/medias/${encodeURIComponent(video.mediaId)}/swatch`;
      image.alt=motionTitle(video,index);preview.append(image);
    }
    card.append(preview,element('p','visual-motion-name',motionTitle(video,index)));
    const handle=element('button','drag-handle','⠿');handle.type='button';handle.setAttribute('aria-label',`Drag video ${index+1} to reorder`);
    enablePhotoDrag(handle,card,grid,order,id,reorder);card.append(handle);
    const actions=element('div','visual-gallery-order');actions.append(element('span','',String(index+1)));
    for(const [direction,symbol,label] of [[-1,'←','earlier'],[1,'→','later']]) {
      const button=smallButton(symbol,()=>reorder(()=>{const next=index+direction;[order.photos[index],order.photos[next]]=[order.photos[next],order.photos[index]];}),index+direction<0||index+direction>=order.photos.length);
      button.setAttribute('aria-label',`Move video ${index+1} ${label}`);actions.append(button);
    }
    card.append(actions);grid.append(card);
  });
  if(!order.photos.length)grid.append(element('p','empty-state','No videos yet. Add one in Edit videos.'));
  content.append(grid,element('h3','group-title','Motion stills'));
  const stills=element('div','visual-gallery-grid');
  const photos=new Map(draft.home.portfolioPhotos.map(photo=>[photo.id,photo]));
  draft.home.motionStills.forEach((id,index)=>{
    const photo=photos.get(id);if(!photo)return;
    const card=element('div','visual-gallery-tile'),image=element('img');image.alt=photo.alt||`Still ${index+1}`;
    imageFromSource(photo.src).then(src=>{image.src=src;});
    const move=smallButton(index?'Move earlier':'Move later',()=>{draft.home.motionStills.reverse();markChanged();renderSection();},draft.home.motionStills.length<2);
    card.append(image,move);stills.append(card);
  });
  content.append(stills);editor.append(content);
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
  try {
    file = await prepareImage(file, () => setSaveStatus('busy', 'Converting HEIC photo…'));
  } catch (error) {
    updateSaveStatus();
    throw error;
  }
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
  await renderPortfolioChapters(doc,content.home,imageFromSource);
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
    if (surname) surname.textContent = words.slice(1).join(' ');
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
  if (visualMode) return;
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
  resetHistory();
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
  resetHistory();
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
  exposeVisualStudio();
  if (portfolioBackendReady) {
    configureRemoteInterface();
    if (hasOwnerSession()) {
      try { await loadRemotePortfolio(); }
      catch (error) { showLogin(error.message); }
    } else showLogin();
    document.querySelector('#studioOpening').hidden = true;
    openingStudio=false;
    if(visualMode)parent.dispatchEvent(new Event('visual-studio-ready'));
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
  resetHistory();
  renderSection();
  requestAnimationFrame(updatePreviewScale);
  setSaveStatus('saved', 'Demo ready · public website unchanged');
  updatePreviewVersionNote();
  applyPreview();
  document.querySelector('#studioOpening').hidden = true;
  openingStudio=false;
  if(visualMode)parent.dispatchEvent(new Event('visual-studio-ready'));
}
function exposeVisualStudio() {
  if (visualMode) {
    window.visualStudio = {
      get content() { return draft; },
      get dirty() { return hasUnsavedChanges(); },
      get status() { return { state: status.dataset.state, text:status.textContent }; },
      get ready(){return !!draft;},
      get opening(){return openingStudio;},
      get connected(){return portfolioBackendReady;},
      get backendConfigured(){return configuredBackendReady;},
      get canSave(){return !!draft;},
      get needsPublish(){return !!draft&&snapshot(draft)!==publishedSnapshot;},
      async signIn(email,password){
        await signIn(email,password);
        await loadRemotePortfolio();
        parent.dispatchEvent(new Event('visual-studio-ready'));
      },
      signOut(){
        if(hasUnsavedChanges()&&!confirm('Discard unsaved changes and sign out?'))return false;
        signOut();draft=null;published=null;savedSnapshot=null;publishedSnapshot=null;remotePortfolio=null;
        showLogin();parent.dispatchEvent(new Event('visual-studio-ready'));return true;
      },
      save:saveDraft,
      async publish(){await simulatePublish();return status.dataset.state!=='error'&&!hasUnsavedChanges()&&snapshot(draft)===publishedSnapshot;},
      get canUndo(){return historyPosition>0;},
      get canRedo(){return historyPosition<editHistory.length-1;},
      undo(){travelHistory(-1);},
      redo(){travelHistory(1);},
      updateBiography(index, lang, value) {
        if (!draft?.about.biography[index] || !['en', 'th'].includes(lang)) return;
        draft.about.biography[index][lang] = value;
        markChanged(); renderSection();
      },
      reorderPhotos(group, fromId, toId) {
        const chapter=group.startsWith('portfolio:')?draft.home.portfolioChapters.find(item=>item.id===group.slice(10)):null;
        const key=['selectedWork','digitals','motion','motionStills'].includes(group)?group:null;
        if(!chapter&&!key)return false;
        const items=chapter?chapter.photos:draft.home[key];
        const id=item=>chapter||key==='motionStills'?item:item.id||`wistia:${item.mediaId}`;
        const from=items.findIndex(item=>id(item)===fromId),to=items.findIndex(item=>id(item)===toId);
        if(from<0||to<0||from===to)return false;
        const [moved]=items.splice(from,1);items.splice(to,0,moved);markChanged();renderSection();
        return true;
      },
      galleryTarget(section, photoId) {
        if(section==='home')return {gallery:'selectedWork'};
        if(section==='digitals')return {};
        return {chapterId:draft.home.portfolioChapters.find(chapter=>chapter.photos.includes(photoId))?.id||visualGalleryId};
      },
      restoreGalleryPosition(scrollY, photoId) {
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          const tile=[...editor.querySelectorAll('[data-photo-id]')].find(node=>node.dataset.photoId===photoId);
          tile?.querySelector('.visual-gallery-photo')?.focus({preventScroll:true});
          if(Number.isFinite(scrollY))window.scrollTo(0,scrollY);
          else tile?.scrollIntoView({block:'nearest'});
        }));
      },
      choose(section, target) {
        visualTarget = target || null;
        chooseSection(section);
        let node;
        if (target?.photoId) node = [...editor.querySelectorAll('[data-photo-id]')].find(item => item.dataset.photoId === target.photoId);
        if (target?.group) node = [...editor.querySelectorAll('.group-title,summary')].find(item => item.textContent === target.group)?.closest('section,details');
        if (target?.label) node = [...editor.querySelectorAll('.field')].find(item => item.querySelector('span')?.textContent === target.label);
        if (node) {
          for (let ancestor=node; ancestor && ancestor!==editor; ancestor=ancestor.parentElement) if (ancestor.tagName==='DETAILS') ancestor.open=true;
          if (!document.documentElement.classList.contains('visual-photo-focus') && !document.documentElement.classList.contains('visual-text-focus')) node.querySelectorAll('details').forEach(details => details.open=true);
          updateLanguageVisibility();
          if (!target?.photoId) requestAnimationFrame(() => node.scrollIntoView({block:'start'}));
        } else window.scrollTo(0,0);
      },
      async applyTo(doc,page) {
        if(page==='home') await applyHomePreview(doc,draft);
        if(page==='about') {
          await applyAboutPreview(doc,draft);
          const body = doc.querySelector('.about-body');
          if(body) {
            body.replaceChildren();
            for(const paragraph of draft.about.biography.slice(1)) for(const lang of ['en','th']) {
              const p=doc.createElement('p');p.lang=lang;p.textContent=paragraph[lang]||'';body.append(p);
            }
          }
        }
        if(page==='booking') applyBookingPreview(doc,draft);
      },
      async addPhotos(files, target) {
        const additions=[];
        for (const file of files) {
          validateImage(file);
        }
        for (const file of files) {
          const src=await storeAsset(file);
          additions.push({id:`photo-${crypto.randomUUID()}`,src,alt:file.name.replace(/\.[^.]+$/,''),caption:{en:'',th:''}});
        }
        if (target==='digitals') draft.home.digitals.push(...additions);
        else {
          const chapter=draft.home.portfolioChapters.find(item=>item.id===target);
          if(!chapter) throw new Error('Choose a portfolio section first.');
          draft.home.portfolioPhotos.push(...additions); chapter.photos.push(...additions.map(item=>item.id));
        }
        markChanged(); renderSection();
      },
    };
  }
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
  openingStudio=false;
  setSaveStatus('error', error.message);
  document.querySelector('#studioOpening p').textContent = `Could not open Studio: ${error.message}`;
  if(visualMode)parent.dispatchEvent(new Event('visual-studio-ready'));
  console.error(error);
});
