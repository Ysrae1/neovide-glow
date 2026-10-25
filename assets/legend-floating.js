/* One component and permanent flow slot: plain at its origin, glass while pinned. */
(() => {
  'use strict';
  const legend = document.querySelector('.wf-legend');
  const main = document.querySelector('main');
  const section = legend?.closest('main > section');
  const summary = legend?.querySelector('.wf-legend-toggle');
  const content = legend?.querySelector('p');
  const viewport = window.GlowViewport;
  if (!legend || !main || !section || !summary || !content || !viewport) return;

  // Fixed placement uses the navigation's CSS offset, while the entrance
  // threshold uses its visible bounds. Keeping these coordinates separate
  // avoids counting Safari's changing visual viewport offset twice.
  const nav = document.querySelector('.nav');
  const anchor = document.createElement('div');
  anchor.className = 'wf-legend-anchor';
  const slot = document.createElement('div');
  slot.className = 'wf-legend-slot';
  // The slot always reserves the full bilingual height. Its child switches
  // positioning in place and remains pinned through main's footer boundary.
  const origin = document.createElement('div');
  origin.className = 'wf-legend-origin';
  origin.setAttribute('aria-hidden', 'true');
  section.before(origin, slot);
  slot.append(anchor);
  anchor.append(legend);
  legend.classList.add('is-visible');
  legend.classList.remove('is-floating');
  legend.removeAttribute('data-reveal');
  legend.dataset.noTranslate = '';
  legend.dataset.floating = 'false';
  const chinese = '␣ 空格（Space） · ⌘ Command · ⌃ Control · ⌥ Option/Alt · ⇧ Shift · ↩ 回车 · ⇥ Tab · ⎋ Esc。字母依次输入，修饰键与下一键同时按下。';
  const english = window.GLOW_PAGE_EN?.dictionary?.[chinese] || '␣ Space · ⌘ Command · ⌃ Control · ⌥ Option/Alt · ⇧ Shift · ↩ Return · ⇥ Tab · ⎋ Esc. Type letters in sequence; hold modifiers with the next key.';
  const line = document.createElement('span');
  line.className = 'legend-symbols-line';
  content.replaceChildren(line);
  summary.textContent = '';
  const title = document.createElement('span');
  title.className = 'legend-inline-title';
  summary.append(title);
  summary.insertAdjacentHTML('beforeend', '<svg class="legend-shortcut-bolt" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.83 2.92c.2-.25.6-.04.54.28l-1.09 6.04h4.92c.58 0 .86.69.45 1.09l-8.18 10.58c-.26.33-.78.1-.71-.32l1.18-7.06h-5.2c-.59 0-.88-.69-.47-1.1Z"/></svg><svg class="legend-collapse-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.4 7.6q-.9-.6-.9.4v8q0 1 .9.4l5.8-3.8q.9-.6 0-1.2Z"/></svg>');
  legend.insertAdjacentHTML('beforeend', '<span class="legend-expanded-bolt" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M13.83 2.92c.2-.25.6-.04.54.28l-1.09 6.04h4.92c.58 0 .86.69.45 1.09l-8.18 10.58c-.26.33-.78.1-.71-.32l1.18-7.06h-5.2c-.59 0-.88-.69-.47-1.1Z"/></svg></span>');

  // These independent, inert text probes never acquire a glass/corner surface.
  // Both languages share the larger height, including after a language switch.
  const probe = document.createElement('div');
  probe.className = 'legend-measure';
  probe.dataset.noTranslate = '';
  probe.dataset.storyMeasure = '';
  probe.setAttribute('aria-hidden', 'true');
  probe.inert = true;
  const variants = ['zh-CN', 'en'].map((language, index) => {
    const item = document.createElement('p');
    item.lang = language;
    item.textContent = index ? english : chinese;
    probe.append(item);
    return item;
  });
  document.body.append(probe);

  // Only the floating preference starts collapsed; the inline explanation
  // remains expanded independently and does not reset later user choices.
  let open = false;
  let floating = false;
  let pendingToggle = false;
  let animation = null;
  let dimensions = null;
  let lastGeometry = null;
  let measurementKey = '';
  let maximumHeight = 40;
  let inlineHeight = 40;
  let fontRevision = 0;
  const clamp = value => Math.min(1, Math.max(0, value));
  const ease = progress => {
    const cubic = (t, a, b) => 3 * (1-t) * (1-t) * t * a + 3 * (1-t) * t * t * b + t*t*t;
    let low = 0, high = 1;
    for (let i = 0; i < 18; i++) {
      const middle = (low + high) / 2;
      if (cubic(middle, .16, .22) < progress) low = middle; else high = middle;
    }
    return cubic((low + high) / 2, .8, 1);
  };
  function localize() {
    const en = document.documentElement.lang === 'en';
    line.textContent = en ? english : chinese;
    title.textContent = en ? 'Shortcut symbols' : '快捷键符号';
    const label = !floating ? title.textContent : en ? (open ? 'Collapse shortcut symbols' : 'Expand shortcut symbols') : (open ? '收起快捷键符号' : '展开快捷键符号');
    summary.setAttribute('aria-label', label);
    summary.title = label;
  }
  function measure(state) {
    const bar = nav?.getBoundingClientRect();
    const style = getComputedStyle(legend);
    const navPositionOwner = nav?.closest('.nav-anchor') || nav;
    const cssNavTop = navPositionOwner ? parseFloat(getComputedStyle(navPositionOwner).top) : 14;
    const fixedTop = (Number.isFinite(cssNavTop) ? cssNavTop : 14) + (bar?.height || 58) + 10;
    const diameter = Math.max(32, parseFloat(style.getPropertyValue('--nav-rest-height')) || 40);
    const width = Math.max(diameter, bar?.width || Math.min(1160, state.width - 32));
    const key = `${width}/${diameter}/${fontRevision}`;
    if (key !== measurementKey) {
      // Writes are confined to the offscreen probes, never the live control.
      probe.style.width = `${Math.max(1, width - 2 * diameter)}px`;
      probe.style.font = style.font;
      maximumHeight = Math.max(diameter, ...variants.map(item => Math.ceil(item.getBoundingClientRect().height) + 18));
      probe.style.width = `${Math.min(740, width)}px`;
      inlineHeight = Math.max(...variants.map(item => Math.ceil(item.getBoundingClientRect().height))) + 28;
      measurementKey = key;
    }
    return { width, diameter, height: maximumHeight, inlineHeight, reservedHeight: Math.max(maximumHeight, inlineHeight),
      top: (bar?.bottom || 72) + 10, fixedTop, documentTop: origin.getBoundingClientRect().bottom + state.y };
  }
  const attribute = (element, name, value) => {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  };
  const paint = (element, property, value) => {
    if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
  };
  // The first story's anchor starts at its text-only midpoint. A completed
  // image can extend above that original footprint when scrolling back.
  // Reserve the full pair's overhang from the outset, independently of entry
  // progress, so both visits retain the gallery's existing 96px content gap.
  const firstFeature = section.querySelector('.wf-feature');
  let clearanceRevision = -1;
  let contentClearance = 0;
  viewport.subscribe({
    phase: 'paint',
    measure(state) {
      if (!firstFeature || clearanceRevision === state.layoutRevision) return null;
      const layout = window.GlowFeatureStories?.layout;
      const id = firstFeature.id.replace(/^feature-/, '');
      const pairHeight = layout?.pairHeights[id];
      const anchorOffset = parseFloat(firstFeature.style.getPropertyValue('--wf-anchor-offset'));
      const center = Number(firstFeature.dataset.readingCenter);
      if (!Number.isFinite(pairHeight) || !Number.isFinite(anchorOffset) || !Number.isFinite(center)) return null;
      const finalTop = !state.reduced && layout.stacked ? layout.top - center : -pairHeight / 2;
      return { revision: state.layoutRevision, clearance: Math.max(0, -(anchorOffset + finalTop)) };
    },
    commit(state, measured) {
      if (!measured) return;
      clearanceRevision = measured.revision;
      if (Math.abs(contentClearance - measured.clearance) < .01) return;
      contentClearance = measured.clearance;
      paint(slot, '--legend-content-clearance', `${contentClearance}px`);
      // One reflow integrates the fixed gap. Its own value depends only on
      // dimensions, never on document positions, so invalidation converges.
      viewport.invalidate('legend-content-clearance');
    }
  }, 10);
  function commit(state, geometry) {
    const layoutChanged = !lastGeometry || lastGeometry.width !== geometry.width || lastGeometry.height !== geometry.height || lastGeometry.diameter !== geometry.diameter;
    const shouldFloat = state.y + geometry.top >= geometry.documentTop;
    const placementChanged = floating !== shouldFloat;
    if (placementChanged) {
      floating = shouldFloat;
      legend.classList.toggle('is-floating', floating);
      legend.dataset.floating = String(floating);
      anchor.classList.toggle('is-viewport-floating', floating);
      animation = null;
      pendingToggle = false;
      localize();
    }
    const expanded = !floating || open;
    legend.toggleAttribute('data-open', expanded);
    attribute(summary, 'aria-expanded', String(expanded));
    attribute(summary, 'aria-disabled', String(!floating));
    attribute(summary, 'tabindex', floating ? '0' : '-1');
    attribute(content, 'aria-hidden', String(!expanded));
    const target = { width: expanded ? geometry.width : geometry.diameter,
      height: floating ? (open ? geometry.height : geometry.diameter) : geometry.inlineHeight, morph: expanded ? 1 : 0 };
    if (pendingToggle) {
      pendingToggle = false;
      const from = dimensions || target;
      animation = state.reduced ? null : { from: { ...from }, target, start: state.now };
    } else if (layoutChanged && animation) {
      // Responsive remeasurement retargets once; toolbar height does not affect
      // the width or reserved height and therefore cannot restart this motion.
      animation = { from: { ...dimensions }, target, start: state.now };
    }
    if (state.reduced || !floating || placementChanged) animation = null;
    let output = target;
    if (animation) {
      const progress = clamp((state.now - animation.start) / 360);
      const t = progress === 1 ? 1 : ease(progress);
      output = Object.fromEntries(['width', 'height', 'morph'].map(key => [key, animation.from[key] + (animation.target[key] - animation.from[key]) * t]));
      if (progress === 1) animation = null;
      else viewport.request('legend-animation');
    }
    paint(slot, 'height', `${geometry.reservedHeight}px`);
    paint(anchor, 'top', floating ? `${geometry.fixedTop}px` : '0px');
    // Only the position anchor is fixed. Its border box stays empty so WebKit
    // cannot classify the full glass surface as a viewport-width banner.
    paint(anchor, 'width', floating ? '0px' : `${geometry.width}px`);
    paint(anchor, 'height', floating ? '0px' : `${geometry.reservedHeight}px`);
    paint(legend, '--legend-bar-width', `${geometry.width}px`);
    paint(legend, '--legend-diameter', `${geometry.diameter}px`);
    paint(legend, '--legend-open-height', `${geometry.height}px`);
    paint(legend, 'width', `${output.width}px`);
    paint(legend, 'max-width', `${output.width}px`);
    paint(legend, 'height', `${output.height}px`);
    paint(legend, '--legend-morph', String(output.morph));
    dimensions = { ...output, diameter: geometry.diameter };
    lastGeometry = geometry;
    if(layoutChanged)viewport.invalidate('legend-reservation');
  }
  summary.addEventListener('click', () => {
    if (!floating) return;
    open = !open;
    localize();
    pendingToggle = true;
    viewport.request('legend-toggle');
  });
  document.addEventListener('glow:languagechange', () => { localize(); viewport.request('legend-language'); });
  document.fonts?.ready.then(() => { fontRevision++; viewport.invalidate('legend-fonts'); });
  new ResizeObserver(() => viewport.request('legend-nav-size')).observe(nav || anchor);
  localize();
  viewport.subscribe({ measure, commit }, 10);
  viewport.invalidate('legend-ready');
})();
