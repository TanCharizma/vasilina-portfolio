export const MEASUREMENT_FIELDS = {
  height: { en: 'Height', th: 'ส่วนสูง' }, bust: { en: 'Bust', th: 'อก' },
  waist: { en: 'Waist', th: 'เอว' }, hips: { en: 'Hips', th: 'สะโพก' },
  shoes: { en: 'Shoes', th: 'รองเท้า' }, hair: { en: 'Hair', th: 'สีผม' }, eyes: { en: 'Eyes', th: 'นัยน์ตา' },
};
export const HOME_TEXT_FIELDS = {
  availabilityLabel: { selector: '#availability > .home-index', label: 'availability label', defaults: { en: 'Availability', th: 'ตารางงาน' } },
  availabilityHeading: { selector: '#availability .availability-copy h2', label: 'availability headline', multiline: true, defaults: { en: 'Booking &\navailability.', th: 'การจองคิว\nและตารางงาน' } },
  availabilityButton: { selector: '#availability .home-text-link', label: 'availability button wording', defaults: { en: 'Check availability', th: 'ตรวจสอบคิวงาน' } },
  motionLabel: { selector: '#motion .motion-heading .home-index', label: 'motion section label', defaults: { en: 'Motion', th: 'ภาพเคลื่อนไหว' } },
  digitalsLabel: { selector: '#digitals .digitals-heading .home-index', label: 'digitals section label', defaults: { en: 'Digitals', th: 'ดิจิทัลส์' } },
  portfolioLabel: { selector: '#portfolio .work-heading .home-index', label: 'portfolio section label', defaults: { en: 'Portfolio', th: 'พอร์ตโฟลิโอ' } },
  clientsLabel: { selector: '#selected-clients .home-index', label: 'clients label', defaults: { en: 'Selected clients', th: 'ลูกค้าที่ร่วมงาน' } },
  measurementsLabel: { selector: '#measurements .home-index', label: 'measurements section label', defaults: { en: 'Measurements & comp card', th: 'สัดส่วนและคอมพ์การ์ด' } },
  compCardButton: { selector: '#compCardBtn', label: 'comp card button wording', defaults: { en: 'View comp card', th: 'ดูคอมพ์การ์ด' } },
  compCardDownload: { selector: '#compCardDownload', label: 'comp card download wording', defaults: { en: 'Download Comp Card', th: 'ดาวน์โหลดคอมพ์การ์ด' } },
  selectedWorkLabel: { selector: '#highlights .home-index', label: 'selected work label', defaults: { en: 'Selected work', th: 'ผลงานคัดสรร' } },
  introductionLabel: { selector: '.home-manifesto .home-index', label: 'introduction label', defaults: { en: 'Vasilina', th: 'วาซิลินา' } },
  storyButton: { selector: '.manifesto-detail .home-text-link', label: 'story button wording', defaults: { en: 'Read my story', th: 'อ่านเรื่องราวของฉัน' } },
  portfolioButton: { selector: '.hero-btns .home-text-link:not(.hero-booking-link)', label: 'portfolio button wording', defaults: { en: 'View portfolio', th: 'ชมผลงาน' } },
  bookingButton: { selector: '.hero-booking-link', label: 'booking button wording', defaults: { en: 'Check availability', th: 'ตรวจสอบคิวงาน' } },
  scrollHint: { selector: '.home-scroll-cue', label: 'scroll hint', defaults: { en: 'Scroll', th: 'เลื่อน' } },
};
Object.entries(MEASUREMENT_FIELDS).forEach(([key, defaults], index) => {
  HOME_TEXT_FIELDS[`${key}Label`] = { selector: `.info-strip > div:nth-child(${index + 1})`, label: `${key} label`, defaults };
});
export function applyHomeText(doc, home) {
  const openingLines = {
    en: ['Presence is not a pose.', 'It is a point of view.'],
    th: ['ตัวตนไม่ใช่เพียงท่วงท่า', 'แต่คือมุมมองที่อยู่เบื้องหลัง'],
  };
  for (const lang of ['en', 'th']) {
    const node = doc.querySelector(`.manifesto-lead > [lang="${lang}"]`);
    const text = home.manifesto?.lead?.[lang];
    if (node && text != null) {
      const original = openingLines[lang];
      node.textContent = text.replace(/\s/g, '') === original.join('').replace(/\s/g, '') ? original.join('\n') : text;
    }
  }
  for (const [key, field] of Object.entries(HOME_TEXT_FIELDS)) {
    for (const lang of ['en', 'th']) {
      const node = doc.querySelector(`${field.selector} > [lang="${lang}"]`);
      if (node) {
        node.textContent = home.labels?.[key]?.[lang] ?? field.defaults[lang];
        if (field.multiline) node.style.whiteSpace = 'pre-line';
      }
    }
  }
}
