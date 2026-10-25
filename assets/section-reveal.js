(() => {
  'use strict';
  const selector = [
    '#cmatrix .cmatrix-card',
    '#handbook .section-head', '#handbook .quick-links',
    '#platforms .section-head', '#platforms .platform-detail', '#platforms > .requirements',
    '#download .section-head', '#download .card', '#download > .requirements'
  ].join(',');
  const owners = [...document.querySelectorAll(selector)];
  if (!owners.length || !('IntersectionObserver' in window) || !Element.prototype.animate) return;

  const root = document.documentElement;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => preference.matches || root.dataset.motion === 'reduce';
  const records = new Map();
  let queued = false;
  let lastScrollY = scrollY, lastWidth = innerWidth, lastHeight = innerHeight, scrollDirection = 0;

  function content(element) {
    if (element.matches('.section-head')) {
      return [...element.querySelectorAll('.section-kicker, h2, p:not(.section-kicker), .release-link')];
    }
    if (element.matches('.quick-links')) return [...element.children];
    if (element.matches('.card')) return [...(element.querySelector('.card-body') || element).children, ...element.querySelectorAll(':scope > .rain')];
    if (element.matches('p, h2, h3, .requirements')) return [];
    return [...element.children];
  }

  function settle(record) {
    record.animations.forEach(animation => animation.cancel());
    record.animations.length = 0;
    record.element.dataset.sectionRevealUnit = 'shown';
    delete record.element.dataset.sectionRevealSelf;
    record.parts.forEach(part => { part.dataset.sectionRevealPart = 'shown'; });
    record.state = 'shown';
    observer.unobserve(record.element);
  }

  function reveal(record, immediate = false) {
    if (record.state !== 'pending') return;
    if (immediate || reduced()) { settle(record); return; }
    const element = record.element;
    const revision = ++record.revision;
    record.state = 'playing';
    element.dataset.sectionRevealUnit = 'shown';
    delete element.dataset.sectionRevealSelf;
    observer.unobserve(element);
    const keep = animation => { record.animations.push(animation); return animation; };
    keep(element.animate([
      { transform: 'translate3d(0,24px,0)' }, { transform: 'translate3d(0,0,0)' }
    ], { duration: 700, easing: 'cubic-bezier(.16,.8,.22,1)' }));
    if (record.parts.length) keep(element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 520, easing: 'cubic-bezier(.3,0,.6,1)'
    }));
    const parts = record.parts.length ? record.parts : [element];
    const positions = parts.map(part => ({ part, top: part.getBoundingClientRect().top }));
    positions.sort((a, b) => a.top - b.top);
    positions.forEach(({ part }, index) => {
      part.dataset.sectionRevealPart = 'shown';
      const delay = index * 55;
      keep(part.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 520, delay, easing: 'cubic-bezier(.3,0,.6,1)', fill: 'backwards'
      }));
      if (part !== element) keep(part.animate([
        { transform: 'translate3d(0,8px,0)' }, { transform: 'translate3d(0,0,0)' }
      ], { duration: 620, delay, easing: 'cubic-bezier(.12,.9,.18,1)', fill: 'backwards' }));
    });
    // Finished effects need no retained fill state; language updates do not restart them.
    Promise.allSettled(record.animations.map(animation => animation.finished)).then(() => {
      if (record.state === 'playing' && record.revision === revision) settle(record);
    });
  }

  function check(state, boxes) {
    records.forEach(record => {
      const bounds=boxes.get(record);if(!bounds)return;
      if(state.reduced){settle(record);return;}
      if(record.state==='playing'&&bounds.bottom<=0)settle(record);
      if(record.state!=='pending'&&state.direction<0&&bounds.top>state.visualTop+state.visualHeight+1)rearm(record);
      if(record.state!=='pending')return;
      if(bounds.bottom<=88||(state.direction<0&&bounds.top<state.visualHeight))reveal(record,true);
      else if(bounds.top<=state.height*.8)reveal(record);
    });
  }
  const request=()=>window.GlowViewport.request();
  window.GlowViewport.subscribe({
    measure:()=>new Map([...records.values()].map(record=>[record,record.element.getBoundingClientRect()])),
    commit:check
  },20);

  const observer = new IntersectionObserver(request, { rootMargin: '0px 0px -20% 0px', threshold: 0 });

  function prepare(element) {
    const parts = content(element);
    const record = { element, parts, state: 'pending', animations: [], revision: 0, motionState: null };
    records.set(element, record);
    element.dataset.sectionRevealUnit = 'pending';
    if (parts.length) parts.forEach(part => { part.dataset.sectionRevealPart = 'pending'; });
    else element.dataset.sectionRevealSelf = 'pending';
    observer.observe(element);
  }
  function rearm(record) {
    record.revision++;
    record.animations.forEach(animation => animation.cancel());record.animations.length = 0;
    record.state = 'pending';record.element.dataset.sectionRevealUnit = 'pending';
    if (record.parts.length) record.parts.forEach(part => { part.dataset.sectionRevealPart = 'pending'; });
    else record.element.dataset.sectionRevealSelf = 'pending';
    observer.observe(record.element);
  }

  try {
    owners.forEach(owner => {
      owner.dataset.sectionRevealOwner = '';
      // A tall grid is a collection of entrances. Its offscreen rows retain their animation.
      const parts = content(owner);
      if (owner.getBoundingClientRect().height > innerHeight * .66 && parts.length > 1) {
        parts.forEach(prepare);
      } else prepare(owner);
    });
    if (reduced()) records.forEach(record => { record.motionState = record.state;settle(record); });
    else request();
  } catch (_) {
    // A failed initialization must leave useful links and text accessible.
    records.forEach(settle);
    owners.forEach(owner => owner.classList.add('is-visible'));
  }


  const motionChanged = () => {
    if (reduced()) records.forEach(record => {
      if (record.motionState === null) record.motionState = record.state;
      settle(record);
    });
    else {
      records.forEach(record => {
        const bounds = record.element.getBoundingClientRect();
        // Preserve completed entrances across the preference toggle. Only an
        // untouched row still below the viewport resumes its pending entrance.
        if (record.motionState === 'pending' && bounds.top > innerHeight + 40) rearm(record);
        else settle(record);
        record.motionState = null;
      });
      request();
    }
  };
  preference.addEventListener('change', motionChanged);
  document.addEventListener('glow:motionchange', motionChanged);
  document.addEventListener('focusin', event => {
    records.forEach(record => {
      if (record.element.contains(event.target)) settle(record);
    });
  });
})();
