/* One shared native demonstration: text first, then a perspective entrance. */
(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const english=()=>window.GlowLocale?.language==='en'||document.documentElement.lang==='en';
  const t=(zh,en)=>english()?en:zh;
  const localized=value=>typeof value==='string'?value:value?.[english()?'en':'zh']||'';
  const catalogue=()=>document.documentElement.dataset.theme==='dark'
    ?(english()?window.GLOW_NATIVE_STATES_EN_DARK:window.GLOW_NATIVE_STATES_DARK)
    :(english()?window.GLOW_NATIVE_STATES_EN:window.GLOW_NATIVE_STATES);
  const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='reduce';
  const clamp=x=>Math.min(1,Math.max(0,x)),ease=x=>1-Math.pow(1-clamp(x),3);
  const idleRemaining=()=>window.GlowPlaybackIdle?.remaining()||0;
  const textEase='cubic-bezier(.12,.9,.18,1)';
  const storyGap=96,revealLine=.82;
  const viewportHeight=()=>runtime.state?.height||innerHeight;
  const entryDistance=()=>viewportHeight()*.506;
  const entryLead=record=>record.entryLead??record.geometry.center;
  const textLead=record=>record.geometry.center;
  const entryEnd=record=>entryDistance()-entryLead(record);
  const phaseStart=record=>entryEnd(record);
  const phaseDistance=()=>viewportHeight()*.24;
  const compactLayout=()=>reduce();
  const layoutTop=()=>sceneLayout?.top||96;
  let sceneLayout=null,layoutRevision=-1,fontRevision=0;
  let storyScrollDirection=0;
  const runtime=window.GlowViewport;
  const update=()=>runtime.request();
  function clearAlignment(record,normalize=true){
    record.alignmentRevision=(record.alignmentRevision||0)+1;
    for(const animation of record.alignmentAnimations||[])animation.cancel();
    record.alignmentAnimations=[];
    for(const run of record.alignmentRuns||[]){
      if(run.parentNode)run.replaceWith(...run.childNodes);
    }
    record.alignmentRuns=[];
    if(normalize)for(const part of record.alignmentParts||[])part.normalize();
  }
  function alignmentLines(part){
    const fragments=[],walk=document.createTreeWalker(part,NodeFilter.SHOW_TEXT);
    for(let node=walk.nextNode();node;node=walk.nextNode()){
      if(!node.textContent.trim()||node.parentElement.closest('.cc-paint,svg'))continue;
      const offsets=[0];
      for(const character of node.data)offsets.push(offsets[offsets.length-1]+character.length);
      const range=document.createRange(),lineAt=index=>{
        range.setStart(node,offsets[index]);range.setEnd(node,offsets[index+1]);
        return range.getBoundingClientRect().top;
      };
      let start=0;
      while(start<offsets.length-1){
        const top=lineAt(start);let low=start+1,high=offsets.length-1;
        // Find the actual line break with bounded range reads. This runs only
        // when alignment changes, never for every scrolling animation frame.
        while(low<high){const middle=Math.floor((low+high)/2);if(Math.abs(lineAt(middle)-top)<1)low=middle+1;else high=middle;}
        const end=low;
        range.setStart(node,offsets[start]);range.setEnd(node,offsets[end]);
        fragments.push({node,start:offsets[start],end:offsets[end],left:range.getBoundingClientRect().left});
        start=end;
      }
    }
    return fragments;
  }
  function alignStory(record,layout){
    if(record.el.dataset.copyLayout===layout)return;
    if(reduce()||!record.revealed||!record.el.dataset.copyLayout){
      clearAlignment(record);record.el.dataset.copyLayout=layout;return;
    }
    const parts=Array.from(record.story.querySelectorAll('.wf-index,.wf-copy h3,.wf-description,.wf-manual-link,.wf-source'));
    const fragments=parts.flatMap(alignmentLines);
    const groups=Array.from(record.story.querySelectorAll('.wf-phases,.wf-action > *')).filter(part=>part.getClientRects().length).map(part=>({part,left:part.getBoundingClientRect().left}));
    // Read any in-flight positions before cancelling. Reversing scroll starts
    // at the currently painted text, then uses the browser's new natural edge.
    clearAlignment(record,false);record.alignmentParts=parts;
    const byNode=new Map();
    for(const fragment of fragments){const items=byNode.get(fragment.node)||[];items.push(fragment);byNode.set(fragment.node,items);}
    for(const [node,items] of byNode){
      const replacement=document.createDocumentFragment();
      for(const fragment of items){
        const run=document.createElement('span');run.className='wf-alignment-run';run.textContent=node.data.slice(fragment.start,fragment.end);
        replacement.append(run);fragment.run=run;record.alignmentRuns.push(run);
      }
      node.replaceWith(replacement);
    }
    record.el.dataset.copyLayout=layout;
    const revision=record.alignmentRevision;
    const movements=[...fragments.map(fragment=>({part:fragment.run,left:fragment.left})),...groups];
    for(const {part,left} of movements){
      const distance=left-part.getBoundingClientRect().left;
      if(Math.abs(distance)<.25)continue;
      record.alignmentAnimations.push(part.animate([{left:`${distance}px`},{left:'0px'}],{duration:380,easing:'cubic-bezier(.2,.75,.25,1)',fill:'both'}));
    }
    Promise.allSettled(record.alignmentAnimations.map(animation=>animation.finished)).then(()=>{
      // Remove every temporary offset and wrapper: the endpoint is exactly the
      // original DOM's browser-laid-out side alignment, with selectable links.
      if(record.alignmentRevision===revision)clearAlignment(record);
    });
  }
  const symbols={Space:'␣',Ctrl:'⌃',Cmd:'⌘',Alt:'⌥',Option:'⌥',Shift:'⇧',Enter:'↩',Return:'↩',Tab:'⇥',Esc:'⎋',Backspace:'⌫',Delete:'⌦'};
  const keysHTML=(keys,language=english()?'en':'zh')=>(keys||[]).map(key=>`<kbd title="${esc(key)}" aria-label="${esc(key)}">${esc(symbols[key]||(key==='Click'?(language==='en'?'Click':'单击'):key))}</kbd>`).join('');
  const ids=['theme','files','notebook','pdf','pdf-sync','ai','terminal','basic-completion','basic-git'];
  const featureNames={theme:['系统外观','System appearance'],files:['文件搜索','File search'],notebook:['Notebook','Notebook'],pdf:['TeX 与 PDF','TeX & PDF'],'pdf-sync':['源码与 PDF 双向定位','Source / PDF sync'],ai:['AI 编程助手','AI assistant'],terminal:['内置终端','Built-in terminal'],'basic-completion':['代码补全','Code completion'],'basic-git':['Git 变更','Git changes']};
  const scenes=new Map((window.GLOW_NATIVE_SCENES||[]).map(scene=>[scene.id,scene]));
  scenes.set('theme',{id:'theme',label:'系统外观',presentation:{eyebrow:'LIGHT / DARK',title:'深浅，随你切换。',description:'Ayu Light 与 Dark 随系统外观切换，代码、文件树与界面一起变化。',query:'主题',sources:[{name:'auto-dark-mode.nvim',url:'https://github.com/f-person/auto-dark-mode.nvim'},{name:'Base46',url:'https://github.com/ysrae1/base46'}]}});
  const phases=window.GLOW_NATIVE_STORY_PHASES?.scenes||{};
  const records=[];

  let initialAnchorPending=true;
  const desktop=true;
  const mediaSizes='(max-width: 882px) calc(100vw - 32px), 850px';
  const host=document.getElementById('workflow-demo');

  if(!host)return;
  host.innerHTML=ids.filter(id=>catalogue()?.[id]&&phases[id]?.length).map((id,n)=>{
    const scene=scenes.get(id),data=catalogue()[id],phase=phases[id][0],p=scene.presentation;
    return `<article class="wf-feature" id="feature-${id}" data-side="${n%2?'left':'right'}" data-scope="desktop" aria-labelledby="title-${id}">
      <div class="wf-track"><div class="wf-sticky"><div class="wf-stage"><div class="wf-story" data-no-translate><div class="wf-story-content">
        <span class="wf-index mono">${String(n+1).padStart(2,'0')} / ${String(ids.length).padStart(2,'0')} &nbsp; · &nbsp; ${esc(p.eyebrow)}</span>
        <div class="wf-copy"><h3 id="title-${id}">${esc(localized(phase.title))}</h3><p class="wf-description">${esc(localized(phase.description))}</p></div>
        <div class="wf-phases" role="group" aria-label="${t('演示阶段','Demo stages')}">${phases[id].map((phase,i)=>`<button type="button" data-phase="${i}" aria-pressed="${i===0}"><span class="wf-phase-label">${esc(localized(phase.label))}</span></button>`).join('')}</div>
        <div class="wf-action"><span class="wf-state-label"></span><span class="wf-keys"></span></div>
        <a class="wf-manual-link" href="handbook.html">${t('查看相关操作','Explore these actions')} ↗</a>
        <p class="wf-source">${t('功能来源：','Powered by: ')}${(p.sources||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(window.GlowLocale?.t(s.name)||s.name)} ↗</a>`).join(' · ')}</p>
      </div></div><figure class="wf-visual viewer"><div class="halo" aria-hidden="true"></div><a class="wf-native-window window" href="${esc(data.frames[0].desktopLargeImage||data.frames[0].desktopImage)}" target="_blank" rel="noopener" aria-label="${t('查看大图','View larger image')}" style="aspect-ratio:${data.desktopWidth}/${data.desktopHeight}"></a></figure></div></div></div>
    </article>`;
  }).join('');
  function installLayers(record){
    // Keep the last painted composite until its replacement has decoded.
    // Merely creating the other states must not start a download or a decode.
    record.window.querySelectorAll('.wf-state-frame').forEach(image=>image.remove());
    record.layers=record.data.frames.map(frame=>{
      const image=new Image();image.className='wf-state-frame';image.loading='lazy';image.decoding='async';
      image.dataset.source=desktop?frame.desktopImage:frame.image;
      if(desktop&&frame.desktopSrcset)image.dataset.sourceSet=frame.desktopSrcset;
      image.dataset.largerSource=desktop?(frame.desktopLargeImage||frame.desktopImage):frame.image;
      image.alt=frame.label;image.setAttribute('aria-hidden','true');
      record.window.append(image);return image;
    });
    record.window.style.aspectRatio=desktop?`${record.data.desktopWidth}/${record.data.desktopHeight}`:`${record.data.width}/${record.data.height}`;
    record.el.dataset.scope=desktop?'desktop':'window';record.frame=-1;
  }
  function loadImage(record,index,priority='low'){
    const image=record.layers[index];
    if(!image||image.hasAttribute('src'))return image;
    image.loading='eager';image.fetchPriority=priority;
    // Set selection hints before src so a narrow screen never first requests
    // the desktop fallback and then requests its responsive replacement.
    if(image.dataset.sourceSet){image.sizes=mediaSizes;image.srcset=image.dataset.sourceSet;}
    image.src=image.dataset.source;return image;
  }
  function warmFrames(record,index){
    if(!record.near)return;
    const phase=record.phases[record.phase],last=Math.min(phase.end,index+(record.typing?2:1));
    const keep=new Set([record.frame]);
    for(let i=index;i<=last;i++){keep.add(i);loadImage(record,i,i===index?'auto':'low');}
    // Retain at most the displayed state and this short lookahead. The painted
    // composite stays available while a fast jump waits for a later frame.
    record.layers.forEach((image,i)=>{if(!keep.has(i)){image.removeAttribute('srcset');image.removeAttribute('src');}});
  }
  function showFrame(record,index){
    record.requested=index;
    if(!record.near)return;
    if(index===record.frame){
      if(record.pending!==null){record.revision++;record.pending=null;}
      warmFrames(record,index);return;
    }
    if(index===record.pending)return;
    const revision=++record.revision,image=loadImage(record,index,'auto');record.pending=index;
    warmFrames(record,index);
    const show=()=>{
      if(revision!==record.revision)return;
      record.frame=index;record.pending=null;
      const returning=storyScrollDirection<0;
      record.layers.forEach((layer,i)=>layer.classList.toggle('is-current',i===index));
      record.window.href=image.dataset.largerSource;
      const incoming=image.cloneNode();incoming.className='wf-display-frame';incoming.loading='eager';incoming.alt='';incoming.style.zIndex=String(++record.order);
      record.window.append(incoming);record.display=incoming;
      warmFrames(record,index);
      const finish=()=>{if(record.display===incoming)record.window.querySelectorAll('.wf-display-frame').forEach(layer=>{if(layer!==incoming)layer.remove();});};
      // The old composite stays opaque: fading both images exposes the background.
      if(reduce()||returning)finish();else incoming.animate([{opacity:0},{opacity:1}],{duration:record.typing?120:600,easing:'cubic-bezier(.22,.61,.36,1)'}).finished.then(finish,()=>{});
    };
    if(image.complete&&image.naturalWidth)show();else image.decode().then(show,()=>{if(revision===record.revision)record.pending=null;});
  }
  function describe(record){
    clearAlignment(record);
    const phase=record.phases[record.phase];
    const p=record.scene.presentation;
    record.window.setAttribute('aria-label',t('查看大图','View larger image'));
    record.story.querySelector('.wf-index').textContent=`${String(ids.indexOf(record.id)+1).padStart(2,'0')} / ${String(ids.length).padStart(2,'0')} · ${featureNames[record.id][english()?1:0]}`;
    window.GlowStoryCopy.renderPhase(record.story,record.phases,phase,english()?'en':'zh',{
      keysHTML,phaseIndex:record.phase,groupLabel:t('演示阶段','Demo stages'),onlyChangedLabels:true,
    });
    const link=record.story.querySelector('.wf-manual-link');
    link.href=`handbook.html?lang=${english()?'en':'zh'}&q=${encodeURIComponent(english()?({theme:'theme',files:'file',notebook:'Notebook',pdf:'PDF','pdf-sync':'PDF',ai:'AI',terminal:'terminal','basic-completion':'completion','basic-git':'Git'}[record.id]):p.query||record.scene.label)}`;
    record.story.querySelector('.wf-source').innerHTML=t('功能来源：','Powered by: ')+(p.sources||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(window.GlowLocale?.t(s.name)||s.name)} ↗</a>`).join(' · ');
  }
  function select(record,index,frame=null){
    clearTimeout(record.timer);record.timer=null;
    const changed=record.phase!==index;record.phase=index;
    const phase=record.phases[index];record.typing=phase.end-phase.start>2;
    describe(record);
    let current=reduce()?phase.end:Math.max(phase.start,Math.min(phase.end,frame??phase.start));
    showFrame(record,current);
    if(changed){
      if(reduce()||storyScrollDirection<0)settleText(record);
      else animateText(record.story.querySelectorAll('.wf-copy h3,.wf-description,.wf-action'),460,18,55);
    }
    // Only the frames inside an operation animate with time. Scroll owns the stage.
    const next=()=>{
      record.timer=null;
      if(!record.near||!record.visible||reduce())return;
      const wait=idleRemaining();
      if(wait>0){record.timer=setTimeout(next,wait);return;}
      if(record.pending!==null){record.timer=setTimeout(next,80);return;}
      if(current<phase.end){showFrame(record,++current);record.timer=setTimeout(next,record.typing?160:900);}
    };
    record.advance=next;
    if(record.near&&record.visible&&!reduce()&&current<phase.end)record.timer=setTimeout(next,Math.max(850,idleRemaining()));
  }
  function jumpPhase(record,index) {
    initialAnchorPending=false;
    record.entryComplete=true;record.entryProgress=1;record.mediaUnlocked=true;
    select(record,index);
    if(!reduce()&&record.geometry){
      const g=record.geometry;
      scrollTo({top:g.documentTop+phaseStart(record)+index*phaseDistance()+phaseDistance()*.12,behavior:'instant'});
    }
    update();
  }
  ids.forEach(id=>{
    const el=document.getElementById(`feature-${id}`);if(!el)return;
    const record={id,el,scene:scenes.get(id),phases:phases[id],data:catalogue()[id],phase:0,frame:-1,pending:null,revision:0,order:0,near:false,requested:0,visible:false,revealed:false,entryComplete:false,entryProgress:0,mediaUnlocked:false,introScrollY:null,introReadyAt:0,timer:null,story:el.querySelector('.wf-story'),visual:el.querySelector('.wf-visual'),window:el.querySelector('.wf-native-window')};
    record.sticky=el.querySelector('.wf-sticky');record.track=el.querySelector('.wf-track');
    record.typing=record.phases[0].end-record.phases[0].start>2;
    records.push(record);installLayers(record);describe(record);
    el.querySelectorAll('[data-phase]').forEach(button=>button.addEventListener('click',()=>jumpPhase(record,Number(button.dataset.phase))));
  });
  const mediaObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    const record=records.find(record=>record.el===entry.target);if(!record)return;
    record.near=entry.isIntersecting;
    if(record.near)showFrame(record,record.requested);
    else {
      record.revision++;record.pending=null;clearTimeout(record.timer);record.timer=null;
      record.layers.forEach(image=>{image.removeAttribute('srcset');image.removeAttribute('src');});
    }
  }),{rootMargin:'100% 0px 100% 0px'});
  records.forEach(record=>mediaObserver.observe(record.el));
  const pendingText=new WeakMap();
  const textObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    const settings=pendingText.get(entry.target);
    if(settings){if(storyScrollDirection<0)releaseText(entry.target);else playText(entry.target,settings);}
  }),{rootMargin:'0px 0px -2% 0px'});
  function releaseText(part){
    textObserver.unobserve(part);pendingText.delete(part);
    part.style.opacity='';part.style.transform='';
    part.inert=part.matches('.wf-phases')&&part.closest('.wf-feature')?.dataset.mediaReady!=='true';
  }
  function playText(part,{duration,distance,delay}){
    releaseText(part);
    if(reduce())return;
    // Opacity has its own visible fade; movement keeps the brisk initial impulse.
    part.animate([{opacity:0},{opacity:1}],{
      duration:Math.min(duration,520),delay,easing:'cubic-bezier(.3,0,.6,1)',fill:'backwards'
    });
    part.animate([{transform:`translateY(${distance}px)`},{transform:'translateY(0)'}],{
      duration,delay,easing:textEase,fill:'backwards'
    });
  }
  function settleText(record){
    clearAlignment(record);
    record.story.getAnimations({subtree:true}).forEach(animation=>animation.cancel());
    record.story.querySelectorAll('.wf-index,.wf-copy h3,.wf-description,.wf-phases,.wf-action,.wf-manual-link,.wf-source').forEach(releaseText);
  }
  function animateText(parts,duration,distance,stagger){
    let order=0;
    parts.forEach(part=>{
      part.getAnimations().forEach(animation=>animation.cancel());releaseText(part);
      if(part.hidden||getComputedStyle(part).display==='none')return;
      const settings={duration,distance,delay:order++*stagger},bounds=part.getBoundingClientRect();
      if(bounds.bottom<=0)return;
      if(bounds.top>=innerHeight*.98){
        part.style.opacity='0';part.style.transform=`translateY(${distance}px)`;part.inert=true;
        pendingText.set(part,settings);textObserver.observe(part);
      } else playText(part,settings);
    });
  }

  function revealText(record,index) {
    if(record.revealed)return;
    const bounds=record.story.getBoundingClientRect();
    if(bounds.bottom<=0)return;
    const tall=record.introHeight>viewportHeight()-layoutTop()-24;
    if(compactLayout()||tall?bounds.top>=viewportHeight()*revealLine:bounds.bottom>viewportHeight()-24||bounds.top<layoutTop())return;
    const previous=records[index-1];
    if(previous){
      const text=previous.story.getBoundingClientRect(),media=previous.visual.getBoundingClientRect();
      const top=Math.min(text.top,media.top),height=Math.max(text.bottom,media.bottom)-top;
      if(height>0&&top>-height/3)return;
    }
    record.revealed=true;record.story.classList.add('is-revealed');
    if(reduce())return;
    // One entrance per story. Finishing above the viewport never starts an exit.
    const parts=record.story.querySelectorAll('.wf-index,.wf-copy h3,.wf-description,.wf-phases,.wf-action,.wf-manual-link,.wf-source');
    if(!compactLayout())record.story.animate([
      {transform:'translateY(calc(-50% + 24px))'},
      {transform:'translateY(-50%)'}
    ],{duration:700,easing:'cubic-bezier(.16,.8,.22,1)'});
    animateText(parts,620,8,55);
    record.introReadyAt=performance.now()+620+(Array.from(parts).filter(part=>!part.hidden&&getComputedStyle(part).display!=='none').length-1)*55;
    clearTimeout(record.introTimer);
    record.introTimer=setTimeout(update,Math.max(0,record.introReadyAt-performance.now()));
  }
  function previousContentExited(index){
    const previous=records[index-1];
    if(previous)return Math.max(previous.story.getBoundingClientRect().bottom,previous.visual.getBoundingClientRect().bottom)<=0;
    const hero=document.getElementById('top'),legend=document.querySelector('.wf-legend-slot')||document.querySelector('.wf-legend-origin,.wf-legend-anchor');
    return Math.max(hero?.getBoundingClientRect().bottom??0,legend?.getBoundingClientRect().bottom??0)<=0;
  }
  function advanceEntrance(record,bounds,compact){
    if(compact)return 1;
    if(record.entryComplete)return record.entryProgress=1;
    if(record.mediaUnlocked){
      const next=clamp((entryLead(record)-bounds.top)/entryDistance());
      // Entrance motion advances only. Reversing the scroll cannot shrink a
      // painted image, including a visually complete eased frame near the end.
      record.entryProgress=Math.max(record.entryProgress||0,next);
      if(record.entryProgress>=.999){record.entryComplete=true;record.entryProgress=1;}
    }
    return record.entryProgress||0;
  }
  function measure(state){
    let layout=null;
    if(layoutRevision!==state.layoutRevision){
      const safeTop=Math.max(0,parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--brand-safe-top'))||0);
      const top=96+safeTop;
      const storyMeta=(record,language)=>({
        indexText:`${String(ids.indexOf(record.id)+1).padStart(2,'0')} / ${String(ids.length).padStart(2,'0')} · ${featureNames[record.id][language==='en'?1:0]}`,
        sourceHTML:(language==='en'?'Powered by: ':'功能来源：')+(record.scene.presentation.sources||[]).map(source=>`<a>${esc(language==='en'?(window.GLOW_PAGE_EN?.dictionary?.[source.name]||source.name):source.name)} ↗</a>`).join(' · ')
      });
      layout=window.GlowStoryLayout.measure({records,width:host.clientWidth,viewportWidth:state.width,height:state.height,top,bottom:28,
        maxWidth:1160,preferredImageWidth:850,horizontalGap:56,verticalGap:26,density:devicePixelRatio,
        keysHTML,storyMeta,fontRevision,languages:['zh','en']});
    }
    return {layout,boxes:records.map(record=>({record,box:record.el.getBoundingClientRect(),bounds:record.track.getBoundingClientRect()}))};
  }
  function reserveTrack(record){
    const g=record.geometry;
    // Entry readiness can arrive after a fast scroll. Extending this track once
    // at the recorded baseline preserves the complete accepted entrance/stages;
    // the currently pinned anchor does not move, and no per-frame feedback runs.
    const extra=record.introScrollY===null?0:Math.max(0,g.center-record.entryLead-g.waitTravel);
    const runway=g.compact?0:g.baseRunway+extra;
    if(g.runway===runway)return;
    g.runway=runway;
    record.el.style.setProperty('--wf-runway',`${runway}px`);
    record.el.style.setProperty('--wf-article-height',`${g.anchorOffset+runway+g.finalBottom}px`);
  }
  function commit(state,{layout,boxes}){
    storyScrollDirection=state.direction;
    if(layout){
      sceneLayout=layout;layoutRevision=state.layoutRevision;
      records.forEach(record=>{
        clearAlignment(record);
        const compact=state.reduced,introHeight=layout.introHeights[record.id],sideHeight=layout.heights[record.id];
        const imageHeight=layout.imageWidth*layout.ratios[record.id],pairHeight=layout.pairHeights[record.id];
        const center=compact?0:Math.max(state.height*.5,layout.top+(layout.stacked?introHeight:Math.max(introHeight,pairHeight))*.5);
        const finalTop=compact?-pairHeight*.5:layout.stacked?layout.top-center:-pairHeight*.5;
        const finalBottom=finalTop+pairHeight,anchorOffset=compact?-finalTop:introHeight*.5;
        const waitTravel=compact?0:Math.max(0,center-introHeight*.5-storyGap);
        const baseRunway=compact?0:waitTravel+entryDistance()+record.phases.length*phaseDistance();
        record.introHeight=introHeight;record.sideHeight=sideHeight;
        record.geometry={center,compact,pairHeight,imageHeight,finalTop,finalBottom,anchorOffset,waitTravel,baseRunway,runway:null,documentTop:0};
        record.entryLead??=center;
        record.el.classList.toggle('wf-stacked',layout.stacked);record.el.classList.toggle('wf-flow',compact);
        record.el.style.setProperty('--wf-stage-width',`${layout.width}px`);
        record.el.style.setProperty('--wf-text-width',`${layout.textWidth}px`);
        record.el.style.setProperty('--wf-image-width',`${layout.imageWidth}px`);
        record.el.style.setProperty('--wf-anchor-offset',`${anchorOffset}px`);
        record.el.style.setProperty('--wf-sticky-top',`${center}px`);
        record.el.dataset.introHeight=String(introHeight);record.el.dataset.sideHeight=String(sideHeight);
        record.el.dataset.readingCenter=String(center);
        reserveTrack(record);
      });
      runtime.request();return;
    }
    boxes.forEach(({record,box,bounds},index)=>{
      const g=record.geometry;if(!g)return;
      g.documentTop=bounds.top+state.y;
      if(!state.reduced&&state.direction<0&&box.top>state.visualTop+state.visualHeight+40&&record.revealed){
        settleText(record);clearTimeout(record.introTimer);
        record.revealed=false;record.entryComplete=false;record.entryProgress=0;record.mediaUnlocked=false;record.introScrollY=null;
        record.entryLead=g.center;reserveTrack(record);
      }
      if(box.bottom<=state.visualTop){
        record.entryComplete=true;record.entryProgress=1;record.mediaUnlocked=true;record.revealed=true;settleText(record);
      }
      if(state.reduced){record.revealed=true;record.entryComplete=true;record.entryProgress=1;record.mediaUnlocked=true;}
      // Original readiness gate: text finished, its own midpoint reached, and
      // all preceding actual content left. Recording a baseline is not unlock.
      if(!state.reduced&&record.revealed&&!record.mediaUnlocked&&record.introScrollY===null&&state.now>=record.introReadyAt&&bounds.top<=textLead(record)&&previousContentExited(index)){
        record.introScrollY=state.y;record.entryLead=bounds.top;reserveTrack(record);
      }
      const progress=advanceEntrance(record,bounds,state.reduced),e=ease(progress);
      if(!state.reduced&&record.mediaUnlocked){
        const position=Math.max(0,(-bounds.top-phaseStart(record))/phaseDistance());
        const phase=Math.min(record.phases.length-1,Math.floor(position));
        if(phase!==record.phase)select(record,phase);
      }
      const width=sceneLayout.width,wide=sceneLayout.introWidth,column=sceneLayout.textWidth,gap=sceneLayout.horizontalGap;
      const copyWidth=wide*(1-e)+column*e;
      const contactWidth=Math.max(sceneLayout.contacts[record.id][english()?'en':'zh'][record.phase],column);
      const copyLayout=sceneLayout.stacked||(!state.reduced&&copyWidth>contactWidth+.5)?'intro':'side';
      const pairWidth=column+gap+sceneLayout.imageWidth,pairLeft=Math.max(0,(width-pairWidth)*.5);
      const finalLeft=sceneLayout.stacked?(width-column)*.5:record.el.dataset.side==='left'?pairLeft+sceneLayout.imageWidth+gap:pairLeft;
      const storyCenter=sceneLayout.stacked?g.finalTop+g.imageHeight+sceneLayout.verticalGap+record.sideHeight*.5:0;
      record.story.style.width=`${copyWidth}px`;
      record.story.style.height=`${record.introHeight*(1-e)+record.sideHeight*e}px`;
      record.story.style.left=`${(width-wide)*.5*(1-e)+finalLeft*e}px`;
      record.story.style.top=`${storyCenter*e}px`;
      record.story.style.transform='translateY(-50%)';
      alignStory(record,copyLayout);
      const imageCenter=sceneLayout.stacked?g.finalTop+g.imageHeight*.5:0;
      record.visual.style.top=`${imageCenter}px`;
      record.visual.style.left=`${sceneLayout.stacked?(width-sceneLayout.imageWidth)*.5:record.el.dataset.side==='left'?pairLeft:pairLeft+column+gap}px`;
      const direction=record.el.dataset.side==='left'?-1:1,travel=direction*Math.min(580,state.width*.42)*(1-e);
      const lift=sceneLayout.stacked?Math.max(Math.min(240,state.height*.3),imageCenter+g.imageHeight*.5+record.introHeight*.5+34)*(1-e):0;
      record.visual.style.opacity=String(e);
      record.visual.style.transform=state.reduced?'translateY(-50%)':`perspective(1200px) translate3d(${travel}px,calc(-50% - ${lift}px),0) rotateY(${-direction*32*(1-e)}deg)`;
      record.el.style.setProperty('--wf-stage-emphasis',String(e));
      revealText(record,index);
      if(record.revealed)record.story.classList.add('is-revealed');
      record.story.style.opacity=record.revealed?'1':'0';record.story.inert=!record.revealed;
      const ready=record.revealed&&progress>=.999;
      record.visual.inert=!ready;
      const controls=record.story.querySelector('.wf-phases');controls.inert=!ready;
      controls.querySelectorAll('button').forEach(button=>{button.disabled=!ready;});
      record.el.dataset.entryState=record.entryComplete?'complete':record.mediaUnlocked?'entering':record.revealed?'reading':'pending';
      record.el.dataset.entryProgress=String(progress);record.el.dataset.introReady=String(record.revealed&&state.now>=record.introReadyAt);
      record.el.dataset.mediaUnlocked=String(record.mediaUnlocked);record.el.dataset.introScrollY=record.introScrollY===null?'':String(record.introScrollY);
      record.el.dataset.phaseStart=String(g.documentTop+phaseStart(record));record.el.dataset.contactWidth=String(contactWidth);
      if(record.el.dataset.mediaReady!==String(ready)){record.el.dataset.mediaReady=String(ready);document.dispatchEvent(new Event('glow:mediavisibilitychange'));}
      const visible=ready&&box.bottom>state.visualTop&&box.top<state.visualTop+state.visualHeight;
      const wasVisible=record.visible;record.visible=visible;
      if(visible&&!wasVisible)select(record,record.phase,record.frame<0?null:record.frame);
      if(!visible){clearTimeout(record.timer);record.timer=null;}
    });
  }
  runtime.subscribe({measure,commit},10);
  document.addEventListener('glow:scrollactivity',()=>{initialAnchorPending=false;records.forEach(record=>{
    clearTimeout(record.timer);record.timer=null;
    if(record.introScrollY!==null&&!record.mediaUnlocked&&scrollY>record.introScrollY+1)record.mediaUnlocked=true;
  });});
  document.addEventListener('glow:scrollidle',()=>records.forEach(record=>{clearTimeout(record.timer);record.timer=null;record.advance?.();}));
  function refreshMedia(){
    records.forEach(record=>{
      const frame=record.pending??record.requested??record.frame;
      record.data=catalogue()[record.id];record.revision++;record.pending=null;
      installLayers(record);select(record,record.phase,frame);
    });
    update();
  }
  document.addEventListener('glow:languagechange',()=>{
    refreshMedia();runtime.invalidate();
    document.querySelectorAll('a[data-handbook-link]').forEach(link=>{const url=new URL(link.href);url.searchParams.set('lang',english()?'en':'zh');if(link.dataset.queryZh)url.searchParams.set('q',english()?link.dataset.queryEn:link.dataset.queryZh);link.href=url.href;});
  });
  document.addEventListener('glow:themechange',refreshMedia);
  document.addEventListener('glow:motionchange',()=>{records.forEach(record=>{settleText(record);select(record,record.phase,record.frame);});});
  document.fonts?.ready.then(()=>{fontRevision++;runtime.invalidate();});
  window.GlowFeatureStories={update,get layout(){return sceneLayout;}};
  document.dispatchEvent(new Event('glow:stagesready'));
  const resolve=id=>document.getElementById(id==='features'?'feature-theme':id==='workflows'?'feature-files':id==='capabilities'?'feature-basic-completion':id);
  function showFeature(el,behavior){
    const record=records.find(record=>record.el===el);
    scrollTo({top:scrollY+el.getBoundingClientRect().top+(record?.geometry?.anchorOffset??0)-(record?.geometry?.center??132),behavior});
    update();
  }
  document.querySelectorAll('a[href="#workflows"],a[href="#features"],a[href="#capabilities"]').forEach(link=>link.addEventListener('click',event=>{
    if(event.button||event.metaKey||event.ctrlKey||event.shiftKey)return;
    const el=resolve(link.hash.slice(1));if(!el)return;event.preventDefault();history.pushState(null,'',link.hash);showFeature(el,reduce()?'instant':'smooth');
  }));
  const requested=resolve(decodeURIComponent(location.hash.slice(1)));
  if(requested?.classList.contains('wf-feature'))addEventListener('load',()=>{if(initialAnchorPending)showFeature(requested,'instant');},{once:true});
})();
