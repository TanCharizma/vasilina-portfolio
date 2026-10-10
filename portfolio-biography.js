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

// Keep the invitation's two-line treatment when its wording is edited.
export function renderClosingInvitation(doc, value = {}) {
  for (const lang of ['en', 'th']) {
    const node = doc.querySelector(`.about-closing .closing-statement > [lang="${lang}"]`);
    if (!node) continue;
    const text = value[lang] || '';
    let lines = text.split(/\r?\n/);
    if (lines.length === 1 && lang === 'en') {
      const split = text.lastIndexOf(' ');
      if (split > 0) lines = [text.slice(0, split), text.slice(split + 1)];
    } else if (lines.length === 1 && text === 'มาร่วมงานกันนะคะ') {
      lines = ['มาร่วมงาน', 'กันนะคะ'];
    }
    node.replaceChildren();
    lines.forEach((line, index) => {
      if (index) node.append(doc.createElement('br'));
      if (index === lines.length - 1 && index > 0) {
        const emphasis = doc.createElement('em'); emphasis.textContent = line; node.append(emphasis);
      } else node.append(doc.createTextNode(line));
    });
  }
}
