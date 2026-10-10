import { FOOTER_TEXT_FIELDS, footerLinkValue } from '../portfolio-footer-text.js?v=2';
import { BOOKING_TEXT_FIELDS } from '../portfolio-booking.js?v=4';
import { HOME_TEXT_FIELDS, MEASUREMENT_FIELDS } from '../portfolio-home-text.js?v=8';
import { ABOUT_TEXT_FIELDS } from '../portfolio-about-text.js?v=1';
import { visualDraftStatus } from './visual-status.js?v=1';
import { createStudioTour } from './visual-tour.js?v=24';
import { createInlineBiography } from './inline-biography.js?v=25';

const $ = id => document.getElementById(id);
const frame = $('website'), controls = $('controls'), dialog = $('editor');
const localTrial=new URLSearchParams(location.search).has('local');
let api, page = 'home', editing = true, device = matchMedia('(max-width:700px)').matches ? 'mobile' : 'desktop';
let pendingAnchor = '', addTarget, lastTrigger, updating = false, updateAgain = false, timer;
let returnPhoto = null;
let returnRegion = null;
let popupPosition = null;
let popupSize = null;
let editorReturnMenu = null;
let editorMenuTitle = 'Edit section';
let editorReturnGallery = null;
let tourView = null;
let refreshWaiters = [];
const inlineBiography = createInlineBiography({
  enabled: () => editing && Boolean(api?.ready),
  commit: (index, lang, value) => api.updateBiography(index, lang, value),
  changed: label => { syncStatus(); notify(`${label} updated. Save draft to keep it.`); },
  closeEditor: () => dialog.close(),
  layoutChanged: () => fit(),
  addParagraph: async () => { const index = api.addBiography(); await refresh(); syncStatus(); return index; },
  removeParagraph: async index => { api.removeBiography(index); await refresh(); syncStatus(); notify('Paragraph removed. Undo is available.'); },
});
const studioTour = createStudioTour({
  ready:()=>Boolean(api?.ready) && api.status.state !== 'busy',
  beforeStart:async()=>{
    inlineBiography.finish(true); dialog.close();
    if (!api.beginTourPractice()) return false;
    tourView = { page, device, editing, section: $('section').value, scroll: frame.contentWindow.scrollY };
    editing=false; $('edit').setAttribute('aria-pressed','false'); $('view').setAttribute('aria-pressed','true');
    await new Promise(resolve=>{frame.addEventListener('load',resolve,{once:true});loadPage('home');});
    await refresh(); fit(); syncStatus();
    return true;
  },
  prepareStep:async phase=>{
    inlineBiography.finish(false); dialog.close();
    document.body.classList.toggle('tour-photo-practice',phase==='arrange');
    fit();
    editing=phase==='arrange'||phase==='voice';
    $('edit').setAttribute('aria-pressed',String(editing));$('view').setAttribute('aria-pressed',String(!editing));
    $('section').disabled=!editing;
    frame.contentDocument?.documentElement.classList.toggle('visual-edit',editing);
    await refresh();
    const doc=frame.contentDocument;
    if (phase === 'welcome' || phase === 'preview') {
      frame.contentWindow.scrollTo(0,0);
      return { doc, buttons:phase==='preview'?[$('desktop'),$('mobile')]:[], page:phase==='preview'?$('page'):null };
    }
    if (phase === 'share') return { doc, buttons:[$('save'),$('publish')].filter(button=>button.getClientRects().length) };
    if (phase === 'voice') {
      const text=[...doc.querySelectorAll('.manifesto-detail p[lang]')].find(node=>node.getClientRects().length);
      text?.scrollIntoView({block:matchMedia('(max-width:900px)').matches?'start':'center',behavior:'instant'});
      return { doc, text };
    }
    const photos=[...doc.querySelectorAll('.story-frame img')];
    photos[0]?.scrollIntoView({block:matchMedia('(max-width:900px)').matches?'start':'center',behavior:'instant'});
    if (phase === 'arrange') {
      revealPhotoTools(photos[0]);
      const handle=[...doc.querySelectorAll('.visual-drag-chip')].find(button=>button.photoElement===photos[0]);
      return { doc, source:photos[0], destination:photos[1], handle };
    }
    return { doc };
  },
  photoOrder:()=>api.content.home.selectedWork.map(photo=>photo.id).join('|'),
  hasUnsavedChanges:()=>Boolean(api?.dirty||inlineBiography.dirty),
  switchPhotos:async()=>{
    const photos=api.content.home.selectedWork;
    if(photos.length<2)return;
    api.reorderPhotos('selectedWork',photos[0].id,photos[1].id);
    await refresh();
  },
  restorePractice:async()=>{api.resetTourPractice();await refresh();},
  finishPractice:async keep=>{
    document.body.classList.remove('tour-photo-practice');
    inlineBiography.finish(false); api?.endTourPractice(keep);
    if (!tourView) return;
    const previous=tourView; tourView=null;
    device=previous.device; editing=previous.editing;
    $('edit').setAttribute('aria-pressed',String(editing));$('view').setAttribute('aria-pressed',String(!editing));
    $('section').disabled=!editing;
    await new Promise(resolve=>{frame.addEventListener('load',resolve,{once:true});loadPage(previous.page);});
    await refresh(); fit(); $('section').value=previous.section; $('notice').hidden=true;
    frame.contentWindow.scrollTo(0,previous.scroll);syncStatus();
    if(keep)notify(api?.dirty?'Your edits are ready. Choose Save draft to keep them.':'Your Studio is ready to explore.');
    else notify('Your original portfolio is restored.');
  },
  localTrial
});
const pageSections={
  home:[['home','Cover photo','home',{group:'Cover image'},'#hero'],['selectedWork','Selected work','home',{gallery:'selectedWork'},'#highlights'],['portfolio','Portfolio','portfolio'],['digitals','Digitals','digitals'],['motion','Videos & stills','motion'],['arrangeMotion','Arrange motion','motion',{gallery:'motion'},'#motion'],['identity','Measurement visibility','identity',{group:'Measurements'},'#measurements'],['compCard','Comp card','compCard'],['clientLogos','Client logos','home',{group:'Client logos'},'#selected-clients']],
  about:[['about','Portrait photo','about',{group:'Portrait'},'#about-portrait'],['agency','Agency visibility','about',{group:'Agency details'},'.about-practice'],['clientLogos','Client logos','home',{group:'Client logos'},'.about-clients']],
  booking:[['calendar','Calendar settings','booking',{group:'Your calendar'},'.calendar-frame'],['contact','Contact settings','booking',{group:'Contact options'},'.direct-inquiries']],
};
const sectionMenus = {
  motion: [
    {label:'Videos',section:'motion',target:{group:'Videos'}},
    {label:'Motion stills',section:'motion',target:{group:'Motion stills'}},
    {label:'Arrange motion',section:'motion',target:{gallery:'motion'}},
  ],
  booking: [
    {label:'Contact options',section:'booking',target:{group:'Contact options'}},
    {label:'Calendar',section:'booking',target:{group:'Your calendar'}},
  ],
};
function updateSections(){
  $('section').replaceChildren(new Option('Choose…',''),...pageSections[page].map(([value,label])=>new Option(label,value)));
}
const sectionPage = { about:'about',booking:'booking' };
const sectionAnchor = {home:'#hero',portfolio:'#portfolio',digitals:'#digitals',motion:'#motion',identity:'#measurements',compCard:'#measurements',about:'#about-portrait',booking:'.booking-desk'};
function notify(text) { $('notice').textContent=text; $('notice').hidden=false; clearTimeout(timer); timer=setTimeout(()=>$('notice').hidden=true,5500); }
function fit() {
  dialog.style.setProperty('--editor-height',`${window.visualViewport?.height||innerHeight}px`);
  dialog.style.setProperty('--editor-top',`${window.visualViewport?.offsetTop||0}px`);
  const workspace=$('workspace');
  workspace.style.height=`${Math.max(180,innerHeight-workspace.getBoundingClientRect().top)}px`;
  const width=device==='mobile'?390:Math.max(1280,workspace.clientWidth);
  const scale=Math.min(1,workspace.clientWidth/width);
  frame.style.width=`${width}px`;frame.style.height=`${workspace.clientHeight/scale}px`;frame.style.transform=`scale(${scale})`;
  $('viewport').style.width=`${width*scale}px`;$('viewport').style.height=`${workspace.clientHeight}px`;
  for(const name of ['desktop','mobile'])$(name).setAttribute('aria-pressed',String(device===name));
  const doc=frame.contentDocument;
  const nav=doc?.querySelector('nav');
  if(nav)doc.documentElement.style.setProperty('--visual-header-height',`${nav.offsetHeight}px`);
  positionPhotoLabels();
  if(matchMedia('(max-width:900px)').matches){popupPosition=null;popupSize=null;dialog.style.left='';dialog.style.top='';dialog.style.right='';dialog.style.transform='';dialog.style.width='';dialog.style.height='';}
  else {
    if(popupSize){dialog.style.width=`${Math.min(popupSize.width,innerWidth-16)}px`;dialog.style.height=`${Math.min(popupSize.height,innerHeight-16)}px`;}
    if(popupPosition)placePopup(popupPosition.x,popupPosition.y);
  }
}
function positionPhotoLabels() {
  const doc=frame.contentDocument;
  if(doc?.documentElement.classList.contains('visual-edit')) {
    const heroToolbar=doc.querySelector('#hero>.visual-opening-toolbar');
    if(heroToolbar) {
      const heroTop=heroToolbar.parentElement.getBoundingClientRect().top+doc.defaultView.scrollY;
      heroToolbar.style.top=`${(doc.querySelector('nav')?.offsetHeight||68)+16-Math.min(0,heroTop)}px`;
    }
    const width=doc.documentElement.clientWidth;
    const inset=width<=600?24:Math.min(64,Math.max(32,width*.04));
    doc.querySelectorAll('.visual-section-button').forEach(button=>{
      button.style.setProperty('--visual-section-offset','0px');
      const right=button.getBoundingClientRect().right;
      button.style.setProperty('--visual-section-offset',`${width-inset-right}px`);
    });
  }
  doc?.querySelectorAll('.visual-photo-chip').forEach(button=>{
    const image=button.photoElement;
    if(!image?.isConnected)return;
    const r=image.getBoundingClientRect(),p=button.parentElement.getBoundingClientRect();
    button.style.top=`${r.top-p.top+12}px`;button.style.left=`${r.right-p.left-(button.dragButton?100:56)}px`;
    const handle=button.dragButton;if(handle){handle.style.top=button.style.top;handle.style.left=`${r.right-p.left-56}px`;}
  });
}
function placePopup(x,y) {
  const width=dialog.offsetWidth,height=dialog.offsetHeight;
  popupPosition={x:Math.max(8,Math.min(x,innerWidth-width-8)),y:Math.max(8,Math.min(y,innerHeight-height-8))};
  dialog.style.left=`${popupPosition.x}px`;dialog.style.top=`${popupPosition.y}px`;dialog.style.right='auto';dialog.style.transform='none';
}
function enableDirectDrag(handle,image,group,id) {
  const doc=image.ownerDocument,win=doc.defaultView;
  let pointer=null,startX=0,startY=0,x=0,y=0,ghost,target,marker,raf,moved=false;
  const clear=()=>{target?.classList.remove('visual-drop-target');target=null;if(marker)marker.hidden=true;};
  const groupItems=()=>[...doc.querySelectorAll('[data-drag-group]')].filter(node=>node.dataset.dragGroup===group && !node.classList.contains('visual-drag-ghost'));
  const showPlacement=()=>{
    if(!target||!marker)return;
    const items=groupItems(),from=items.indexOf(image),to=items.indexOf(target),after=from<to;
    const r=target.getBoundingClientRect();
    const row=items.some(node=>node!==target&&Math.abs(node.getBoundingClientRect().top-r.top)<30);
    marker.hidden=false;
    marker.classList.toggle('vertical',row);
    marker.classList.toggle('label-left',row&&after);
    marker.style.left=`${row?(after?r.right+5:r.left-9):r.left}px`;
    marker.style.top=`${row?r.top:(after?r.bottom+5:r.top-9)}px`;
    marker.style.width=`${row?4:r.width}px`;
    marker.style.height=`${row?r.height:4}px`;
    const label=`Place ${after?'after':'before'} ${group==='motion'?'video':'photo'} ${to+1}`;
    if(marker.firstChild.textContent!==label)marker.firstChild.textContent=label;
  };
  const draw=()=>{
    if(!ghost)return;
    const edge=70,top=doc.querySelector('nav')?.offsetHeight||70;
    if(y<top+edge)win.scrollBy(0,-Math.min(14,(top+edge-y)/5));
    else if(y>win.innerHeight-edge)win.scrollBy(0,Math.min(14,(y-win.innerHeight+edge)/5));
    ghost.style.left=`${x-ghost.offsetWidth/2}px`;ghost.style.top=`${y-ghost.offsetHeight/2}px`;
    const next=groupItems().find(node=>{
      if(node===image||node.dataset.dragGroup!==group)return false;
      const r=node.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
    });
    if(next!==target){clear();target=next;target?.classList.add('visual-drop-target');}
    showPlacement();
    raf=win.requestAnimationFrame(draw);
  };
  const finish=commit=>{
    if(pointer===null)return;
    const destination=target?.dataset.dragId||target?.dataset.visualPhotoId;
    win.cancelAnimationFrame(raf);clear();marker?.remove();marker=null;ghost?.remove();ghost=null;image.style.opacity='';
    doc.documentElement.classList.remove('visual-dragging');
    const captured=pointer;pointer=null;if(handle.hasPointerCapture(captured))handle.releasePointerCapture(captured);
    if(commit&&moved&&destination&&api.reorderPhotos(group,id,destination)) {
      refresh();notify(`${group==='motion'?'Video':'Photo'} moved. Save draft to keep the order.`);
    }
  };
  handle.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
  handle.addEventListener('contextmenu',event=>event.preventDefault());
  handle.addEventListener('pointerdown',event=>{
    if(!editing||!event.isPrimary||event.button!==0)return;
    event.preventDefault();event.stopPropagation();pointer=event.pointerId;moved=false;
    startX=x=event.clientX;startY=y=event.clientY;handle.setPointerCapture(pointer);
  });
  handle.addEventListener('pointermove',event=>{
    if(event.pointerId!==pointer)return;x=event.clientX;y=event.clientY;
    if(!moved&&Math.hypot(x-startX,y-startY)<6)return;
    if(!moved){
      moved=true;const r=image.getBoundingClientRect();ghost=image.tagName==='IMG'?image.cloneNode():doc.createElement('div');
      if(image.tagName!=='IMG')ghost.textContent='Moving video';
      for(const attribute of ['data-visual-section','data-drag-group','data-drag-id','data-visual-photo-id'])ghost.removeAttribute(attribute);
      ghost.className='visual-drag-ghost';
      marker=doc.createElement('div');marker.className='visual-drop-marker';marker.hidden=true;
      const label=doc.createElement('span');label.setAttribute('role','status');label.setAttribute('aria-live','polite');marker.append(label);doc.body.append(marker);
      ghost.style.width=`${Math.min(200,r.width)}px`;ghost.style.height=`${Math.min(250,r.height)}px`;
      doc.body.append(ghost);image.style.opacity='.4';doc.documentElement.classList.add('visual-dragging');draw();
    }
  });
  handle.addEventListener('pointerup',event=>{if(event.pointerId===pointer)finish(true);});
  handle.addEventListener('pointercancel',()=>finish(false));handle.addEventListener('lostpointercapture',()=>finish(false));
  handle.addEventListener('keydown',event=>{if(event.key==='Escape')finish(false);});
}
function openEditor(section,target,trigger) {
  inlineBiography.finish(true);
  if(!api?.ready||!editing)return;
  if (!target && sectionMenus[section]) target = {menu:sectionMenus[section]};
  $('editor-menu').hidden=true;controls.hidden=false;
  editorReturnMenu=target?.returnMenu||null;
  editorReturnGallery=target?.returnGallery||null;
  if (target?.photoId && !editorReturnGallery && ['portfolio','digitals','home'].includes(section)) {
    editorReturnGallery={section,target:api.galleryTarget(section,target.photoId),photoId:target.photoId};
  }
  $('editor-back').hidden=!editorReturnMenu&&!editorReturnGallery;
  $('editor-back').setAttribute('aria-label',editorReturnGallery?'Back to photos':'Back to section');
  if(target?.menu){
    editorReturnMenu=null;editorReturnGallery=null;$('editor-back').hidden=true;
    dialog.classList.remove('photo-editor','gallery-editor','text-editor','comp-card-editor');
    $('editor-menu').replaceChildren();
    for(const choice of target.menu){
      const button=document.createElement('button');button.type='button';button.textContent=choice.label;
      button.onclick=()=>openEditor(choice.section,{...choice.target,returnMenu:target.menu},trigger);
      $('editor-menu').append(button);
    }
    $('editor-menu').hidden=false;controls.hidden=true;
    editorMenuTitle={home:'Edit Homepage',identity:'Edit Profile & comp card',about:'Edit About',motion:'Edit Motion',booking:'Edit Booking'}[section]||'Edit section';
    $('editor-title').textContent=editorMenuTitle;
    if(!dialog.open)dialog.show();fit();$('close').focus({preventScroll:true});return;
  }
  lastTrigger=trigger;
  returnRegion=trigger?.closest('.visual-region')||null;
  returnPhoto=Number.isInteger(target?.stillIndex)?{selector:`.motion-stills img:nth-child(${target.stillIndex+1})`,page}:target?.photoId ? {id:target.photoId,page} : target?.group==='Portrait' ? {selector:'.about-image img',page} : target?.group==='Cover image' ? {selector:'.hero-bg',page} : null;
  dialog.classList.toggle('photo-editor',!!target?.photoId||['Cover image','Portrait'].includes(target?.group));
  dialog.classList.toggle('gallery-editor',!!((['portfolio','digitals'].includes(section)||target?.gallery)&&!target?.photoId));
  const textTitles={'Name':'Edit name','Profile':'Edit name & location','Client logos':'Edit client logos','Contact options':'Edit contact options','Your calendar':'Edit calendar','Videos':'Edit videos','Motion stills':'Edit motion stills','Role & tagline':'Edit name & tagline','Measurements':'Measurement visibility','Introduction':'Edit introduction','Invitation':'Edit invitation','Footer wording':'Edit footer','Your story':'Edit biography','Agency details':'Agency visibility','Closing invitation':'Edit invitation','Booking page wording':'Edit headline & wording'};
  const textTitle=target&&!target.photoId?textTitles[target.label||target.group]:null;
  dialog.classList.toggle('text-editor',!!textTitle);
  dialog.classList.toggle('comp-card-editor',section==='compCard');
  const option=pageSections[page].find(entry=>entry[2]===section&&JSON.stringify(entry[3])===JSON.stringify(target))||pageSections[page].find(entry=>entry[2]===section);
  $('section').value=option?.[0]||'';
  $('editor-title').textContent=dialog.classList.contains('photo-editor')?'Edit photo':dialog.classList.contains('gallery-editor')?(target?.gallery==='motion'?'Arrange motion':'Arrange photos'):textTitle||`Edit · ${option?.[1]||section}`;
  if(!dialog.open)dialog.show();
  if(target?.returnMenu||editorReturnGallery)target={...target,returnMenu:undefined,returnGallery:undefined,fromGallery:!!editorReturnGallery};
  api.choose(section,target);
  fit();
  $('close').focus({preventScroll:true});
}
function returnToSectionMenu() {
  if(editorReturnGallery){
    const previous=editorReturnGallery;
    openEditor(previous.section,previous.target,lastTrigger);
    api.restoreGalleryPosition(previous.scrollY,previous.photoId);
    return;
  }
  if(!editorReturnMenu)return;
  dialog.classList.remove('photo-editor','gallery-editor','text-editor','comp-card-editor');
  controls.hidden=true;$('editor-menu').hidden=false;$('editor-back').hidden=true;
  $('editor-title').textContent=editorMenuTitle;fit();
}
document.getElementById('editor-back').addEventListener('click',returnToSectionMenu);
function loadPage(next,anchor='') {
  inlineBiography.finish(true);
  page=next;$('page').value=next;pendingAnchor=anchor;updateSections();
  frame.src=`../${next==='home'?'index':next}.html?studio-preview=visual-v2`;
}
function syncStatus() {
  if(!api?.ready)return;
  const draftStatus=visualDraftStatus(api);
  for(const id of ['status','mobile-status','editor-status']) {
    $(id).textContent=tourView?'Exploring · your live website stays unchanged':draftStatus.text;
    $(id).dataset.state=draftStatus.state;
  }
  $('save').disabled=!api.canSave||!api.dirty||api.status.state==='busy';
  $('editor-save').disabled=$('save').disabled;
  $('publish').disabled=Boolean(tourView)||!api.connected||!api.needsPublish||api.status.state==='busy';
  $('publish').textContent=api.connected&&api.needsPublish?'Publish changes':'Publish';
  $('publish').classList.toggle('trial-publish',!api.connected);
  $('undo').disabled=Boolean(tourView)||!api.canUndo||api.status.state==='busy';$('redo').disabled=Boolean(tourView)||!api.canRedo||api.status.state==='busy';
  $('editor-undo').disabled=$('undo').disabled;$('editor-redo').disabled=$('redo').disabled;
  clearTimeout(syncStatus.previewTimer);
  if (!tourView) syncStatus.previewTimer=setTimeout(refresh,180);
}
function chip(parent,label,section,target,extra='') {
  if(!parent)return;
  parent.classList.add('visual-region');
  let mount=parent;
  if(extra.includes('visual-section-chip')){
    parent.classList.add('visual-section-heading');
    mount=parent.querySelector(':scope > .visual-section-actions');
    if(!mount){mount=parent.ownerDocument.createElement('div');mount.className='visual-section-actions';parent.append(mount);}
  }
  const button=parent.ownerDocument.createElement('button');
  button.type='button';button.textContent=label;button.className=`visual-control visual-chip ${extra}`;
  button.dataset.visualSection=section;
  if(target)button.visualTarget=target;
  mount.append(button);return button;
}
function photo(image,section,target,dragGroup) {
  if(!image||image.style.display==='none'||image.hidden)return;
  image.dataset.visualSection=section;image.visualTarget=target;
  if(target?.photoId)image.dataset.visualPhotoId=target.photoId;
  const button=chip(image.parentElement,'Edit photo',section,target,'visual-photo-chip');
  button.setAttribute('aria-label','Edit photo');button.title='Edit photo';
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg>';
  button.photoElement=image;
  image.classList.add('visual-selectable-photo');
  image.tabIndex=0;image.setAttribute('aria-label','Select photo to show editing tools');
  image.addEventListener('keydown',event=>{if(editing&&['Enter',' '].includes(event.key)){event.preventDefault();revealPhotoTools(image);}});
  image.addEventListener('load',positionPhotoLabels,{once:true});
  if(dragGroup){
    image.dataset.dragGroup=dragGroup;
    const handle=chip(image.parentElement,'⠿',section,null,'visual-drag-chip');
    handle.removeAttribute('data-visual-section');handle.setAttribute('aria-label','Drag photo to rearrange');
    button.dragButton=handle;
    handle.photoElement=image;
    enableDirectDrag(handle,image,dragGroup,target.photoId);
  }
}
function revealPhotoTools(image) {
  const doc=image?.ownerDocument||frame.contentDocument;
  doc?.querySelectorAll('.visual-tool-visible').forEach(node=>node.classList.remove('visual-tool-visible'));
  doc?.querySelectorAll('.visual-photo-chip,.visual-drag-chip').forEach(button=>{
    if(button.photoElement===image)button.classList.add('visual-tool-visible');
  });
}
function sectionControl(parent,section,target,name,opening=false,label='Edit section') {
  if(!parent)return;
  const row=parent.ownerDocument.createElement('div');row.className='visual-section-toolbar'+(opening?' visual-opening-toolbar':'');
  parent.prepend(row);
  const button=chip(row,label,section,target,'visual-section-button');
  const accessibleLabel=label==='Edit section'?'Edit '+name:label;
  button.setAttribute('aria-label',accessibleLabel);
  button.title=accessibleLabel;
}
function attachControls(doc) {
  doc.querySelectorAll('.visual-control').forEach(node=>node.remove());
  doc.querySelectorAll('.visual-section-toolbar,.visual-section-actions').forEach(node=>node.remove());
  doc.querySelectorAll('.visual-section-heading').forEach(node=>node.classList.remove('visual-section-heading'));
  doc.querySelectorAll('[data-visual-section]').forEach(node=>delete node.dataset.visualSection);
  if(page==='home') {
    sectionControl(doc.querySelector('#hero'),'home',{group:'Cover image'},'cover photo',true,'Edit cover photo');

    sectionControl(doc.querySelector('#selected-clients'),'home',{group:'Client logos'},'client logos',false,'Manage logos');
    sectionControl(doc.querySelector('#measurements'),'identity',{menu:[{label:'Measurement visibility',section:'identity',target:{group:'Measurements'}},{label:'Comp card',section:'compCard'}]},'measurements & comp card',false,'Measurements & comp card');
    sectionControl(doc.querySelector('#highlights .home-section-heading'),'home',{gallery:'selectedWork'},'Selected work',false,'Manage photos');
    doc.querySelectorAll('.story-grid .story-frame img').forEach((image,i)=>photo(image,'home',{photoId:api.content.home.selectedWork[i]?.id},'selectedWork'));
    doc.querySelectorAll('.work-chapter').forEach((chapter,i)=>{
      const data=api.content.home.portfolioChapters[i];if(!data)return;
      sectionControl(chapter.querySelector('.chapter-heading'),'portfolio',{chapterId:data.id},data.title.en,false,'Manage photos');
      chapter.querySelectorAll('.chapter-images img').forEach((image,j)=>photo(image,'portfolio',{photoId:data.photos[j]},`portfolio:${data.id}`));
    });
    sectionControl(doc.querySelector('#motion .motion-heading'),'motion',{menu:sectionMenus.motion},'Motion',false,'Manage videos & stills');
    doc.querySelectorAll('.motion-video-grid .video-item').forEach((item,i)=>{
      const video=api.content.home.motion[i];if(!video)return;
      const id=video.id||`wistia:${video.mediaId}`;item.dataset.dragGroup='motion';item.dataset.dragId=id;
      const handle=chip(item,'⠿','motion',null,'visual-drag-chip');handle.removeAttribute('data-visual-section');handle.style.left='auto';handle.style.right='12px';
      handle.photoElement=item;
      handle.setAttribute('aria-label',`Drag video ${i+1} to rearrange`);enableDirectDrag(handle,item,'motion',id);
    });
    doc.querySelectorAll('.motion-stills img').forEach((image,i)=>photo(image,'motion',{photoId:api.content.home.motionStills[i],stillIndex:i},'motionStills'));
    sectionControl(doc.querySelector('.digitals-heading'),'digitals',null,'Digitals',false,'Manage digitals');
    doc.querySelectorAll('.digitals-grid img').forEach((image,i)=>photo(image,'digitals',{photoId:api.content.home.digitals[i]?.id},'digitals'));
  }
  if(page==='about') {
    photo(doc.querySelector('.about-image img'),'about',{group:'Portrait'});
    sectionControl(doc.querySelector('.about-practice'),'about',{group:'Agency details'},'agency visibility',false,'Agency visibility');

    sectionControl(doc.querySelector('.about-clients'),'home',{group:'Client logos'},'client logos',false,'Manage logos');

  }
  if(page==='booking') {
    sectionControl(doc.querySelector('.calendar-frame'),'booking',{group:'Your calendar'},'calendar',false,'Calendar settings');
    sectionControl(doc.querySelector('.direct-inquiries'),'booking',{group:'Contact options'},'contact',false,'Contact settings');
  }
  positionPhotoLabels();
}
async function refresh() {
  if (inlineBiography.active) return;
  if(updating){updateAgain=true;return new Promise(resolve=>refreshWaiters.push(resolve));}
  const doc=frame.contentDocument;
  if(!api?.ready||!doc?.querySelector(page==='home'?'.home-hero':page==='about'?'.about-opening':'.booking-opening'))return;
  updating=true;
  const renderingPage=page;
  try {
    await api.applyTo(doc,renderingPage);
    if(doc===frame.contentDocument && renderingPage===page) {
      attachControls(doc);
      if (renderingPage === 'home') {
        inlineBiography.attach(doc);
        doc.querySelectorAll('.story-grid .story-frame').forEach((figure, index) => {
          const photo = api.content.home.selectedWork[index];
          if (!photo) return;
          for (const lang of ['en', 'th']) {
            inlineBiography.attachText(figure.querySelector(`figcaption > [lang="${lang}"]`), {
              lang, label: 'photo caption', apply: value => api.updateSelectedWorkCaption(photo.id, lang, value),
            });
          }
        });
        doc.querySelectorAll('.info-strip > div').forEach((row, index) => {
          const key = Object.keys(MEASUREMENT_FIELDS)[index];
          const item = api.content.identity.measurements[key];
          if (!item) return;
          if (typeof item.value === 'object') {
            for (const lang of ['en', 'th']) inlineBiography.attachText(row.querySelector(`b > [lang="${lang}"]`), {
              lang, label: `${key} value`, apply: value => api.updateMeasurement(key, lang, value),
            });
          } else inlineBiography.attachText(row.querySelector('b'), {
            lang: 'en', label: `${key} value`, apply: value => api.updateMeasurement(key, 'en', value),
          });
        });
        doc.querySelectorAll('.work-chapter').forEach((chapter, index) => {
          const data = api.content.home.portfolioChapters[index];
          if (!data) return;
          for (const lang of ['en', 'th']) inlineBiography.attachText(chapter.querySelector(`.chapter-heading h3 > [lang="${lang}"]`), {
            lang, label: 'chapter name', apply: value => api.updateChapterTitle(data.id, lang, value),
          });
        });
        const names = doc.querySelectorAll('.hero-content h1 > span');
        inlineBiography.attachText(names[0], { lang: 'en', label: 'first name', apply: value => api.updateAboutText('firstName', 'en', value) });
        inlineBiography.attachText(names[1], { lang: 'en', label: 'surname', apply: value => api.updateAboutText('surname', 'en', value) });
        for (const lang of ['en', 'th']) {
          inlineBiography.attachText(doc.querySelector(`.manifesto-lead > [lang="${lang}"]`), {
            lang, label: 'introduction heading', apply: value => api.updateHomeIntroduction('lead', lang, value),
          });
          inlineBiography.attachText(doc.querySelector(`.manifesto-detail p[lang="${lang}"]`), {
            lang, label: 'introduction description', apply: value => api.updateHomeIntroduction('body', lang, value),
          });
          inlineBiography.attachText(doc.querySelector(`.availability-copy > p > [lang="${lang}"]`), {
            lang, label: 'availability description', apply: value => api.updateHomeAvailability(lang, value),
          });
          for (const key of ['role', 'tagline']) {
            inlineBiography.attachText(doc.querySelector(`.hero-${key} > [lang="${lang}"]`), {
              lang, label: key, apply: value => api.updateIdentityText(key, lang, value),
            });
          }
          for (const [key, field] of Object.entries(HOME_TEXT_FIELDS)) {
            inlineBiography.attachText(doc.querySelector(`${field.selector} > [lang="${lang}"]`), {
              lang, label: field.label, apply: value => api.updateHomeLabel(key, lang, value),
            });
          }
        }
      }
      if (renderingPage === 'about') {
        inlineBiography.attach(doc);
        for (const lang of ['en', 'th']) {
          for (const [key, field] of Object.entries(ABOUT_TEXT_FIELDS)) {
            inlineBiography.attachText(doc.querySelector(`${field.selector} > [lang="${lang}"]`), {
              lang, label: field.label, apply: value => api.updateAboutLabel(key, lang, value),
            });
          }
          const part = doc.querySelector(`.about-opening h1 > [lang="${lang}"]`);
          if (part) {
            let first = part.querySelector('.inline-name-first');
            if (!first) {
              const text = [...part.childNodes].find(node => node.nodeType === 3);
              if (text) {
                first = doc.createElement('span'); first.className = 'inline-name-first';
                first.textContent = text.textContent; text.replaceWith(first);
              }
            }
            inlineBiography.attachText(first, { lang, label: 'first name', apply: value => api.updateAboutText('firstName', lang, value) });
            inlineBiography.attachText(part.querySelector('em'), { lang, label: 'surname', apply: value => api.updateAboutText('surname', lang, value) });
          }
          inlineBiography.attachText(doc.querySelector(`.about-closing .closing-statement > [lang="${lang}"]`), {
            lang, label: 'closing invitation', apply: value => api.updateAboutText('closing', lang, value),
          });
          inlineBiography.attachText(doc.querySelector(`.practice-copy a > [lang="${lang}"]`), {
            lang, label: 'link wording', apply: value => api.updateAboutText('agencyLinkLabel', lang, value),
          });
          inlineBiography.attachText(doc.querySelector(`.practice-copy p[lang="${lang}"]`), {
            lang, label: 'agency description', apply: value => api.updateAboutText('agencyDescription', lang, value),
          });
          inlineBiography.attachText(doc.querySelector(`.portrait-intro > [lang="${lang}"]`), {
            lang, label: 'introduction', apply: value => api.updateAboutText('intro', lang, value),
          });
        }
        inlineBiography.attachText(doc.querySelector('.about-image figcaption span:first-child'), {
          lang: 'en', label: 'portrait name', apply: value => api.updateAboutText('identityName', 'en', value),
        });
        inlineBiography.attachText(doc.querySelector('.about-image figcaption span:last-child'), {
          lang: 'en', label: 'portrait caption', apply: value => api.updateAboutText('portraitCaption', 'en', value),
        });
        inlineBiography.attachText(doc.querySelector('.practice-copy h2'), {
          lang: 'en', label: 'agency name', apply: value => api.updateAboutText('agencyName', 'en', value),
        });
        const agencyLink = doc.querySelector('.practice-copy a');
        if (agencyLink) {
          let control = doc.querySelector('.inline-agency-link');
          if (!control) {
            control = doc.createElement('div'); control.className = 'inline-agency-link';
            control.setAttribute('role', 'button'); control.textContent = 'Edit link';
            agencyLink.after(control);
          }
          inlineBiography.attachText(control, {
            lang: 'en', label: 'agency link', input: true, display: 'Edit link',
            value: agencyLink.getAttribute('href') || '', apply: value => api.updateAboutText('agencyUrl', 'en', value),
          });
        }
      }
      if (renderingPage === 'booking') {
        inlineBiography.attach(doc);
        for (const lang of ['en', 'th']) {
          for (const [key, field] of Object.entries(BOOKING_TEXT_FIELDS)) {
            inlineBiography.attachText(doc.querySelector(`${field.selector} > [lang="${lang}"]`), {
              lang, label: field.label, apply: value => api.updateBookingLabel(key, lang, value),
            });
          }
          for (const [key, selector, label] of [
            ['headline', '.booking-opening h1 > [lang]', 'booking headline'],
            ['intro', '.booking-intro p[lang]', 'booking introduction'],
            ['note', '.booking-intro > span > [lang]', 'rates note'],
            ['calendarIntro', '.calendar-heading p:not(.subpage-index) > [lang]', 'calendar instruction'],
            ['contactIntro', '.inquiry-copy > p > [lang]', 'contact introduction'],
          ]) {
            inlineBiography.attachText(doc.querySelector(selector.replace('[lang]', `[lang="${lang}"]`)), {
              lang, label, apply: value => api.updateBookingText(key, lang, value),
            });
          }
          inlineBiography.attachText(doc.querySelector(`.booking-opening .subpage-kicker > [lang="${lang}"]`), {
            lang, label: 'booking location', apply: value => api.updateIdentityText('location', lang, value),
          });
        }
        for (const key of ['email', 'line', 'whatsapp', 'instagram']) {
          const link = doc.querySelector(`.inquiry-links [data-contact="${key}"]`);
          const item = api.content.booking.contact[key];
          if (!link || !item) continue;
          let control = doc.querySelector(`[data-contact-editor="${key}"]`);
          if (!control) {
            control = doc.createElement('div'); control.className = 'inline-contact-link';
            control.dataset.contactEditor = key;
            control.setAttribute('role', 'button'); control.textContent = 'Edit link'; link.after(control);
          }
          control.hidden = item.visible === false;
          inlineBiography.attachText(control, {
            lang: 'en', label: `${key} contact link`, input: true,
            inputType: key === 'email' ? 'email' : 'url', inputLabel: `${key} destination`,
            pattern: key === 'email' ? undefined : 'https://.+', display: 'Edit link',
            value: item.value, apply: value => api.updateBookingContact(key, value),
          });
        }
      }
      inlineBiography.attach(doc);
      for (const lang of ['en', 'th']) {
        inlineBiography.attachText(doc.querySelector(`footer [data-footer-description][lang="${lang}"]`), {
          lang, label: 'footer description', apply: value => api.updateFooterText('description', lang, value),
        });
        for (const [key, field] of Object.entries(FOOTER_TEXT_FIELDS)) {
          inlineBiography.attachText(doc.querySelector(`footer [data-footer-text="${key}"] > [lang="${lang}"]`), {
            lang, label: field.label, apply: value => api.updateFooterText(key, lang, value),
          });
        }
      }
      const footerEmail = doc.querySelector('footer [data-footer-link="email"]');
      inlineBiography.attachText(footerEmail, {
        lang: 'en', label: 'footer email', apply: value => api.updateFooterLink('email', value),
      });
      for (const key of ['email', 'instagram', 'agency']) {
        const link = doc.querySelector(`footer [data-footer-link="${key}"]`);
        if (!link) continue;
        let row = link.parentElement;
        if (!row.classList.contains('inline-footer-row')) {
          row = doc.createElement('div'); row.className = 'inline-footer-row';
          link.before(row); row.append(link);
        }
        let control = row.querySelector('.inline-footer-link');
        if (!control) {
          control = doc.createElement('div'); control.className = 'inline-footer-link';
          control.setAttribute('role', 'button'); control.textContent = 'Edit link'; row.append(control);
        }
        control.hidden = link.hidden;
        inlineBiography.attachText(control, {
          lang: 'en', label: `footer ${key} link`, input: true,
          inputType: key === 'email' ? 'email' : 'url', inputLabel: `Footer ${key} destination`,
          pattern: key === 'email' ? undefined : 'https?://.+', display: 'Edit link',
          value: footerLinkValue(api.content, key), apply: value => api.updateFooterLink(key, value),
        });
      }
      if(pendingAnchor){doc.querySelector(pendingAnchor)?.scrollIntoView({block:'start',behavior:'instant'});pendingAnchor='';}
    }
  } catch(error){notify(`Preview could not update: ${error.message}`);}
  finally {
    updating=false;
    if(updateAgain){updateAgain=false;await refresh();}
    const waiting=refreshWaiters;refreshWaiters=[];waiting.forEach(resolve=>resolve());
  }
}
function connect() {
  const bridge=controls.contentWindow.visualStudio;if(!bridge)return;
  api=bridge;if(api.opening)return;
  if(!api.ready){
    studioTour.close();
    $('account-gate').hidden=false;$('workspace').hidden=true;
    document.body.classList.add('signed-out');dialog.close();frame.src='about:blank';
    $('account-title').textContent=api.backendConfigured?'Sign in to your Studio':'Studio connection unavailable';
    $('account-form').hidden=!api.backendConfigured||localTrial;
    $('account-status').textContent=api.status.state==='error'?api.status.text:'';
    return;
  }
  document.body.classList.remove('signed-out');
  $('account-gate').hidden=true;$('workspace').hidden=false;
  $('account-form').reset();
  $('workspace-mode').textContent=api.connected?'Online draft':'Local trial';
  $('sign-out').hidden=!api.connected;
  syncStatus();loadPage('home');fit();
  studioTour.maybeStart();
  controls.contentDocument.addEventListener('keydown',event=>{if(event.key==='Escape')dialog.close();});
}
$('account-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');
  button.disabled=true;$('account-status').textContent='Signing in…';
  try{await api.signIn(form.elements.email.value.trim(),form.elements.password.value);form.elements.password.value='';}
  catch(error){$('account-status').textContent=error.message;}
  finally{button.disabled=false;}
});
$('sign-out').onclick=()=>{dialog.close();if(api.signOut()){$('sign-out').hidden=true;$('account-status').textContent='Signed out.';}};
window.addEventListener('visual-studio-ready',connect);
window.addEventListener('visual-studio-change',syncStatus);
window.addEventListener('visual-studio-close',()=>editorReturnGallery?returnToSectionMenu():dialog.close());
window.addEventListener('visual-studio-arrange',()=>{
  dialog.classList.remove('photo-editor');dialog.classList.add('gallery-editor');$('editor-title').textContent='Arrange photos';fit();
});
window.addEventListener('visual-studio-photo',event=>{
  const previous={section:event.detail.section,target:{...event.detail.galleryTarget,returnMenu:editorReturnMenu},scrollY:event.detail.scrollY,photoId:event.detail.photoId};
  openEditor(event.detail.section,{photoId:event.detail.photoId,returnGallery:previous},lastTrigger);
});
controls.addEventListener('load',connect);
frame.addEventListener('load',()=>{
  const doc=frame.contentDocument;if(!doc?.body)return;
  doc.querySelector('#splash-screen')?.remove();doc.documentElement.classList.remove('scroll-locked');
  doc.documentElement.style.overflow='';doc.body.style.overflow='';doc.body.classList.add('hero-loaded');
  doc.querySelector('#hero')?.classList.add('loaded');doc.querySelectorAll('.reveal').forEach(node=>node.classList.add('active'));
  doc.documentElement.classList.toggle('visual-edit',editing);
  const style=doc.createElement('style');
  style.textContent=`html{scroll-padding-top:100px}.cursor-dot,.cursor-outline{display:none!important}*,*::before,*::after{cursor:auto!important}a,button,[data-visual-section]{cursor:pointer!important}.visual-edit .reveal{opacity:1!important;filter:none!important;transform:none!important;transition:none!important}.visual-region{position:relative}.visual-control{display:none!important;z-index:30;font:500 13px/1.2 Arial,sans-serif!important;letter-spacing:0!important;text-transform:none!important;cursor:pointer!important;min-height:44px;background:#faf5ec!important;color:#463724!important;border:1px solid #b99b79!important;border-radius:6px;padding:12px 18px;box-shadow:0 2px 8px #0002}.visual-edit .visual-control{display:inline-block!important}.visual-chip{position:absolute;top:12px;left:12px;white-space:nowrap}.visual-cover-chip{top:auto;left:auto;right:24px;bottom:65px}.visual-secondary{left:180px}.visual-opening-chip{top:calc(var(--visual-header-height,68px) + 16px);left:clamp(20px,6vw,96px)}.visual-drag-chip{position:absolute;min-width:44px;padding:10px!important;touch-action:none!important;font-size:22px!important;cursor:grab!important;user-select:none;-webkit-touch-callout:none}.visual-drag-ghost{position:fixed!important;z-index:9999!important;pointer-events:none!important;object-fit:contain;background:#faf8f4;border-radius:8px;box-shadow:0 12px 30px #0004;opacity:.9}.visual-drop-target{outline:2px solid #916a40!important;outline-offset:3px}.visual-drop-marker{position:fixed;z-index:10000;pointer-events:none;background:#916a40;border-radius:3px;box-shadow:0 0 0 2px #faf5ec}.visual-drop-marker[hidden]{display:none}.visual-drop-marker span{position:absolute;left:0;top:10px;padding:7px 10px;background:#463724;color:#fff;font:500 12px/1.2 Arial,sans-serif;white-space:nowrap;border-radius:5px}.visual-drop-marker.vertical span{top:0;left:12px}.visual-drop-marker.vertical.label-left span{left:auto;right:12px}.visual-dragging{user-select:none}.visual-dragging img{-webkit-touch-callout:none}.visual-add{position:relative;margin:24px 0 12px}.visual-edit img[data-visual-section]:hover{outline:2px solid #b99b79;outline-offset:3px}.visual-chip:focus-visible,.visual-add:focus-visible{outline:3px solid #916a40;outline-offset:3px}.visual-edit .chapter-heading,.visual-edit #highlights .home-section-heading,.visual-edit .digitals-heading{min-height:65px}.visual-edit .manifesto-copy>.visual-chip{top:-55px}.visual-edit .hero-content>.visual-chip{top:-55px}.visual-edit .portrait-intro>.visual-chip{top:-55px}@media(max-width:600px){.visual-control{font-size:12px!important;padding:10px 12px}.visual-cover-chip{right:16px;bottom:35px}}`;
  style.textContent+=`.visual-edit .visual-section-heading{display:flex!important;align-items:flex-start;align-content:flex-start;flex-wrap:wrap;gap:8px 16px;min-height:65px;padding-bottom:8px}.visual-edit .visual-section-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:0 0 100%;width:100%;margin-top:auto}.visual-edit .visual-section-actions>.visual-section-chip{position:static;flex:0 0 auto;margin:0;padding:9px 12px;min-height:40px;box-shadow:none;border-radius:6px}.visual-edit .visual-section-actions>.visual-section-chip+.visual-section-chip{margin-left:0}`;
  style.textContent+=`
.visual-edit .visual-section-heading{display:flex!important;align-items:center;flex-wrap:wrap;gap:12px 20px;min-height:44px;padding-right:32px}.visual-edit .visual-section-heading>.visual-section-chip{position:static;margin-left:auto;flex:0 0 auto;padding:10px 14px;box-shadow:none;border-radius:6px}.visual-edit .visual-section-heading>.visual-section-chip~.visual-section-chip{margin-left:0}.visual-photo-chip,.visual-drag-chip{width:44px!important;height:44px!important;min-height:44px!important;padding:10px!important;border-radius:6px!important;box-shadow:0 2px 8px #0001!important}.visual-photo-chip svg{display:block;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}.visual-photo-chip:has(+.visual-drag-chip){border-radius:6px 0 0 6px!important}.visual-photo-chip+.visual-drag-chip{border-radius:0 6px 6px 0!important;border-left:0!important}.visual-add{justify-self:start;min-width:140px;box-shadow:none;border-radius:6px}`;
  doc.head.append(style);
  const previewStyle=doc.createElement('style');
  previewStyle.textContent='.app-transition-curtain{display:none!important}@media(max-width:600px){.visual-cover-chip{top:85px;bottom:auto}}';
  doc.head.append(previewStyle);
  const quietStyle=doc.createElement('style');
  quietStyle.textContent='.visual-section-toolbar{display:none;position:relative;z-index:30;width:100%;flex:0 0 100%;grid-column:1/-1;margin:0 0 16px;padding-right:32px;justify-content:flex-end;gap:8px}.visual-edit .visual-section-toolbar{display:flex}.visual-section-toolbar>.visual-chip{position:static;box-shadow:none;padding:9px 12px;font-size:12px!important}.visual-opening-toolbar{position:absolute;top:calc(var(--visual-header-height,68px) + 16px);right:32px;width:auto;margin:0;padding-right:0}.visual-edit .chapter-heading,.visual-edit #highlights .home-section-heading,.visual-edit .motion-heading,.visual-edit .digitals-heading{display:flex!important;flex-wrap:wrap;align-items:center;gap:8px 20px}.visual-edit .visual-photo-chip,.visual-edit .visual-drag-chip{opacity:0;pointer-events:none;transition:opacity .15s}.visual-edit .visual-tool-visible,.visual-edit .visual-photo-chip:focus-visible,.visual-edit .visual-drag-chip:focus-visible{opacity:1;pointer-events:auto}.visual-selectable-photo:focus-visible{outline:2px solid #916a40;outline-offset:3px}@media(max-width:600px){.visual-opening-toolbar{right:24px;padding-right:0}.visual-section-toolbar{margin-bottom:12px;padding-right:24px}.visual-edit .visual-section-heading{padding-right:24px}}';
  quietStyle.textContent += '.visual-edit .tour-highlight.visual-photo-chip,.visual-edit .tour-highlight.visual-drag-chip{opacity:1;pointer-events:auto}';
  doc.head.append(quietStyle);
  const alignmentStyle=doc.createElement('style');
  alignmentStyle.textContent='.visual-section-button{transform:translateX(var(--visual-section-offset,0px));flex-shrink:0}.visual-section-toolbar{flex-shrink:0}.visual-edit .portrait-intro>.visual-section-toolbar{display:flex;align-items:center;min-height:44px}';
  doc.head.append(alignmentStyle);
  doc.addEventListener('pointerover',event=>{
    if(!editing||event.pointerType==='touch'||doc.documentElement.classList.contains('visual-dragging'))return;
    const tool=event.target.closest('.visual-photo-chip,.visual-drag-chip');
    const photo=event.target.closest('.visual-selectable-photo,.video-item[data-drag-group]');
    revealPhotoTools(tool?.photoElement||photo);
  });
  doc.addEventListener('click',event=>{
    const add=event.target.closest('[data-add-target]'),target=event.target.closest('[data-visual-section]');
    if(editing&&target?.classList.contains('visual-selectable-photo')){
      event.preventDefault();event.stopImmediatePropagation();revealPhotoTools(target);return;
    }
    if(!event.target.closest('.visual-photo-chip,.visual-drag-chip'))revealPhotoTools(null);
    if(editing&&(add||target)) {
      event.preventDefault();event.stopImmediatePropagation();
      if(add){addTarget=add.dataset.addTarget;$('add-files').click();}
      else openEditor(target.dataset.visualSection,target.visualTarget,target);
      return;
    }
    const link=event.target.closest('a');if(!link)return;
    if(editing && event.target.closest('.inline-biography')) { event.preventDefault(); return; }
    const url=new URL(link.href,location.href);
    if(url.origin===location.origin&&/\/(index|about|booking)\.html$|\/$/.test(url.pathname)){
      const next=url.pathname.includes('about')?'about':url.pathname.includes('booking')?'booking':'home';
      if(next!==page){event.preventDefault();event.stopImmediatePropagation();dialog.close();loadPage(next,url.hash);}
    }
    if(url.origin!==location.origin||url.protocol==='mailto:'||url.protocol==='tel:'){
      event.preventDefault();event.stopImmediatePropagation();notify('External links are available on the public website.');
    }
  },true);
  doc.addEventListener('keydown',event=>{if(event.key==='Escape')dialog.close();});
  fit();refresh().then(()=>studioTour.previewLoaded(doc));
});
$('add-files').onchange=async()=>{
  const files=Array.from($('add-files').files);if(!files.length)return;
  $('add-files').disabled=true;notify(`Adding ${files.length===1?'photo':'photos'}…`);
  try{await api.addPhotos(files,addTarget);await refresh();notify(`${files.length} ${files.length===1?'photo added':'photos added'}. Save draft to keep them.`);}
  catch(error){notify(error.message);}
  finally{$('add-files').value='';$('add-files').disabled=false;}
};
$('save').onclick=async()=>{if(!api)return;inlineBiography.finish(true);$('save').disabled=true;if(await api.save())notify(api.connected?'Draft saved online. Website unchanged.':'Draft saved in this browser.');syncStatus();};
$('editor-save').onclick=()=>$('save').click();
$('publish').onclick=async()=>{
  inlineBiography.finish(true);
  if(!api?.connected||!confirm('Publish these changes to Vasilina’s public website?'))return;
  $('publish').disabled=true;
  if(await api.publish())notify('Published. Your website is updated.');
  syncStatus();
};
$('undo').onclick=()=>{inlineBiography.finish(true);api?.undo();};$('redo').onclick=()=>{inlineBiography.finish(true);api?.redo();};
$('editor-undo').onclick=()=>api?.undo();$('editor-redo').onclick=()=>api?.redo();
$('editor-done').onclick=()=>dialog.close();
$('page').onchange=()=>{dialog.close();loadPage($('page').value);};
$('section').onchange=()=>{
  const entry=pageSections[page].find(entry=>entry[0]===$('section').value);if(!entry)return;
  const [, ,section,target,anchor]=entry;
  frame.contentDocument?.querySelector(anchor||sectionAnchor[section])?.scrollIntoView({block:'start'});
  openEditor(section,target);
};
$('close').onclick=()=>dialog.close();
const popupHeading=dialog.querySelector('.editor-heading');
let popupDrag=null;
popupHeading.addEventListener('pointerdown',event=>{
  if(matchMedia('(max-width:900px)').matches||event.target.closest('button')||event.button!==0||!event.isPrimary)return;
  const r=dialog.getBoundingClientRect();popupDrag={id:event.pointerId,x:event.clientX-r.left,y:event.clientY-r.top};
  popupHeading.setPointerCapture(event.pointerId);event.preventDefault();document.body.classList.add('popup-moving');
});
popupHeading.addEventListener('pointermove',event=>{if(popupDrag?.id===event.pointerId)placePopup(event.clientX-popupDrag.x,event.clientY-popupDrag.y);});
const stopPopup=()=>{popupDrag=null;document.body.classList.remove('popup-moving');};
popupHeading.addEventListener('pointerup',stopPopup);popupHeading.addEventListener('pointercancel',stopPopup);popupHeading.addEventListener('lostpointercapture',stopPopup);
const resizeHandle=$('editor-resize');
let popupResize=null;
function sizePopup(width,height,x,y) {
  popupSize={width:Math.max(360,Math.min(width,innerWidth-16)),height:Math.max(300,Math.min(height,innerHeight-16))};
  dialog.style.width=`${popupSize.width}px`;dialog.style.height=`${popupSize.height}px`;
  placePopup(x,y);
}
function restorePopupSize() {
  popupSize=null;dialog.style.width='';dialog.style.height='';
  if(popupPosition)placePopup(popupPosition.x,popupPosition.y);
}
resizeHandle.addEventListener('pointerdown',event=>{
  if(matchMedia('(max-width:900px)').matches||event.button!==0||!event.isPrimary)return;
  const r=dialog.getBoundingClientRect();
  popupResize={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:r.left,y:r.top,width:r.width,height:r.height};
  resizeHandle.setPointerCapture(event.pointerId);event.preventDefault();document.body.classList.add('popup-moving');
});
resizeHandle.addEventListener('pointermove',event=>{
  if(popupResize?.id!==event.pointerId)return;
  sizePopup(popupResize.width+event.clientX-popupResize.startX,popupResize.height+event.clientY-popupResize.startY,popupResize.x,popupResize.y);
});
const stopResize=()=>{popupResize=null;document.body.classList.remove('popup-moving');};
resizeHandle.addEventListener('pointerup',stopResize);resizeHandle.addEventListener('pointercancel',stopResize);resizeHandle.addEventListener('lostpointercapture',stopResize);
resizeHandle.addEventListener('dblclick',restorePopupSize);
resizeHandle.addEventListener('keydown',event=>{
  if(event.key==='Home'){event.preventDefault();restorePopupSize();return;}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const r=dialog.getBoundingClientRect(),step=event.shiftKey?40:10;
  sizePopup(r.width+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),r.height+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0),r.left,r.top);
});
dialog.addEventListener('close',()=>{
  const image=returnPhoto?.page===page ? returnPhoto.selector ? frame.contentDocument.querySelector(returnPhoto.selector) : [...frame.contentDocument.querySelectorAll('[data-visual-photo-id]')].find(node=>node.dataset.visualPhotoId===returnPhoto.id&&node.style.display!=='none') : null;
  if(image&&matchMedia('(max-width:900px)').matches)image.scrollIntoView({block:'center',behavior:'instant'});
  if(!image&&returnRegion?.isConnected) {
    returnRegion.scrollIntoView({block:'center',behavior:'instant'});
    const replacement=returnRegion.querySelector('.visual-chip');
    replacement?.focus({preventScroll:true});
  }
  const chip=image ? [...frame.contentDocument.querySelectorAll('.visual-photo-chip')].find(node=>node.photoElement===image) : null;
  (chip||lastTrigger)?.isConnected&&(chip||lastTrigger).focus({preventScroll:true});
  returnPhoto=null;
  returnRegion=null;
  $('section').value='';
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')dialog.close();});
for(const name of ['desktop','mobile'])$(name).onclick=()=>{device=name;fit();};
for(const mode of ['edit','view'])$(mode).onclick=()=>{
  inlineBiography.finish(true);
  editing=mode==='edit';$('edit').setAttribute('aria-pressed',String(editing));$('view').setAttribute('aria-pressed',String(!editing));
  $('section').disabled=!editing;frame.contentDocument?.documentElement.classList.toggle('visual-edit',editing);
  if(!editing)dialog.close();
  fit();
};
window.addEventListener('resize',fit);
window.visualViewport?.addEventListener('resize',fit);
window.addEventListener('beforeunload',event=>{if(api?.dirty||inlineBiography.dirty){event.preventDefault();event.returnValue='';}});
document.body.classList.add('signed-out');
controls.src=localTrial?'./?visual-local=1&v=controls-35':'./?visual-connected=1&v=controls-35';
updateSections();connect();fit();
