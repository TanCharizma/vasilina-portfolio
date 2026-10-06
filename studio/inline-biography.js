export function createInlineBiography({ enabled, commit, changed, closeEditor, layoutChanged }) {
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
  bar.append(label, cancel, done);
  document.body.append(bar);
  const position = () => {
    const viewport = window.visualViewport;
    bar.style.bottom = `${Math.max(0, innerHeight - (viewport?.height || innerHeight) - (viewport?.offsetTop || 0))}px`;
  };
  function finish(save = true) {
    if (!active) return;
    const { node, field, original, index, lang } = active;
    const value = field.value.trim();
    active = null;
    node.classList.remove('inline-biography-active');
    node.textContent = save ? value : original;
    bar.hidden = true;
    document.body.classList.remove('inline-editing');
    layoutChanged();
    node.focus({ preventScroll: true });
    if (save && value !== original) { commit(index, lang, value); changed(); }
  }
  done.onclick = () => finish(true);
  cancel.onclick = () => finish(false);
  // Keep the keyboard open until the action has been handled.
  for (const button of [done, cancel]) button.addEventListener('pointerdown', event => event.preventDefault());
  window.visualViewport?.addEventListener('resize', () => {
    position();
    if (active) requestAnimationFrame(() => active?.node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  });
  window.visualViewport?.addEventListener('scroll', position);
  function begin(node, index, lang) {
    if (!enabled() || active?.node === node) return;
    finish(true); closeEditor();
    const original = node.textContent;
    const field = node.ownerDocument.createElement('textarea');
    field.className = 'inline-biography-field';
    field.setAttribute('aria-label', `Biography paragraph ${index + 1}`);
    field.value = original;
    const resize = () => { field.style.height = 'auto'; field.style.height = `${field.scrollHeight + 2}px`; };
    node.replaceChildren(field);
    node.classList.add('inline-biography-active');
    active = { node, field, original, index, lang };
    bar.hidden = false; document.body.classList.add('inline-editing'); position();
    layoutChanged();
    field.addEventListener('input', resize);
    field.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); finish(true); }
    });
    resize(); field.focus({ preventScroll: true });
    node.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  function attach(doc) {
    if (!doc.querySelector('#inline-biography-style')) {
      const style = doc.createElement('style'); style.id = 'inline-biography-style';
      style.textContent = `.visual-edit .inline-biography{cursor:text!important;outline:1px solid transparent;outline-offset:7px;position:relative}.visual-edit .inline-biography:hover,.visual-edit .inline-biography:focus-visible,.visual-edit .inline-biography-active{outline-color:#b99b79}.inline-biography-field{display:block;width:100%;min-height:1.5em;box-sizing:border-box;margin:0;padding:0;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;letter-spacing:inherit;line-height:inherit;resize:none;overflow:hidden;outline:none;cursor:text!important}.visual-edit .inline-biography::after{content:'✎';position:absolute;right:0;top:-24px;color:#916a40;font:16px Arial,sans-serif;opacity:0}.visual-edit .inline-biography:hover::after,.visual-edit .inline-biography:focus-visible::after{opacity:1}.inline-biography-active::after{display:none}@media(pointer:coarse){.visual-edit .inline-biography{outline-color:#b99b7955}.visual-edit .inline-biography::after{opacity:1}.inline-biography-field{font-size:max(16px,1em)}}`;
      doc.head.append(style);
    }
    for (const lang of ['en', 'th']) {
      const nodes = [...doc.querySelectorAll(`.about-bio p[lang="${lang}"]`)];
      nodes.forEach((node, index) => {
        node.classList.add('inline-biography');
        node.tabIndex = 0;
        node.setAttribute('aria-label', `Edit biography paragraph ${index + 1}`);
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
  }
  return { attach, finish, get active() { return Boolean(active); }, get dirty() { return Boolean(active && active.field.value.trim() !== active.original); } };
}
