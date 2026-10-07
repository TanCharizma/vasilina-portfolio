import { getPublishedPortfolio, portfolioBackendReady } from './portfolio-backend.js';
import { renderPortfolioChapters } from './portfolio-layout.js?v=1';
import { renderBiography } from './portfolio-biography.js?v=1';
import { renderMotionGallery, renderMotionStills } from './portfolio-motion.js';
import { applyBookingContent, mountBookingCalendar, DEFAULT_CAL_LINK } from './portfolio-booking.js?v=3';

const isBookingPage = !!document.querySelector('.booking-opening');
if (!portfolioBackendReady && isBookingPage) mountBookingCalendar(document, DEFAULT_CAL_LINK);
if (portfolioBackendReady && !new URLSearchParams(location.search).has('studio-preview')) {
  getPublishedPortfolio().then(async publication => {
    if (publication?.content?.schemaVersion !== 1) {
      if (isBookingPage) mountBookingCalendar(document, DEFAULT_CAL_LINK);
      return;
    }
    const content = publication.content;
    applyPublishedProfile(content);
    applyPublishedFooter(content);
    if (isBookingPage) {
      applyBookingContent(document, content.booking, content.identity);
      mountBookingCalendar(document, content.booking?.calLink);
    }
    if (document.querySelector('.about-opening')) applyPublishedAbout(content);
    if (document.querySelector('.home-hero')) {
      applyPublishedHomeImages(content.home);
      applyPublishedHomeText(content.home);
      applyPublishedCompCard(content.compCard);
      await renderMotionGallery(document, content.home?.motion);
      await renderMotionStills(document, content.home?.motionStills, content.home?.portfolioPhotos);
    }
    if (!document.querySelector('#portfolio')) return;
    await renderPortfolioChapters(document,content.home);
  }).catch(error => {
    if (isBookingPage) mountBookingCalendar(document, DEFAULT_CAL_LINK);
    console.error('Published portfolio could not be loaded:', error);
  });
}

function applyPublishedCompCard(compCard) {
  const uploaded = compCard?.uploadedFile;
  if (!uploaded?.src || !uploaded.type?.startsWith('image/')) return;
  const src = new URL(uploaded.src, document.baseURI).href;
  const image = document.querySelector('#compCardImg');
  if (image) image.src = src;
  const download = document.querySelector('#compCardDownload');
  if (download) {
    download.href = src;
    download.download = uploaded.name || 'Lina_Comp_Card.png';
  }
}

function applyPublishedHomeImages(home) {
  if (!home) return;
  const hero = document.querySelector('.home-hero .hero-bg');
  if (hero && home.heroImage) {
    hero.style.backgroundImage = `url("${new URL(home.heroImage, document.baseURI).href}")`;
  }
  document.querySelectorAll('.story-grid .story-frame').forEach((frame, index) => {
    const photo = home.selectedWork?.[index];
    frame.hidden = !photo;
    if (!photo) return;
    const image = frame.querySelector('img');
    image.src = new URL(photo.src, document.baseURI).href;
    image.alt = photo.alt || '';
    image.dataset.captionEn = photo.caption?.en || '';
    image.dataset.captionTh = photo.caption?.th || '';
    setLanguageText(frame.querySelector('figcaption'), photo.caption);
  });
  applyPublishedClients(document.querySelectorAll('.client-logos img'), home.selectedClients);
  const digitals = document.querySelector('.digitals-grid');
  if (digitals && Array.isArray(home.digitals)) {
    digitals.replaceChildren();
    for (const photo of home.digitals) {
      const image = document.createElement('img');
      image.src = new URL(photo.src, document.baseURI).href;
      image.alt = photo.alt || '';
      image.className = 'reveal active';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.dataset.captionEn = photo.caption?.en || '';
      image.dataset.captionTh = photo.caption?.th || '';
      digitals.append(image);
    }
  }
}

function applyPublishedHomeText(home) {
  if (!home) return;
  setEditorialText(document.querySelector('.manifesto-lead'), home.manifesto?.lead);
  for (const lang of ['en', 'th']) {
    const paragraph = document.querySelector(`.manifesto-detail p[lang="${lang}"]`);
    if (paragraph && home.manifesto?.body) paragraph.textContent = home.manifesto.body[lang] || '';
  }
  setLanguageText(document.querySelector('.home-availability .availability-copy > p'), home.availabilityIntro);
}

function applyPublishedClients(images, clients) {
  images.forEach((image, index) => {
    const client = clients?.[index];
    image.hidden = !client;
    if (!client) return;
    if (client.logo) image.src = new URL(client.logo, document.baseURI).href;
    image.alt = client.name || '';
  });
}

