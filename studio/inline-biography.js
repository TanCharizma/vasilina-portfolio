export function createInlineBiography({ enabled, commit, changed, closeEditor, layoutChanged, addParagraph, removeParagraph }) {
  let active = null;
  const bar = document.createElement('div');
  bar.className = 'inline-edit-actions';
  bar.hidden = true;
  bar.setAttribute('aria-label', 'Biography editing');
  const label = document.createElement('span');
  label.textContent = 'Edit biography';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.textContent = 'Cancel';
  const done = document.createElement('button');
  done.type = 'button'; done.textContent = 'Done'; done.className = 'inline-edit-done';
  const remove = document.createElement('button');
  remove.type = 'button'; remove.textContent = 'Remove'; remove.className = 'inline-edit-remove';
  bar.append(label, remove, cancel, done);
  document.body.append(bar);
  const position = () => {
    const viewport = window.visualViewport;
    const keyboard = Math.max(0, innerHeight - (viewport?.height || innerHeight) - (viewport?.offsetTop || 0));
    bar.style.bottom = `${keyboard}px`;
    active?.node.ownerDocument.documentElement.style.setProperty('--inline-keyboard', `${keyboard}px`);
  };
  const fieldValue = field => ['TEXTAREA', 'INPUT'].includes(field.tagName) ? field.value : field.innerText;
  function finish(save = true) {
    if (!active) return;
    const { node, field, original, originalHTML, index, lang, options } = active;
    const value = fieldValue(field).trim();
    if (save && options?.input && value && !field.checkValidity()) save = false;
    active = null;
    node.classList.remove('inline-biography-active');
    node.removeAttribute('contenteditable');
    if (!save && !options?.input) node.innerHTML = originalHTML;
    else node.textContent = options?.input ? options.display : save ? value : original;
    node.toggleAttribute('data-empty', !node.textContent.trim());
    bar.hidden = true;
    document.body.classList.remove('inline-editing');
    layoutChanged();
    node.focus({ preventScroll: true });
    if (save && value !== original) {
      if (options?.apply) options.apply(value);
      else commit(index, lang, value);
      changed(options?.label || 'Biography');
    }
  }
  done.onclick = () => {
    if (active?.options?.input && !active.field.reportValidity()) return;
    finish(true);
  };
  cancel.onclick = () => finish(false);
  remove.onclick = async () => {
    if (!active || !confirm('Remove this paragraph in both English and Thai? You can undo this.')) return;
    const index = active.index;
    finish(false);
    await removeParagraph(index);
  };
  // Keep the keyboard open until the action has been handled.
  for (const button of [done, cancel, remove]) button.addEventListener('pointerdown', event => event.preventDefault());
  window.visualViewport?.addEventListener('resize', () => {
    position();
    if (active) requestAnimationFrame(() => active?.node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  });
  window.visualViewport?.addEventListener('scroll', position);
  function begin(node, index, lang, options = null) {
    if (!enabled() || active?.node === node) return;
    finish(true); closeEditor();
    const originalHTML = node.innerHTML;
    const original = options?.input ? options.value : node.innerText;
    const field = options?.input ? node.ownerDocument.createElement('input') : options ? node : node.ownerDocument.createElement('textarea');
    if (options?.input) {
      field.type = options.inputType || 'url'; field.className = 'inline-link-field';
      field.value = original; field.placeholder = field.type === 'email' ? 'name@example.com' : 'https://…';
      if (options.pattern) field.pattern = options.pattern;
      field.setAttribute('aria-label', options.inputLabel || 'Agency website link');
      node.replaceChildren(field);
    } else if (options) {
      node.contentEditable = 'plaintext-only';
    } else {
      field.className = 'inline-biography-field';
      field.rows = 1;
      field.setAttribute('aria-label', `Biography paragraph ${index + 1}`);
      field.placeholder = lang === 'th' ? 'Add Thai text' : 'Add English text';
      field.value = original;
    }
    const resize = () => { field.style.height = 'auto'; field.style.height = `${field.scrollHeight}px`; };
    if (!options) node.replaceChildren(field);
    node.classList.add('inline-biography-active');
    active = { node, field, original, originalHTML, index, lang, options };
    label.textContent = `Edit ${options?.label || 'biography'}`;
    remove.hidden = Boolean(options) || index === 0;
    bar.hidden = false; document.body.classList.add('inline-editing'); position();
    layoutChanged();
    if (!options) field.addEventListener('input', resize);
    if (!options || options.input) field.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); finish(true); }
    });
    if (!options) resize();
    field.focus({ preventScroll: true });
    node.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  function attach(doc) {
    if (!doc.querySelector('#inline-biography-style')) {
      const style = doc.createElement('style'); style.id = 'inline-biography-style';
      style.textContent = `
        .visual-edit .inline-biography{position:relative;cursor:text!important;outline:1px solid transparent;outline-offset:4px}
        .visual-edit .inline-biography:hover,.visual-edit .inline-biography:focus-visible,.visual-edit .inline-biography-active{outline-color:#b99b79}
        .inline-biography-field{display:block;width:100%;min-height:1em;box-sizing:border-box;margin:0;padding:0;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;letter-spacing:inherit;line-height:inherit;resize:none;overflow:hidden;outline:none;cursor:text!important}
        .visual-edit .inline-biography::after{content:'✎';position:absolute;right:-10px;top:-12px;width:20px;height:20px;text-align:center;background:var(--bg,#faf8f4);color:#916a40;font:16px/20px Arial,sans-serif;opacity:0;pointer-events:none}
        .visual-edit .inline-biography:hover::after,.visual-edit .inline-biography:focus-visible::after{opacity:1}
        .visual-edit .inline-biography-active::after{display:none}
        .inline-contact-link{display:none}
        .visual-edit .inline-contact-link{display:block;width:fit-content;max-width:100%;margin:4px 0 16px auto;padding:4px 0;color:#916a40;font:12px/1.5 Arial,sans-serif;cursor:pointer!important}
        .inline-contact-link[hidden]{display:none!important}
        .visual-edit .inline-contact-link.inline-biography-active{width:100%;box-sizing:border-box}
        .inline-contact-link .inline-link-field{width:100%;box-sizing:border-box}
        .inline-agency-link{display:none}
        .inline-footer-link{display:none}
        .inline-footer-row{display:contents}
        .visual-edit footer .inline-footer-row{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px;margin-bottom:8px}
        .visual-edit footer .inline-footer-row > a{min-width:0;margin-bottom:0;overflow-wrap:anywhere}
        .visual-edit footer .attribution .inline-footer-row{display:inline-flex;margin:0}
        .visual-edit .inline-footer-link{display:inline-block;flex-shrink:0;padding:4px 0;color:#916a40;font:12px/1.5 Arial,sans-serif;letter-spacing:0;text-transform:none;cursor:pointer!important}
        .inline-footer-link[hidden]{display:none!important}
        .visual-edit .inline-footer-link.inline-biography-active{flex:1 0 100%;width:100%}
        .inline-footer-link .inline-link-field{width:100%;box-sizing:border-box}
        footer .inline-biography::after{display:none!important}
        .visual-edit .inline-agency-link{display:block;width:fit-content;max-width:100%;margin-top:12px;padding:6px 0;color:#916a40;font:14px/1.5 Arial,sans-serif;cursor:pointer!important}
        .inline-link-field{width:min(440px,65vw);max-width:100%;padding:8px;border:1px solid #b99b79;background:var(--bg,#faf8f4);color:inherit;font:16px/1.5 Arial,sans-serif;box-sizing:border-box}
        .practice-copy h2.inline-biography{width:fit-content;max-width:100%}
        .practice-copy a > .inline-biography{display:inline-block;min-width:1em;outline-offset:3px}
        .practice-copy a > .inline-biography::after{display:none}
        .closing-statement > .inline-biography{display:inline-block;max-width:100%;outline-offset:3px}
        .closing-statement > .inline-biography::after{display:none}
        .subpage-index > .inline-biography,.subpage-kicker > .inline-biography,.about-closing .subpage-link > .inline-biography,.about-scroll-cue > .inline-biography{display:inline-block;min-width:1em;outline-offset:3px}
        .subpage-index > .inline-biography::after,.subpage-kicker > .inline-biography::after,.about-closing .subpage-link > .inline-biography::after,.about-scroll-cue > .inline-biography::after,.about-image figcaption .inline-biography::after{display:none}
        .hero-role > .inline-biography,.hero-tagline > .inline-biography,.hero-btns a > .inline-biography,.home-scroll-cue > .inline-biography{display:inline-block;min-width:1em;outline-offset:3px}
        .hero-content .inline-biography::after,.home-scroll-cue > .inline-biography::after{display:none}
        .hero-content h1 > .inline-biography{outline-offset:-1px}
        .manifesto-lead > .inline-biography{display:inline-block;max-width:100%;outline-offset:3px}
        .home-manifesto .home-index > .inline-biography,.manifesto-detail a > .inline-biography{display:inline-block;min-width:1em;outline-offset:3px}
        .home-manifesto .inline-biography::after{display:none}
        .visual-edit .story-frame figcaption{pointer-events:auto!important}
        .story-frame figcaption > .inline-biography,#highlights .home-index > .inline-biography{display:inline-block;min-width:1em;outline-offset:3px}
        .story-frame figcaption > .inline-biography::after,#highlights .home-index > .inline-biography::after{display:none}
        .info-strip .inline-biography,#selected-clients .home-index > .inline-biography,#measurements .home-index > .inline-biography,#compCardBtn > .inline-biography,#compCardDownload > .inline-biography{display:inline-block;min-width:1em;outline-offset:3px}
        .info-strip .inline-biography::after,#selected-clients .home-index > .inline-biography::after,#measurements .home-index > .inline-biography::after,#compCardBtn > .inline-biography::after,#compCardDownload > .inline-biography::after{display:none}
        .visual-edit #compCardModal:has(.inline-biography-active) .comp-card-actions{bottom:calc(var(--inline-keyboard,0px) + var(--overlay-bleed,0px) + 110px)!important}
        #portfolio .home-index > .inline-biography,.chapter-heading h3 > .inline-biography{display:inline-block;min-width:1em;max-width:100%;outline-offset:3px}
        #portfolio .home-index > .inline-biography::after,.chapter-heading h3 > .inline-biography::after{display:none}
        .inline-name-first{display:inline-block}
        .about-opening h1 .inline-biography{outline-offset:-1px}
        .about-opening h1 .inline-biography::after{display:none}
        .portrait-intro > .inline-biography{display:block;outline-offset:-1px}
        .inline-biography[contenteditable]{cursor:text!important;white-space:pre-wrap}
        .visual-edit .inline-biography[data-empty]{min-height:1.8em}
        .visual-edit .inline-biography[data-empty]:not(.inline-biography-active)::before{content:attr(data-placeholder);font:16px/1.8 Arial,sans-serif;color:#8b7966}
        .inline-biography-field::placeholder{font:16px/1.8 Arial,sans-serif;color:#8b7966}
        .inline-biography-add{display:none}
        .visual-edit .inline-biography-add{display:block;margin:20px 0 0;padding:8px 0;min-height:44px;border:0;background:transparent;color:#916a40;font:14px Arial,sans-serif;cursor:pointer!important}
        @media(pointer:coarse),(max-width:600px){.visual-edit .inline-biography{outline-color:#b99b7955}.visual-edit .inline-biography-active{outline-color:#b99b79}.inline-biography-field{font-size:max(16px,1em)}}
      `;
      doc.head.append(style);
      doc.addEventListener('click', event => {
        if (event.target.closest('#langToggle') || event.target.id === 'compCardModal') finish(true);
      }, true);
    }
    for (const lang of ['en', 'th']) {
      const nodes = [...doc.querySelectorAll(`.about-bio p[lang="${lang}"]`)];
      nodes.forEach((node, index) => {
        node.classList.add('inline-biography');
        node.tabIndex = 0;
        node.setAttribute('aria-label', `Edit biography paragraph ${index + 1}`);
        node.dataset.placeholder = lang === 'th' ? 'Add Thai text' : 'Add English text';
        if (node.dataset.inlineBound) return;
        node.dataset.inlineBound = 'true';
        node.addEventListener('click', () => begin(node, index, lang));
        node.addEventListener('keydown', event => {
          if (event.target === node && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault(); begin(node, index, lang);
          }
        });
      });
    }
    doc.querySelector('.inline-biography-add')?.remove();
    const add = doc.createElement('button');
    add.type = 'button'; add.className = 'inline-biography-add'; add.textContent = '+ Add paragraph';
    add.onclick = async () => {
      if (!enabled()) return;
      finish(true); add.disabled = true;
      try {
        const index = await addParagraph();
        const lang = doc.body.classList.contains('lang-th') ? 'th' : 'en';
        const node = doc.querySelectorAll(`.about-bio p[lang="${lang}"]`)[index];
        if (node) begin(node, index, lang);
      } finally { add.disabled = false; }
    };
    doc.querySelector('.about-bio')?.append(add);
  }
  function attachText(node, options) {
    if (!node) return;
    node.classList.add('inline-biography'); node.tabIndex = 0;
    node.setAttribute('aria-label', `Edit ${options.label}`);
    node.dataset.placeholder = options.lang === 'th' ? 'Add Thai text' : 'Add English text';
    node.toggleAttribute('data-empty', !node.textContent.trim());
    node.inlineOptions = options;
    if (node.dataset.inlineBound) return;
    node.dataset.inlineBound = 'true';
    node.addEventListener('click', event => {
      if (!enabled()) return;
      if (node.closest('a')) { event.preventDefault(); event.stopPropagation(); }
      begin(node, null, node.inlineOptions.lang, node.inlineOptions);
    });
    node.addEventListener('keydown', event => {
      if (active?.node === node) {
        if (event.key === 'Escape') { event.preventDefault(); finish(false); }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); finish(true); }
        return;
      }
      if (!active && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); begin(node, null, node.inlineOptions.lang, node.inlineOptions);
      }
    });
  }
  return { attach, attachText, finish, get active() { return Boolean(active); }, get dirty() { return Boolean(active && fieldValue(active.field).trim() !== active.original); } };
}
