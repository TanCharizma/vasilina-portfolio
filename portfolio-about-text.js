export const ABOUT_TEXT_FIELDS = {
  pageTitle: { selector: '.about-opening .subpage-index', label: 'page label', defaults: { en: 'About', th: 'เกี่ยวกับฉัน' } },
  role: { selector: '.about-opening .subpage-kicker', label: 'role', defaults: { en: 'Model & Creative Director', th: 'นางแบบและครีเอทีฟไดเรกเตอร์' } },
  scrollHint: { selector: '.about-scroll-cue', label: 'scroll hint', defaults: { en: 'Scroll', th: 'เลื่อน' } },
  biographyLabel: { selector: '.about-story .subpage-index', label: 'biography label', defaults: { en: 'Biography', th: 'ประวัติ' } },
  agencyLabel: { selector: '.about-practice .subpage-index', label: 'agency section label', defaults: { en: 'Creative direction', th: 'ครีเอทีฟไดเรกชัน' } },
  clientsLabel: { selector: '.about-clients .subpage-index', label: 'clients label', defaults: { en: 'Selected clients', th: 'ลูกค้าที่ร่วมงาน' } },
  bookingLabel: { selector: '.about-closing .subpage-index', label: 'booking label', defaults: { en: 'Booking', th: 'จองคิวงาน' } },
  availabilityLabel: { selector: '.about-closing .subpage-link', label: 'availability button wording', defaults: { en: 'Request availability', th: 'สอบถามคิวงาน' } },
};

export function applyAboutText(doc, about) {
  for (const [key, field] of Object.entries(ABOUT_TEXT_FIELDS)) {
    for (const lang of ['en', 'th']) {
      const node = doc.querySelector(`${field.selector} > [lang="${lang}"]`);
      if (node) node.textContent = about.labels?.[key]?.[lang] ?? field.defaults[lang];
    }
  }
}