function applyPublishedFooter(content) {
  const footer = document.querySelector('footer');
  if (!footer) return;
  for (const lang of ['en', 'th']) {
    const paragraph = footer.querySelector(`.footer-column p[lang="${lang}"]:not(.footer-label)`);
    if (paragraph && content.footer?.description) paragraph.textContent = content.footer.description[lang] || '';
  }
  const email = footer.querySelector('a[href^="mailto:"]');
  if (email && content.booking?.contact?.email) {
    const contact = content.booking.contact.email;
    email.href = `mailto:${contact.value}`;
    email.textContent = contact.value;
    email.hidden = contact.visible === false;
  }
}

function setLanguageText(root, value) {
  if (!root || !value) return;
  for (const lang of ['en', 'th']) {
    const target = root.querySelector(`[lang="${lang}"]`);
    if (target) target.textContent = value[lang] || '';
  }
}

function setEditorialText(root, value) {
  if (!root || !value) return;
  for (const lang of ['en', 'th']) {
    const target = root.querySelector(`[lang="${lang}"]`);
    if (!target) continue;
    const next = value[lang] || '';
    const sameWords = text => text.replace(/\s+/g, '') === next.replace(/\s+/g, '');
    if (!sameWords(target.textContent)) target.textContent = next;
  }
}

function applyPublishedProfile(content) {
  const identity = content.identity;
  if (!identity) return;
  const homeName = document.querySelectorAll('.hero-content h1 > span');
  if (homeName.length && identity.name?.en) {
    const [first, ...rest] = identity.name.en.trim().split(/\s+/);
    homeName[0].textContent = first;
    homeName[1].textContent = rest.join(' ');
  }
  setLanguageText(document.querySelector('.hero-role'), identity.role);
  setLanguageText(document.querySelector('.hero-tagline'), identity.tagline);
  const aboutName = document.querySelector('.about-opening h1');
  if (aboutName && identity.name) {
    for (const lang of ['en', 'th']) {
      const part = aboutName.querySelector(`[lang="${lang}"]`);
      const words = identity.name[lang]?.trim().split(/\s+/) || [];
      const firstText = [...(part?.childNodes || [])].find(node => node.nodeType === Node.TEXT_NODE);
      if (firstText) firstText.textContent = words[0] || '';
      const surname = part?.querySelector('em');
      if (surname) surname.textContent = words.slice(1).join(' ');
    }
  }
  setLanguageText(document.querySelector('.booking-opening .subpage-kicker'), identity.location);
  const order = ['height', 'bust', 'waist', 'hips', 'shoes', 'hair', 'eyes'];
  document.querySelectorAll('.info-strip > div').forEach((row, index) => {
    const item = identity.measurements?.[order[index]];
    if (!item) return;
    row.hidden = item.visible === false;
    row.style.display = item.visible === false ? 'none' : '';
    const value = row.querySelector('b');
    if (!value) return;
    if (typeof item.value === 'object') {
      for (const lang of ['en', 'th']) {
        const span = value.querySelector(`[lang="${lang}"]`);
        if (span) span.textContent = item.value[lang] || '';
      }
    } else value.textContent = item.value || '';
  });
}

function applyPublishedAbout(content) {
  const about = content.about;
  if (!about) return;
  const portrait = document.querySelector('.about-image img');
  if (portrait && about.portrait?.src) {
    portrait.src = new URL(about.portrait.src, document.baseURI).href;
    portrait.alt = about.portrait.alt || portrait.alt;
  }
  const portraitName = document.querySelector('.about-image figcaption span:first-child');
  if (portraitName && content.identity?.name?.en) portraitName.textContent = content.identity.name.en;
  const caption = document.querySelector('.about-image figcaption span:last-child');
  if (caption) caption.textContent = about.portrait?.caption || '';
  setLanguageText(document.querySelector('.portrait-intro'), about.intro);
  renderBiography(document, about.biography);
  for (const lang of ['en', 'th']) {
    const lead = document.querySelector(`.about-lead[lang="${lang}"]`);
    if (lead) lead.textContent = about.biography?.[0]?.[lang] || '';
    document.querySelectorAll(`.about-body p[lang="${lang}"]`).forEach((paragraph, index) => {
      paragraph.textContent = about.biography?.[index + 1]?.[lang] || '';
    });
    const agencyDescription = document.querySelector(`.practice-copy p[lang="${lang}"]`);
    if (agencyDescription) agencyDescription.textContent = about.agency?.description?.[lang] || '';
  }
  const agencySection = document.querySelector('.about-practice');
  if (agencySection) agencySection.hidden = about.agency?.visible === false;
  const agencyName = document.querySelector('.practice-copy h2');
  if (agencyName && about.agency?.name) {
    const [first, ...rest] = about.agency.name.trim().split(/\s+/);
    agencyName.replaceChildren(first || '', document.createElement('br'), rest.join(' ') + (rest.length ? '.' : ''));
  }
  const agencyLink = document.querySelector('.practice-copy a');
  if (agencyLink && about.agency?.url) agencyLink.href = about.agency.url;
  setEditorialText(document.querySelector('.about-closing .closing-statement'), about.closing);
  applyPublishedClients(document.querySelectorAll('.about-client-logos img'), content.home?.selectedClients);
}
