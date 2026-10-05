const templateNodes = new WeakMap();

export async function renderMotionGallery(doc, entries, resolveSource = source => new URL(source, doc.baseURI).href) {
  const grid = doc.querySelector('.motion-video-grid');
  if (!grid || !Array.isArray(entries)) return;

  let nodes = templateNodes.get(grid);
  if (!nodes) {
    nodes = new Map();
    for (const item of grid.querySelectorAll('.video-item')) {
      const mediaId = item.querySelector('wistia-player')?.getAttribute('media-id');
      if (mediaId) nodes.set(`wistia:${mediaId}`, item);
    }
    templateNodes.set(grid, nodes);
  }

  const next = [];
  for (const entry of entries) {
    if (entry.provider === 'wistia' && entry.mediaId) {
      const key = `wistia:${entry.mediaId}`;
      let item = nodes.get(key);
      if (!item) {
        item = doc.createElement('div');
        item.className = 'video-item reveal active';
        const player = doc.createElement('wistia-player');
        player.setAttribute('media-id', entry.mediaId);
        player.setAttribute('player-color', '#303030');
        player.setAttribute('big-play-button', 'true');
        item.append(player);
        const script = doc.createElement('script');
        script.type = 'module';
        script.src = `https://fast.wistia.com/embed/${encodeURIComponent(entry.mediaId)}.js`;
        item.append(script);
        nodes.set(key, item);
      }
      next.push(item);
    } else if (entry.provider === 'file' && entry.src) {
      const key = `file:${entry.id}`;
      let item = nodes.get(key);
      if (!item) {
        item = doc.createElement('div');
        item.className = 'video-item reveal active';
        const video = doc.createElement('video');
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.setAttribute('controlsList', 'nodownload');
        const fallback = doc.createElement('p');
        fallback.className = 'motion-video-fallback';
        fallback.hidden = true;
        fallback.append('This clip cannot play here. ');
        const link = doc.createElement('a');
        link.textContent = 'Open original video';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        fallback.append(link);
        video.addEventListener('error', () => { fallback.hidden = false; });
        video.addEventListener('loadedmetadata', () => { fallback.hidden = true; });
        item.append(video, fallback);
        nodes.set(key, item);
      }
      const video = item.querySelector('video');
      const src = await resolveSource(entry.src);
      if (video.src !== src) {
        item.querySelector('.motion-video-fallback').hidden = true;
        video.src = src;
      }
      item.querySelector('.motion-video-fallback a').href = src;
      video.setAttribute('aria-label', entry.name || 'Portfolio video');
      if (entry.aspect > 0) video.style.aspectRatio = String(entry.aspect);
      next.push(item);
    }
  }
  if (next.length !== grid.children.length || next.some((item, index) => grid.children[index] !== item)) {
    grid.replaceChildren(...next);
  }
}

export async function renderMotionStills(doc, ids, photos, resolveSource = source => new URL(source, doc.baseURI).href) {
  const images = doc.querySelectorAll('.motion-stills img');
  if (!images.length || !Array.isArray(ids) || !Array.isArray(photos)) return;
  const photoMap = new Map(photos.map(photo => [photo.id, photo]));
  for (let index = 0; index < images.length; index++) {
    const photo = photoMap.get(ids[index]);
    images[index].hidden = !photo;
    images[index].style.display = photo ? '' : 'none';
    if (!photo) continue;
    images[index].src = await resolveSource(photo.src);
    images[index].alt = photo.alt || '';
    images[index].dataset.captionEn = photo.caption?.en || '';
    images[index].dataset.captionTh = photo.caption?.th || '';
  }
}
