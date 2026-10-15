const installed = new WeakSet();

export function installStudioShortcuts(doc, { enabled, undo, redo, save }) {
  if (installed.has(doc)) return;
  installed.add(doc);
  doc.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    const action = key === 'z' ? (event.shiftKey ? 'redo' : 'undo')
      : key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey ? 'redo'
      : key === 's' && !event.shiftKey ? 'save' : null;
    if (!action) return;
    const target = event.target;
    // Text keeps the browser's own undo history until the edit is finished.
    if (action !== 'save' && (target?.isContentEditable || target?.closest?.('input,textarea,select,[role="textbox"]'))) return;
    event.preventDefault();
    if (!enabled() || event.repeat) return;
    ({ undo, redo, save })[action]();
  }, true);
}
