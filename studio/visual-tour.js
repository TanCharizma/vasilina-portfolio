export function createStudioTour({ ready, beforeStart, prepareStep, finishPractice, photoOrder, switchPhotos, restorePractice, hasUnsavedChanges, mobileGuideSpace, localTrial }) {
  const $ = id => document.getElementById(id), tour = $('studio-tour');
  const seenKey = `folio-lab-vasilina-tour-v2-${localTrial ? 'trial' : 'online'}`;
  const svgNS = 'http://www.w3.org/2000/svg', shade = document.createElementNS(svgNS, 'svg');
  shade.classList.add('tour-shade'); shade.setAttribute('aria-hidden', 'true');
  shade.innerHTML = '<defs><marker id="tour-pointer" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="none" stroke="#bd935c" stroke-width="1.4"/></marker></defs><g class="tour-outlines"/>';
  shade.setAttribute('hidden', ''); document.body.append(shade);
  const alternative = document.createElement('button');
  alternative.type = 'button'; alternative.id = 'tour-alternative'; $('tour-copy').after(alternative);
  let running = false, dismissed = false, preparing = false, phase = 'welcome', generation = 0;
  let previousFocus, originalOrder, targets = {}, listeners = [], keeping = false;
  const boundDocuments = new Set();
  function boxFor(element) {
    const box = element.getBoundingClientRect(), ownerFrame = element.ownerDocument.defaultView.frameElement;
    if (!ownerFrame) return box;
    const frameBox = ownerFrame.getBoundingClientRect(), scale = frameBox.width / ownerFrame.offsetWidth;
    return { left:frameBox.left+box.left*scale, top:frameBox.top+box.top*scale,
      bottom:frameBox.top+box.bottom*scale, width:box.width*scale, height:box.height*scale };
  }
  function position() {
    if (!tour.open) return;
    const viewport = window.visualViewport, width=viewport?.width || innerWidth, height=viewport?.height || innerHeight;
    const top=viewport?.offsetTop || 0, left=viewport?.offsetLeft || 0, mobile=width<=900;
    tour.style.setProperty('--tour-max-height',`${Math.max(80,Math.min(300,height*.4))}px`);
    mobileGuideSpace(mobile?tour.offsetHeight+8:0);
    let x=mobile?16:width-tour.offsetWidth-48, y=height-tour.offsetHeight-24;
    if(mobile) {
      x=12;y=document.querySelector('.toolbar').getBoundingClientRect().bottom-top;
    }
    if (phase==='arrange' && targets.handle && !mobile) {
      const box=boxFor(targets.handle); x=box.left+box.width+24-left; y=box.top+box.height/2-tour.offsetHeight/2-top;
    }
    const voiceAnchor=phase==='voice'?(document.body.classList.contains('inline-editing')?document.querySelector('.inline-edit-done'):targets.text):null;
    if (voiceAnchor && !mobile) {
      const box=boxFor(voiceAnchor),gap=20;
      if(!mobile&&box.left+box.width+gap+tour.offsetWidth<=left+width-16) {
        x=box.left+box.width+gap-left;y=box.top+box.height/2-tour.offsetHeight/2-top;
      } else {
        x=box.left+box.width/2-tour.offsetWidth/2-left;
        const above=box.top-top-tour.offsetHeight-gap;
        y=above>=16?above:box.bottom-top+gap;
      }
    }
    if(phase==='share'&&targets.buttons?.length) {
      if(!mobile){y=boxFor(targets.buttons[0]).bottom-top+20;}
    }
    tour.style.left=`${left+Math.max(16,Math.min(x,width-tour.offsetWidth-16))}px`;
    tour.style.top=`${top+Math.max(16,Math.min(y,height-tour.offsetHeight-16))}px`;
    shade.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    const outlines=shade.querySelector('.tour-outlines');outlines.replaceChildren();
    if (!['arrange','voice','preview','share'].includes(phase)) return;
    const highlighted=['preview','share'].includes(phase)?(targets.buttons||[]).map(button=>[button,'button']):phase==='voice'?[[voiceAnchor,'handle']]:[[targets.handle,'handle'],[targets.destination,'destination']];
    for (const [element,kind] of highlighted) {
      if (!element?.isConnected) continue;
      const box=boxFor(element),rect=document.createElementNS(svgNS,'rect');
      for (const [name,value] of Object.entries({x:box.left-5,y:box.top-5,width:box.width+10,height:box.height+10,rx:kind==='handle'?5:0}))rect.setAttribute(name,value);
      rect.setAttribute('fill','none');rect.setAttribute('stroke','#bd935c');rect.setAttribute('stroke-width',kind==='handle'?'3':'2');
      if(kind==='destination')rect.setAttribute('stroke-dasharray','6 5');
      rect.classList.add(`tour-${kind}-outline`);outlines.append(rect);
    }
    const anchor=phase==='voice'?voiceAnchor:targets.handle;
    if (anchor && !mobile) {
      const box=boxFor(anchor),card=tour.getBoundingClientRect(),pointer=document.createElementNS(svgNS,'line');
      const beside=card.left>=box.left+box.width;
      const above=card.bottom<=box.top;
      const pointerX=Math.min(card.right-12,Math.max(card.left+12,box.left+box.width/2));
      const from=beside?[card.left-2,Math.max(card.top+12,Math.min(box.top+box.height/2,card.bottom-12))]:[pointerX,above?card.bottom+2:card.top-2];
      const to=beside?[box.left+box.width+7,box.top+box.height/2]:[box.left+box.width/2,above?box.top-7:box.bottom+7];
      for(const [name,value] of Object.entries({x1:from[0],y1:from[1],x2:to[0],y2:to[1],stroke:'#bd935c','stroke-width':2,'marker-end':'url(#tour-pointer)'}))pointer.setAttribute(name,value);
      outlines.append(pointer);
    }
  }
  function listen(target,event,handler,capture=false) {
    target.addEventListener(event,handler,capture);listeners.push(()=>target.removeEventListener(event,handler,capture));
  }
  function clearStep() {
    listeners.forEach(remove=>remove());listeners=[];boundDocuments.clear();
    targets.handle?.classList.remove('tour-highlight'); targets.doc?.documentElement.classList.remove('tour-arranging');
    tour.classList.remove('tour-drag-active');targets={};
  }
  function gate(event) {
    if(phase==='preview' && event.target.ownerDocument===targets.doc) {
      if(event.type==='keydown'&&event.key==='Escape'&&!targets.doc.querySelector('.show-modal,.nav-open')) {
        event.preventDefault();event.stopImmediatePropagation();tour.close();
      }
      return;
    }
    if(event.type==='keydown'&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();tour.close();return;}
    if(event.type==='keydown'&&event.key==='Tab') {
      const actions=phase==='voice'?[...document.querySelectorAll('.inline-edit-actions button')]:[];
      const stops=[targets.handle,phase==='voice'?targets.text:null,...actions,...(phase==='preview'?[...(targets.buttons||[]),targets.page,targets.tools]:[]),$('tour-skip'),alternative,$('tour-back'),$('tour-next')].filter(node=>node&&!node.disabled&&node.getClientRects().length);
      const current=stops.indexOf(event.target),direction=event.shiftKey?-1:1;
      const next=current<0?(event.shiftKey?stops.length-1:0):(current+direction+stops.length)%stops.length;
      event.preventDefault();event.stopImmediatePropagation();stops[next]?.focus({preventScroll:true});return;
    }
    if(tour.contains(event.target))return;
    if(event.type==='pointerdown'&&event.target.ownerDocument===targets.doc)return;
    if(phase==='arrange' && (event.target===targets.handle || targets.handle?.contains(event.target)))return;
    if(phase==='voice'&&(targets.text?.contains(event.target)||event.target.closest?.('.inline-edit-actions')))return;
    if(phase==='preview') {
      if(targets.buttons?.includes(event.target)||event.target===targets.page||event.target===targets.tools)return;
    }
    event.preventDefault();event.stopImmediatePropagation();
  }
  function compactPreview() {
    tour.classList.add('tour-preview-compact');alternative.textContent='Show guide';position();
  }
  function bindDocument(doc) {
    if(!doc||boundDocuments.has(doc))return;
    boundDocuments.add(doc);
    for(const event of ['pointerdown','click','keydown','change'])listen(doc.defaultView,event,gate,true);
    listen(doc.defaultView,'scroll',position,true);
    if(phase==='preview'&&doc!==document)listen(doc,'click',compactPreview);
  }
  async function show(phaseName) {
    const token=++generation; clearStep();phase=phaseName;preparing=true;
    tour.className=`tour-experience tour-${phase} tour-preparing`;
    $('tour-progress').textContent=phase==='welcome'?'FOLIO LAB / YOUR STUDIO':phase==='arrange'?'MAKE IT YOURS':'YOUR POINT OF VIEW';
    $('tour-skip').textContent=phase==='welcome'?'I’ll explore myself':'Finish exploring';
    $('tour-back').hidden=phase!=='result';$('tour-back').textContent='Keep original order';
    alternative.hidden=phase!=='arrange';alternative.textContent='Switch their order for me';
    $('tour-next').disabled=true;$('tour-next').hidden=false;
    $('tour-title').textContent=phase==='welcome'?'Welcome to your Studio.':phase==='arrange'?'Which photograph should lead?':'A different opening. Still you.';
    $('tour-copy').textContent=phase==='welcome'?'Your work. Your name. A space to make your own. Let’s try one small change together.':phase==='arrange'?'Drag this photo by the dots onto the next one. Watch your story take a different shape.':'Take a moment to see how it feels. Keep this arrangement to save later, or keep your original order.';
    $('tour-next').textContent=phase==='welcome'?'Let’s explore':phase==='arrange'?'I like this order':'Keep this arrangement';
    if(phase==='arrange' && matchMedia('(max-width:900px)').matches) {
      $('tour-title').textContent='Choose your opening.';
      $('tour-copy').textContent='Drag by the dots onto the next photo to try a new order.';
      alternative.textContent='Switch them for me';
    }
    if(phase==='voice') {
      $('tour-progress').textContent='FIND YOUR VOICE';
      $('tour-title').textContent='Make it sound like you.';
      $('tour-copy').textContent='Tap this introduction and make it your own. Choose Done when you’re ready.';
      alternative.hidden=false;alternative.textContent='I like it as it is';$('tour-next').hidden=true;
    }
    if(phase==='preview') {
      $('tour-progress').textContent='THROUGH THEIR EYES';
      $('tour-title').textContent='See your work take the stage.';
      $('tour-copy').textContent='Scroll, open photos, and explore your pages. Try Desktop or Mobile above to see how your website feels.';
      $('tour-next').textContent='How do I share it?';
      alternative.hidden=false;alternative.textContent='More room to look';
    }
    if(phase==='share') {
      $('tour-progress').textContent='ON YOUR TERMS';
      $('tour-title').textContent='Share it when you’re ready.';
      const copy=$('tour-copy');copy.replaceChildren();
      const lines=localTrial
        ? [['Save draft','Keeps your edits on this device. Your live website stays unchanged.'],['Publish','In your signed-in Studio, makes your edits visible on your live website. It’s unavailable in this local trial.']]
        : [['Save draft','Keeps your edits privately for later. Visitors still see your last published website.'],['Publish','Makes your edits visible to everyone on your live website.']];
      for(const [label,text] of lines){const line=document.createElement('span'),strong=document.createElement('strong');strong.textContent=`${label}: `;line.append(strong,text);copy.append(line);}
      if(hasUnsavedChanges()) {
        const reminder=document.createElement('span');reminder.className='tour-save-reminder';
        reminder.textContent='Your edits aren’t saved yet. Choose Save draft after the tour to keep them.';copy.append(reminder);
      }
      $('tour-next').textContent='Back to my Studio';
    }
    position();
    const preparedTargets=await prepareStep(phase);
    if(!running||token!==generation)return;
    targets=preparedTargets;
    preparing=false;$('tour-next').disabled=false;
    if(phase==='arrange' && (!targets.handle||!targets.destination)) {
      $('tour-title').textContent='Your story starts here.';$('tour-copy').textContent='When you have two or more photos, you can drag them to choose which one leads.';
      alternative.hidden=true;$('tour-next').hidden=false;$('tour-next').textContent='Try some wording';
    }
    targets.handle?.classList.add('tour-highlight');
    if(phase==='arrange')targets.doc?.documentElement.classList.add('tour-arranging');
    tour.classList.remove('tour-preparing');position();
    for(const doc of [document,targets.doc])bindDocument(doc);
    if(phase==='arrange' && targets.handle) {
      const dragObserver=new MutationObserver(()=>tour.classList.toggle('tour-drag-active',targets.doc.documentElement.classList.contains('visual-dragging')));
      dragObserver.observe(targets.doc.documentElement,{attributes:true,attributeFilter:['class']});listeners.push(()=>dragObserver.disconnect());
      listen(window,'visual-studio-change',()=>{if(photoOrder()!==originalOrder && !preparing)show('result');});
    }
    if(phase==='preview') {
      for(const button of targets.buttons||[])listen(button,'click',compactPreview);
      if(targets.page)listen(targets.page,'change',compactPreview);
      if(targets.tools)listen(targets.tools,'click',compactPreview);
    }
    if(phase==='voice') {
      const updateVoiceGuide=()=>{
        if(!running||phase!=='voice')return;
        const active=document.body.classList.contains('inline-editing');
        tour.classList.toggle('tour-voice-active',active);
        $('tour-title').textContent=active?'How does it feel?':'Make it sound like you.';
        $('tour-copy').textContent=active?'Choose Done when it feels right.':'Tap this introduction and make it your own. Choose Done when you’re ready.';
        alternative.hidden=active;position();
      };
      const editingObserver=new MutationObserver(updateVoiceGuide);
      editingObserver.observe(document.body,{attributes:true,attributeFilter:['class']});listeners.push(()=>editingObserver.disconnect());
      listen(targets.doc.defaultView,'input',position,true);
      listen(document,'click',event=>{
        if(event.target.closest('.inline-edit-done')&&!document.body.classList.contains('inline-editing'))show('preview');
      });
      if(!targets.text){alternative.hidden=false;$('tour-copy').textContent='You can edit your introduction directly on your website whenever you like.';}
    }
    if(phase==='welcome')$('tour-next').focus({preventScroll:true});
    else if(['result','preview','share'].includes(phase))$('tour-title').focus({preventScroll:true});
  }
  async function finish() {
    if(!running)return;
    running=false;generation++;clearStep();shade.setAttribute('hidden','');
    document.body.classList.remove('tour-running');mobileGuideSpace(0);
    dismissed=true;try{localStorage.setItem(seenKey,'seen');}catch{}
    await finishPractice(keeping);keeping=false;
    const target=previousFocus?.isConnected&&previousFocus.getClientRects().length?previousFocus:$('studio-help').querySelector('summary');target?.focus();
  }
  async function start() {
    if(!ready()||running)return;
    running=true;keeping=false;previousFocus=document.activeElement;$('studio-help').open=false;
    document.body.classList.add('tour-running');
    if(await beforeStart()===false){running=false;document.body.classList.remove('tour-running');return;}
    originalOrder=photoOrder();tour.show();shade.removeAttribute('hidden');await show('welcome');
  }
  $('tour-title').tabIndex=-1;
  $('show-tour').addEventListener('click',start);$('tour-skip').addEventListener('click',()=>tour.close());
  alternative.addEventListener('click',async()=>{
    if(preparing)return;
    if(phase==='preview') {
      const compact=tour.classList.toggle('tour-preview-compact');alternative.textContent=compact?'Show guide':'More room to look';position();return;
    }
    if(phase==='voice'){show('preview');return;}
    alternative.disabled=true;await switchPhotos();alternative.disabled=false;
  });
  $('tour-back').addEventListener('click',async()=>{
    if(preparing)return;preparing=true;await restorePractice();keeping=true;await show('voice');
  });
  $('tour-next').addEventListener('click',()=>{
    if(preparing)return;
    if(phase==='welcome')show('arrange');
    else if(phase==='result'){keeping=true;show('voice');}
    else if(phase==='arrange'){keeping=true;show('voice');}
    else if(phase==='preview')show('share');
    else tour.close();
  });
  tour.addEventListener('close',finish);
  window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);
  return {
    maybeStart(){let seen=dismissed;try{seen ||= localStorage.getItem(seenKey)==='seen';}catch{}if(!seen)start();},
    previewLoaded(doc){if(running&&phase==='preview'&&!preparing){targets.doc=doc;bindDocument(doc);position();}},
    close(){if(tour.open)tour.close();}
  };
}
