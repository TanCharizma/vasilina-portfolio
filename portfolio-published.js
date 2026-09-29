import { getPublishedPortfolio, portfolioBackendReady } from './portfolio-backend.js';

if (portfolioBackendReady && !new URLSearchParams(location.search).has('studio-preview')) {
  getPublishedPortfolio().then(publication => {
    if (publication?.content?.schemaVersion !== 1) return;
    const { portfolioChapters, portfolioPhotos } = publication.content.home || {};
    if (!Array.isArray(portfolioChapters) || !Array.isArray(portfolioPhotos)) return;

    const photoMap = new Map(portfolioPhotos.map(photo => [photo.id, photo]));
    const chapters = document.querySelectorAll('#portfolio .work-chapter');
    chapters.forEach((chapterElement, chapterIndex) => {
      const chapter = portfolioChapters[chapterIndex];
      if (!chapter || !Array.isArray(chapter.photos)) return;
      const container = chapterElement.querySelector('.chapter-images');
      const templates = [...container.querySelectorAll('.portfolio-spread')].map(spread => ({
        className: spread.className,
        count: spread.querySelectorAll('img').length,
      }));
      const photos = chapter.photos.map(id => photoMap.get(id)).filter(Boolean);
      const title = chapterElement.querySelector('.chapter-heading h3');
      for (const language of ['en', 'th']) {
        const label = title?.querySelector(`[lang="${language}"]`);
        if (label) label.textContent = chapter.title?.[language] || '';
      }
      chapterElement.hidden = photos.length === 0;
      container.replaceChildren();

      let next = 0;
      for (const template of templates) {
        if (next >= photos.length) break;
        const count = Math.min(template.count, photos.length - next);
        const className = count === template.count ? template.className
          : count === 1 ? 'portfolio-spread portfolio-spread-wide'
          : count === 3 ? 'portfolio-spread portfolio-spread-three'
          : 'portfolio-spread portfolio-spread-left';
        container.append(createSpread(className, photos.slice(next, next + count)));
        next += count;
      }
      while (next < photos.length) {
        const count = Math.min(2, photos.length - next);
        const className = count === 1 ? 'portfolio-spread portfolio-spread-wide'
          : container.children.length % 2 ? 'portfolio-spread portfolio-spread-right'
          : 'portfolio-spread portfolio-spread-left';
        container.append(createSpread(className, photos.slice(next, next + count)));
        next += count;
      }
    });
  }).catch(error => console.error('Published portfolio could not be loaded:', error));
}

function createSpread(className, photos) {
  const spread = document.createElement('div');
  spread.className = className;
  for (const photo of photos) {
    const image = document.createElement('img');
    image.src = new URL(photo.src, document.baseURI).href;
    image.alt = photo.alt || 'Vasilina Panina portfolio photo';
    image.className = 'reveal active';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.dataset.captionEn = photo.caption?.en || '';
    image.dataset.captionTh = photo.caption?.th || '';
    image.style.cursor = 'pointer';
    spread.append(image);
  }
  return spread;
}
