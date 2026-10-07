export function renderBiography(doc, paragraphs = []) {
  for (const lang of ['en', 'th']) {
    const lead = doc.querySelector(`.about-lead[lang="${lang}"]`);
    if (lead) {
      lead.textContent = paragraphs[0]?.[lang] || '';
      lead.toggleAttribute('data-empty', !lead.textContent.trim());
    }
  }
  const body = doc.querySelector('.about-body');
  if (!body) return;
  body.replaceChildren();
  for (const paragraph of paragraphs.slice(1)) {
    const group = doc.createElement('div');
    group.className = 'biography-paragraph';
    for (const lang of ['en', 'th']) {
      const p = doc.createElement('p');
      p.lang = lang; p.textContent = paragraph[lang] || '';
      p.toggleAttribute('data-empty', !p.textContent.trim());
      group.toggleAttribute(`data-empty-${lang}`, !p.textContent.trim());
      group.append(p);
    }
    body.append(group);
  }
  if (!doc.querySelector('#biography-language-style')) {
    const style = doc.createElement('style'); style.id = 'biography-language-style';
    style.textContent = `
      body .about-bio p[data-empty]{display:none!important}
      body:not(.lang-th) .biography-paragraph[data-empty-en],body.lang-th .biography-paragraph[data-empty-th]{display:none!important}
      .visual-edit body:not(.lang-th) .about-bio p[lang=en][data-empty],.visual-edit body.lang-th .about-bio p[lang=th][data-empty]{display:block!important}
      .visual-edit body:not(.lang-th) .biography-paragraph[data-empty-en],.visual-edit body.lang-th .biography-paragraph[data-empty-th]{display:block!important}
    `;
    doc.head.append(style);
  }
}
