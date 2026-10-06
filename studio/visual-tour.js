export function createStudioTour({ ready, beforeStart, showPhotos, hidePhotos, localTrial }) {
  const $ = id => document.getElementById(id);
  const tour = $('studio-tour');
  const seenKey = `folio-lab-vasilina-tour-v1-${localTrial ? 'trial' : 'online'}`;
  const steps = [
    { title: 'Edit your website', copy: 'Choose a page and an Edit section, or click an Edit button on your website.', targets: ['#section'] },
    { title: 'Add and arrange photos', copy: 'Use Add photos to upload. Drag a photo to rearrange it. Select a photo to replace it or edit its caption.', targets: ['#editor'] },
    { title: 'Check both sizes', copy: 'Switch between Desktop and Mobile to see how your website looks. Preview hides the editing buttons.', targets: ['.switches'] },
    { title: 'Save, then publish', lines: localTrial
      ? [['Save draft', 'Saves on this device.'], ['Publish', 'Available in your signed-in Studio.']]
      : [['Save draft', 'Saves privately.'], ['Publish', 'Updates your live website.']], targets: ['#save', '#publish'] },
  ];
  let step = 0;
  let dismissed = false;
  let previousFocus;
  let highlights = [];
  let showingPhotos = false;
  const svgNS = 'http://www.w3.org/2000/svg';
  const shade = document.createElementNS(svgNS, 'svg');
  shade.classList.add('tour-shade');
  shade.setAttribute('aria-hidden', 'true');
  shade.innerHTML = '<defs><mask id="tour-spotlight" maskUnits="userSpaceOnUse"><rect class="tour-mask-base" fill="white"/></mask></defs><rect class="tour-dim" fill="#2c251f" fill-opacity=".28" mask="url(#tour-spotlight)"/><g class="tour-outlines"/>';
  shade.setAttribute('hidden', '');
  document.body.append(shade);

  function drawSpotlight(width, height) {
    shade.setAttribute('viewBox', `0 0 ${width} ${height}`);
    shade.querySelectorAll('.tour-mask-base,.tour-dim').forEach(rect => {
      rect.setAttribute('width', width); rect.setAttribute('height', height);
    });
    const mask = shade.querySelector('mask');
    mask.querySelectorAll('.tour-hole').forEach(rect => rect.remove());
    const outlines = shade.querySelector('.tour-outlines');
    outlines.replaceChildren();
    highlights.forEach(element => {
      const box = element.getBoundingClientRect();
      const rect = document.createElementNS(svgNS, 'rect');
      for (const [name, value] of Object.entries({x:box.left-5,y:box.top-5,width:box.width+10,height:box.height+10,rx:8})) rect.setAttribute(name, value);
      rect.classList.add('tour-hole');rect.setAttribute('fill', 'black');mask.append(rect);
      const outline = rect.cloneNode();
      outline.setAttribute('fill', 'none');outline.setAttribute('stroke', '#a78050');outline.setAttribute('stroke-width', '2');outlines.append(outline);
    });
  }

  function clearHighlights() {
    highlights.forEach(element => element.classList.remove('tour-highlight'));
    highlights = [];
  }
  function position() {
    if (!tour.open) return;
    const margin = 16;
    const viewport = window.visualViewport;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const offsetTop = viewport?.offsetTop || 0;
    const offsetLeft = viewport?.offsetLeft || 0;
    const box = highlights[0]?.getBoundingClientRect();
    const mobile = width <= 900;
    const anchorLeft = step === 1 ? (box?.left || 0) - tour.offsetWidth - 24 : box?.left;
    const left = mobile ? margin : Math.min(Math.max(margin, anchorLeft || margin), width - tour.offsetWidth - margin);
    const preferredTop = mobile && step !== steps.length - 1
      ? height - tour.offsetHeight - margin
      : step === 1 ? (box?.top || 130) : (box?.bottom || 130) + 16;
    tour.style.left = `${offsetLeft + Math.max(margin, left)}px`;
    tour.style.top = `${offsetTop + Math.max(margin, Math.min(preferredTop, height - tour.offsetHeight - margin))}px`;
    drawSpotlight(width, height);
  }
  function render() {
    clearHighlights();
    const current = steps[step];
    if (step === 1 && !showingPhotos) { showPhotos(); showingPhotos = true; }
    else if (step !== 1 && showingPhotos) { hidePhotos(); showingPhotos = false; }
    $('tour-title').textContent = current.title;
    const copy = $('tour-copy');
    copy.replaceChildren();
    if (current.lines) {
      current.lines.forEach(([label, text]) => {
        const line = document.createElement('span'), strong = document.createElement('strong');
        strong.textContent = `${label}: `;line.append(strong, text);copy.append(line);
      });
    } else copy.textContent = current.copy;
    $('tour-progress').textContent = `${step + 1} of ${steps.length}`;
    $('tour-back').disabled = step === 0;
    $('tour-next').textContent = step === steps.length - 1 ? 'Got it' : 'Next';
    highlights = current.targets.map(selector => document.querySelector(selector)).filter(element => element && element.getClientRects().length);
    highlights.forEach(element => element.classList.add('tour-highlight'));
    position();
    if (tour.open) $('tour-next').focus({preventScroll:true});
  }
  function finish() {
    dismissed = true;
    try { localStorage.setItem(seenKey, 'seen'); } catch {}
    clearHighlights();
    shade.setAttribute('hidden', '');
    if (showingPhotos) { hidePhotos(); showingPhotos = false; }
    const focusTarget = previousFocus?.isConnected && previousFocus !== document.body && previousFocus.getClientRects().length ? previousFocus : $('studio-help').querySelector('summary');
    focusTarget?.focus();
  }
  function start() {
    if (!ready() || tour.open) return;
    previousFocus = document.activeElement;
    $('studio-help').open = false;
    beforeStart();
    step = 0;
    render();
    tour.showModal();
    shade.removeAttribute('hidden');
    position();
    $('tour-next').focus();
  }
  $('show-tour').addEventListener('click', start);
  $('tour-skip').addEventListener('click', () => tour.close());
  $('tour-back').addEventListener('click', () => { if (step > 0) { step--; render(); } });
  $('tour-next').addEventListener('click', () => {
    if (step === steps.length - 1) tour.close();
    else { step++; render(); }
  });
  tour.addEventListener('close', finish);
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  return {
    maybeStart() {
      let seen = dismissed;
      try { seen ||= localStorage.getItem(seenKey) === 'seen'; } catch {}
      if (!seen) start();
    },
    close() { if (tour.open) tour.close(); },
  };
}
