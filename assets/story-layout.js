/* Measure every stage before solving the shared gallery's width/height limits. */
(() => {
  'use strict';

  const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const positive = (value, fallback) => Math.max(0, number(value, fallback));

  function phaseCopy(story, record, phase, language, keysHTML, storyMeta) {
    story.lang = language;
    const meta = storyMeta?.(record, language);
    const index = story.querySelector('.wf-index');
    if (index && meta?.indexText !== undefined) index.textContent = meta.indexText;
    const source = story.querySelector('.wf-source');
    if (source && meta?.sourceHTML !== undefined) source.innerHTML = meta.sourceHTML;
    window.GlowStoryCopy.renderPhase(story, record.phases, phase, language, { keysHTML });
  }

  function cloneStory(record, language) {
    const shell = record.el ? record.el.cloneNode(false) : document.createElement('article');
    shell.classList.remove('wf-flow','wf-stacked');
    shell.classList.add('wf-feature','wf-adaptive');
    shell.removeAttribute('id');
    shell.dataset.storyMeasure = '';
    shell.dataset.noTranslate = '';
    shell.dataset.copyLayout = 'side';
    shell.lang = language;
    shell.setAttribute('aria-hidden', 'true');
    shell.inert = true;
    shell.style.cssText = 'position:fixed!important;left:-100000px!important;top:0!important;right:auto!important;bottom:auto!important;width:max-content!important;height:auto!important;margin:0!important;padding:0!important;visibility:hidden!important;pointer-events:none!important;transform:none!important;contain:layout style paint;';
    const story = record.story.cloneNode(true);
    story.querySelectorAll('.cc-paint,canvas,.brand-field-baseline').forEach(node => node.remove());
    story.querySelectorAll('.wf-alignment-run').forEach(node => node.replaceWith(...node.childNodes));
    for (const node of [story, ...story.querySelectorAll('*')]) {
      node.removeAttribute('id');
      node.removeAttribute('aria-labelledby');
      node.removeAttribute('inert');
      for (const attribute of [...node.attributes]) {
        if (attribute.name.startsWith('on')) node.removeAttribute(attribute.name);
      }
      // Web Animations are not cloned; inline offsets from interrupted motion are.
      for (const property of ['animation', 'transition', 'transform', 'translate', 'rotate', 'scale', 'opacity', 'visibility', 'left', 'right', 'top', 'bottom']) {
        node.style.removeProperty(property);
      }
      node.style.setProperty('animation', 'none', 'important');
      node.style.setProperty('transition', 'none', 'important');
    }
    story.classList.add('is-revealed');
    story.dataset.storyMeasure = '';
    story.dataset.noTranslate = '';
    for (const [property, value] of Object.entries({ position: 'relative', left: '0', top: '0', height: 'auto', maxHeight: 'none', minHeight: '0', transform: 'none', translate: 'none', opacity: '1', visibility: 'hidden' })) {
      story.style.setProperty(property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), value, 'important');
    }
    shell.append(story);
    document.body.append(shell);
    return { shell, story };
  }

  const selectors={index:'.wf-index',title:'h3',description:'.wf-description',phases:'.wf-phases',action:'.wf-action',manual:'.wf-manual-link',source:'.wf-source'};
  function longestLine(story) {
    let width=0;
    for(const selector of Object.values(selectors)){
      const part=story.querySelector(selector);if(!part||part.hidden)continue;
      const lines=new Map(),walk=document.createTreeWalker(part,NodeFilter.SHOW_TEXT);
      for(let node=walk.nextNode();node;node=walk.nextNode()){
        if(!node.textContent.trim()||node.parentElement.closest('.cc-paint,svg'))continue;
        const range=document.createRange();range.selectNodeContents(node);
        for(const rect of range.getClientRects()){
          const key=Math.round(rect.top),line=lines.get(key)||[Infinity,-Infinity];
          line[0]=Math.min(line[0],rect.left);line[1]=Math.max(line[1],rect.right);lines.set(key,line);
        }
      }
      for(const [left,right] of lines.values())width=Math.max(width,right-left);
    }
    return width;
  }
  function measure(input){
    const {records,width}=input,availableHeight=input.height-input.top-input.bottom;
    const languages=input.languages||['zh','en'],horizontalGap=input.horizontalGap,verticalGap=input.verticalGap;
    // The accepted 860px breakpoint uses the viewport, not the inset gallery.
    const stacked=positive(input.viewportWidth,width)<=860||width<350+horizontalGap+300;
    const textWidth=stacked?Math.min(width,350):Math.min(350,width*.32);
    const introWidth=Math.min(850,width),heights={},introHeights={},ratios={},contacts={};
    const clones=records.flatMap(record=>languages.map(language=>({record,language,...cloneStory(record,language)})));
    try{
      // Match the original maximumHeight contract: reserve the tallest real
      // complete story, never a synthetic sum of unrelated slot maxima.
      // Only the outer footprint is stable across stages and languages.
      for(const mode of ['intro','side']){
        const targetHeights=mode==='intro'?introHeights:heights;
        for(const {record,language,shell,story} of clones){
          shell.dataset.copyLayout=mode;
          story.style.setProperty('width',`${mode==='intro'?introWidth:textWidth}px`,'important');
          for(const [index,phase] of record.phases.entries()){
            phaseCopy(story,record,phase,language,input.keysHTML,input.storyMeta);
            const height=Math.ceil(story.getBoundingClientRect().height*input.density)/input.density;
            targetHeights[record.id]=Math.max(targetHeights[record.id]||0,height);
            if(mode==='intro'){
              contacts[record.id]??={};contacts[record.id][language]??=[];
              contacts[record.id][language][index]=longestLine(story);
            }
          }
          ratios[record.id]=record.data.desktopHeight/record.data.desktopWidth;
        }
      }
      const preferredImageWidth=Math.min(input.preferredImageWidth,input.maxWidth-textWidth-horizontalGap);
      const fitWidth=Math.min(...records.map(r=>(availableHeight-heights[r.id]-verticalGap)/ratios[r.id]));
      const imageWidth=stacked?Math.min(width,preferredImageWidth,Math.max(Math.min(300,width),fitWidth)):Math.max(0,Math.min(preferredImageWidth,width-textWidth-horizontalGap));
      const pairHeights=Object.fromEntries(records.map(r=>[r.id,stacked?heights[r.id]+verticalGap+imageWidth*ratios[r.id]:Math.max(heights[r.id],imageWidth*ratios[r.id])]));
      const maxPairHeight=Math.max(...Object.values(pairHeights));
      return {key:`${width}/${input.fontRevision}/${input.density}`,width,stacked,textWidth,introWidth,naturalTextWidth:textWidth,imageWidth,preferredImageWidth,horizontalGap,verticalGap,
        top:input.top,bottom:input.bottom,availableHeight,heights,introHeights,contacts,ratios,pairHeights,maxPairHeight,fits:maxPairHeight<=availableHeight,scrollFallback:false};
    } finally {clones.forEach(({shell})=>shell.remove());}
  }
  window.GlowStoryLayout={measure};
})();
