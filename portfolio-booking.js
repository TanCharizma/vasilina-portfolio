export const DEFAULT_CAL_LINK = 'lina-panina/booking-request-จองว-นท-และ-เวลา';

export function normalizeCalLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!['cal.com', 'www.cal.com', 'app.cal.com'].includes(url.hostname.toLowerCase())) return null;
      path = url.pathname;
    } catch { return null; }
  }
  path = path.replace(/^\/+|\/+$/g, '');
  if (!path || /[:?#\s]/.test(path) || path.split('/').length < 2) return null;
  return path;
}

function setBilingual(root, value) {
  if (!root || !value) return;
  for (const lang of ['en', 'th']) {
    const target = root.querySelector(`[lang="${lang}"]`);
    if (target && typeof value[lang] === 'string') target.textContent = value[lang];
  }
}

function setHeadline(doc, headline) {
  const root = doc.querySelector('.booking-opening h1');
  if (!root || !headline) return;
  for (const lang of ['en', 'th']) {
    const target = root.querySelector(`[lang="${lang}"]`);
    const raw = headline[lang]?.trim();
    const value = raw === 'Booking & availability.' ? raw.slice(0, -1) : raw;
    if (!target || !value) continue;
    const split = lang === 'th' ? value.indexOf('และ') : value.lastIndexOf(' ');
    if (split < 1) { target.textContent = value; continue; }
    const first = value.slice(0, split).trim();
    const second = value.slice(split).trim();
    const emphasis = doc.createElement('em');
    emphasis.textContent = second;
    target.replaceChildren(first, doc.createElement('br'), emphasis);
  }
}

export function applyBookingContent(doc, booking, identity) {
  if (!booking) return;
  setBilingual(doc.querySelector('.booking-opening .subpage-kicker'), identity?.location);
  setHeadline(doc, booking.headline);
  for (const lang of ['en', 'th']) {
    const intro = doc.querySelector(`.booking-intro p[lang="${lang}"]`);
    if (intro && typeof booking.intro?.[lang] === 'string') intro.textContent = booking.intro[lang];
  }
  setBilingual(doc.querySelector('.booking-intro > span'), booking.note);
  setBilingual(doc.querySelector('.calendar-heading p:not(.subpage-index)'), booking.calendarIntro);
  setBilingual(doc.querySelector('.inquiry-copy > p'), booking.contactIntro);
  doc.querySelectorAll('.inquiry-links a').forEach(link => {
    const name = link.querySelector('b')?.textContent.trim().toLowerCase();
    const item = booking.contact?.[name];
    if (!item) return;
    link.hidden = item.visible === false;
    link.style.display = item.visible === false ? 'none' : '';
    if (name === 'email') link.href = `mailto:${item.value}`;
    else if (/^https:\/\//i.test(item.value || '')) link.href = item.value;
  });
}

export function mountBookingCalendar(doc, value) {
  const link = normalizeCalLink(value) || DEFAULT_CAL_LINK;
  doc.defaultView?.mountBookingCalendar?.(link);
}
