// Preserve the designed opening spreads and compose extra photos using their proportions.
const layouts = new WeakMap();
export async function renderPortfolioChapters(doc, home, resolveSource = source => new URL(source, doc.baseURI).href) {
  if (!Array.isArray(home?.portfolioChapters) || !Array.isArray(home?.portfolioPhotos)) return;
  const map = new Map(home.portfolioPhotos.map(photo => [photo.id, photo]));
  for (const [index, node] of [...doc.querySelectorAll('.work-chapter')].entries()) {
    const chapter = home.portfolioChapters[index];
    if (!chapter) continue;
    const container = node.querySelector('.chapter-images');
    let layout = layouts.get(container);
    if (!layout) {
      layout = { templates: [...container.querySelectorAll('.portfolio-spread')].map(spread => ({className:spread.className,count:spread.querySelectorAll('img').length})), signature:'' };
      layouts.set(container,layout);
    }
    for (const lang of ['en','th']) {
      const title=node.querySelector(`.chapter-heading h3 [lang="${lang}"]`);
      if(title)title.textContent=chapter.title?.[lang]||'';
    }
    const photos=chapter.photos.map(id=>map.get(id)).filter(Boolean);
    // Keep an empty section available for uploads in Studio.
    node.hidden=!photos.length && !new URL(doc.URL).searchParams.has('studio-preview');
    const signature=JSON.stringify(photos);
    if(layout.signature===signature)continue;
    const images=await Promise.all(photos.map(async photo=>{
      const image=doc.createElement('img');
      image.className='reveal active';image.decoding='async';image.alt=photo.alt||'';
      image.dataset.captionEn=photo.caption?.en||'';image.dataset.captionTh=photo.caption?.th||'';
      image.src=await resolveSource(photo.src);
      // Load proportions before composing a spread; preserve the full photograph.
      await new Promise(resolve=>{if(image.complete)return resolve();image.onload=resolve;image.onerror=resolve;});
      return image;
    }));
    const fragment=doc.createDocumentFragment();let next=0;
    const append=(className,count)=>{
      const spread=doc.createElement('div');spread.className=className;
      spread.append(...images.slice(next,next+count));fragment.append(spread);next+=count;
    };
    for(const template of layout.templates) {
      if(next>=images.length)break;
      const count=Math.min(template.count,images.length-next);
      append(count===template.count?template.className:count===1?'portfolio-spread portfolio-spread-wide':'portfolio-spread portfolio-spread-right',count);
    }
    let extra=0;
    while(next<images.length) {
      const landscape=image=>image.naturalWidth>image.naturalHeight*1.15;
      if(landscape(images[next])||images.length-next===1) {append('portfolio-spread portfolio-spread-wide',1);extra++;continue;}
      let portraitCount=0;
      while(portraitCount<3 && images[next+portraitCount] && !landscape(images[next+portraitCount]))portraitCount++;
      const count=portraitCount===3 && images.length-next!==4?3:Math.min(2,portraitCount);
      const style=count===1?'wide':count===3?'three':['right','offset','left'][extra%3];
      append(`portfolio-spread portfolio-spread-${style}`,count);extra++;
    }
    container.replaceChildren(fragment);layout.signature=signature;
  }
}
