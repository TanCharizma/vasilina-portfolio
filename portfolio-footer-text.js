export const FOOTER_TEXT_FIELDS = {
  name: { label: 'footer name' },
  inquiries: { label: 'inquiries label', defaults: { en: 'Inquiries', th: 'ติดต่อสอบถาม' } },
  connect: { label: 'connect label', defaults: { en: 'Connect', th: 'ติดตามและติดต่อ' } },
  booking: { label: 'footer booking wording', defaults: { en: 'Booking & Availability', th: 'การจองคิวและตารางงาน' } },
  instagram: { label: 'Instagram wording', defaults: { en: 'Instagram', th: 'Instagram' } },
  agency: { label: 'footer agency wording', defaults: { en: 'Charizma Management', th: 'Charizma Management' } },
};

export function footerLinkValue(content, key) {
  if (key === 'email' || key === 'instagram') return content.booking?.contact?.[key]?.value || '';
  if (key === 'agency') return content.about?.agency?.url || '';
  return '';
}

export function applyFooterText(doc, content) {
  const root = doc.querySelector('footer');
  if (!root) return;
  for (const lang of ['en', 'th']) {
    const description = root.querySelector(`[data-footer-description][lang="${lang}"]`);
    if (description && content.footer?.description) description.textContent = content.footer.description[lang] || '';
    for (const [key, field] of Object.entries(FOOTER_TEXT_FIELDS)) {
      const node = root.querySelector(`[data-footer-text="${key}"] > [lang="${lang}"]`);
      if (!node) continue;
      node.textContent = key === 'name' ? content.identity?.name?.[lang] || 'Vasilina Panina'
        : content.footer?.labels?.[key]?.[lang] ?? field.defaults[lang];
    }
    // The signature and rights notice are controlled by the site, never by portfolio drafts.
    const fixed = {
      copyright: `© ${new Date().getFullYear()} ${content.identity?.name?.en || 'Vasilina Panina'} Portfolio. All rights reserved.`,
      credit: 'Crafted by',
      designer: 'The Folio Lab',
    };
    for (const [key, text] of Object.entries(fixed)) {
      const node = root.querySelector(`[data-footer-text="${key}"] > [lang="${lang}"]`);
      if (node) node.textContent = text;
    }
  }
  const signature = root.querySelector('[data-footer-link="designer"]');
  if (signature) signature.href = 'https://thefoliolab.vercel.app/';
  for (const key of ['email', 'instagram', 'agency']) {
    const link = root.querySelector(`[data-footer-link="${key}"]`);
    if (!link) continue;
    const value = footerLinkValue(content, key);
    link.href = key === 'email' ? `mailto:${value}` : /^https?:\/\//i.test(value) ? value : '#';
    if (key === 'email') link.textContent = value;
    if (key === 'email' || key === 'instagram') link.hidden = content.booking?.contact?.[key]?.visible === false;
  }
}
