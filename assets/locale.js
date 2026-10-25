/* Reversible page localization. Renderers keep their state and may call apply(host). */
(() => {
  'use strict';
  const source = window.GLOW_PAGE_EN || {dictionary:{}};
  const dictionary = source.dictionary || {};
  const originals = new WeakMap();
  const attributes = new WeakMap();
  const textSkip = 'script,style,pre,code,kbd,samp,noscript,[data-no-translate],[data-language-toggle]';
  const attributeSkip = 'script,style,[data-no-translate],[data-language-toggle]';
  const attributeNames = ['aria-label','aria-description','title','alt','placeholder'];
  let language = 'zh';
  let observer;
  let queued = false;
  const normalize = value => String(value ?? '').replace(/\s+/g,' ').trim();
  const normalizedDictionary = new Map(Object.entries(dictionary).map(([key,value])=>[normalize(key),value]));
  function english(value) {
    const raw=String(value ?? '');
    if(Object.prototype.hasOwnProperty.call(dictionary,raw))return dictionary[raw];
    const trimmed=normalize(raw);
    if(normalizedDictionary.has(trimmed))return normalizedDictionary.get(trimmed);
    let match;
    if((match=trimmed.match(/^\/?\s*(\d+) 项已核对操作$/)))return `/ ${match[1]} verified actions`;
    if((match=trimmed.match(/^显示 (\d+) \/ (\d+) 项操作$/)))return `Showing ${match[1]} / ${match[2]} actions`;
    if((match=trimmed.match(/^再显示 (\d+) 项操作 · 余 (\d+) 项$/)))return `Show ${match[1]} more · ${match[2]} remaining`;
    if((match=trimmed.match(/^筛选触发键：(.*)$/)))return `Filter starting key: ${english(match[1])}`;
    if((match=trimmed.match(/^查看原始画面：(.*)$/)))return `View original image: ${english(match[1])}`;
    if((match=trimmed.match(/^(.*)：上一个状态$/)))return `Previous state: ${english(match[1])}`;
    if((match=trimmed.match(/^(.*)：下一个状态$/)))return `Next state: ${english(match[1])}`;
    if((match=trimmed.match(/^(.*)状态$/)))return `${english(match[1])} states`;
    if((match=trimmed.match(/^滚动，展开(.*)$/)))return `Scroll to explore ${english(match[1])}`;
    if((match=trimmed.match(/^前提 ·\s*(.*)$/)))return `Requires · ${english(match[1])}`;
    if((match=trimmed.match(/^(搜索|查找|同步输入|终端输入|输入)\s+(.*)$/)))return `${({'搜索':'Search for','查找':'Find','同步输入':'Type at all cursors:','终端输入':'Type in the terminal:','输入':'Type'})[match[1]]} ${match[2]}`;
    return raw;
  }
  function t(value) {return language==='en'?english(value):String(value ?? '');}
  function translatedText(raw) {
    if(language!=='en')return raw;
    const core=raw.trim();
    if(!core)return raw;
    const translated=english(core);
    return translated===core?raw:raw.slice(0,raw.indexOf(core))+translated+raw.slice(raw.indexOf(core)+core.length);
  }
  function updateText(node) {
    const parent=node.parentElement;
    if(!parent || parent.closest(textSkip))return;
    const current=node.nodeValue;
    let record=originals.get(node);
    // A renderer may replace a caption or result count without replacing its node.
    if(!record || current!==record.last)record={source:current,last:current};
    const next=translatedText(record.source);
    if(current!==next)node.nodeValue=next;
    record.last=next;
    originals.set(node,record);
  }
  function updateAttributes(element) {
    if(element.closest(attributeSkip))return;
    let records=attributes.get(element);
    if(!records){records=new Map();attributes.set(element,records);}
    const names=[...attributeNames];
    if(element.matches('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]'))names.push('content');
    for(const name of names) {
      const current=element.getAttribute(name);
      if(current===null){records.delete(name);continue;}
      let record=records.get(name);
      if(!record || current!==record.last)record={source:current,last:current};
      const next=t(record.source);
      if(current!==next)element.setAttribute(name,next);
      record.last=next;records.set(name,record);
    }
  }
  function setAttribute(element,name,value) {if(element.getAttribute(name)!==value)element.setAttribute(name,value);}
  function syncToggles() {
    document.querySelectorAll('[data-language-toggle]').forEach(button=>{
      const label=language==='en'?'中文':'English';
      const description=language==='en'?'切换到中文':'Switch to English';
      const text=button.querySelector('[data-language-label]')||button;
      if(text.textContent!==label)text.textContent=label;
      setAttribute(button,'aria-label',description);
      setAttribute(button,'title',description);
      setAttribute(button,'lang',language==='en'?'zh-CN':'en');
      button.dataset.currentLanguage=language;
    });
  }
  function observe() {
    observer?.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:[...attributeNames,'content']});
  }
  function apply(root=document.body) {
    if(!root)return;
    observer?.disconnect();
    try {
      if(root.nodeType===Node.TEXT_NODE)updateText(root);
      else {
        if(root.nodeType===Node.ELEMENT_NODE)updateAttributes(root);
        const elements=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);
        while(elements.nextNode())updateAttributes(elements.currentNode);
        const texts=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
        while(texts.nextNode())updateText(texts.currentNode);
      }
      syncToggles();
    } finally {observe();}
  }
  function scrollAnchor() {
    let anchor=null;
    document.querySelectorAll('main > section[id],.wf-feature').forEach(element=>{
      const box=element.getBoundingClientRect();
      if(box.top<=100&&box.bottom>100)anchor={element,top:box.top};
    });
    return anchor;
  }
  function setLanguage(value) {
    const next=value==='en'?'en':'zh';
    const anchor=scrollAnchor(),left=window.scrollX,top=window.scrollY;
    language=next;
    document.documentElement.lang=language==='en'?'en':'zh-CN';
    document.documentElement.dataset.language=language;
    try {localStorage.setItem('glow-language',language);} catch(_) {}
    try {const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(history.state,'',url);} catch(_) {}
    apply(document.documentElement);
    document.dispatchEvent(new CustomEvent('glow:languagechange',{detail:{language}}));
    // Keep the current section in place after text reflows and renderers update.
    requestAnimationFrame(()=>{
      const delta=anchor&&anchor.element.isConnected?anchor.element.getBoundingClientRect().top-anchor.top:0;
      window.scrollTo({left,top:top+delta,behavior:'instant'});
    });
    return language;
  }
  window.GlowLocale={get language(){return language;},setLanguage,apply,t};
  function initialize() {
    let saved='zh';
    try {saved=localStorage.getItem('glow-language') || 'zh';} catch(_) {}
    const requested=new URLSearchParams(location.search).get('lang');
    if(requested==='en'||requested==='zh')saved=requested;
    observer=new MutationObserver(()=>{
      if(queued)return;
      queued=true;
      requestAnimationFrame(()=>{queued=false;apply(document.documentElement);});
    });
    setLanguage(saved);
    document.addEventListener('click',event=>{
      const button=event.target instanceof Element?event.target.closest('[data-language-toggle]'):null;
      if(button){event.preventDefault();setLanguage(language==='en'?'zh':'en');}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
