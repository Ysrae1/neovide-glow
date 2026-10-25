/* Handbook-only copy and navigation; filtering remains in handbook.js. */
(() => {
  'use strict';
  if (!document.body.hasAttribute('data-manual-page')) return;
  window.GLOW_PAGE_EN ||= {dictionary:{}};
  window.GLOW_PAGE_EN.dictionary ||= {};
  Object.assign(window.GLOW_PAGE_EN.dictionary, {
    '快捷键手册 — Neovide Glow':'Shortcut handbook — Neovide Glow',
    'Neovide Glow 完整快捷键手册：查询 296 项操作，按触发键、功能、场景、模式和平台筛选。':'The complete Neovide Glow shortcut handbook. Search 296 actions by starting key, feature, context, mode, and platform.',
    '快捷键手册':'Shortcut handbook',
    '返回产品页':'Back to product',
    '平台说明':'platform details',
    '手册依据 10 月 23 日冻结配置盘点，包含全部 296 项操作。平台筛选表示配置入口适用范围；公开下载与实际验收状态请查看':'This guide includes all 296 actions from the October 23 configuration snapshot. Platform filters describe configuration availability. For downloads and actual validation status, see the ',
    '。':'.',
    '清单未能载入。请刷新页面，或查看':'The list could not be loaded. Refresh the page or read the ',
    '完整快捷键数据':'complete shortcut data'
  });
  const root=document.documentElement;
  const toggle=document.getElementById('theme-toggle');
  const meta=document.querySelector('meta[name="theme-color"]');
  function syncTheme() {
    const light=root.dataset.theme==='light';
    const english=root.lang==='en';
    const label=english?(light?'Switch to dark appearance':'Switch to light appearance'):(light?'切换深色外观':'切换浅色外观');
    toggle.setAttribute('aria-label',label);
    toggle.title=label;
    meta.content=light?'#f3f6fb':'#07090d';
  }
  function syncLanguageLinks() {
    const language=root.lang==='en'?'en':'zh';
    document.querySelectorAll('[data-product-link]').forEach(link=>{
      const url=new URL(link.getAttribute('href'),location.href);
      url.searchParams.set('lang',language);
      link.href=`index.html${url.search}${url.hash}`;
    });
    document.querySelectorAll('[data-shortcut-data-link]').forEach(link=>{
      link.href=language==='en'?'assets/shortcuts-en.json':'assets/shortcuts.json';
    });
    syncTheme();
  }
  toggle.addEventListener('click',()=>{
    root.dataset.theme=root.dataset.theme==='light'?'dark':'light';
    try { localStorage.setItem('glow-theme',root.dataset.theme); } catch (_) {}
    syncTheme();
  });
  document.addEventListener('glow:languagechange',syncLanguageLinks);
  const nav=document.querySelector('.nav');
  const syncNav=()=>nav.classList.toggle('is-scrolled',window.scrollY>16);
  window.addEventListener('scroll',syncNav,{passive:true});
  syncNav();
  syncLanguageLinks();
})();
