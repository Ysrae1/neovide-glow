/* Explicit local diagnosis only. Loading this file does nothing without ?ios-check=1. */
(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('ios-check') !== '1' || window.GlowIOSCheck) return;

  const start = () => {
    if (window.GlowIOSCheck) return;
    const startedAt = new Date().toISOString();
    const records = [], listeners = [], originals = new Map(), pending = new Set();
    const limit = 120;
    let background = 'A', collapsed = false, timer = 0, frame = 0, lastSample = -Infinity;
    const round = value => Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
    const short = value => String(value ?? '').slice(0, 160);
    const bounds = element => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: round(rect.x), top: round(rect.top), bottom: round(rect.bottom), width: round(rect.width), height: round(rect.height) };
    };
    const paint = element => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return { display: style.display, visibility: style.visibility, opacity: style.opacity,
        position: style.position, transform: short(style.transform), overflowY: style.overflowY,
        backgroundColor: style.backgroundColor, backgroundImage: short(style.backgroundImage) };
    };

    const panel = document.createElement('aside');
    panel.dataset.iosCheck = '';
    panel.setAttribute('aria-label', 'iOS 本地滚动诊断');
    panel.style.cssText = 'position:fixed;z-index:2147483646;top:calc(96px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:260px;max-width:calc(100vw - 64px);padding:8px;border:1px solid #7778;border-radius:14px;corner-shape:squircle;background:#171b22ed;color:#fff;box-shadow:0 3px 12px #0003;font:11px/1.45 ui-monospace,monospace;contain:layout style;';
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:5px;';
    const details = document.createElement('div');
    const readout = document.createElement('output');
    readout.style.cssText = 'display:block;white-space:pre-wrap;margin-top:6px;font-variant-numeric:tabular-nums;';
    const button = label => {
      const element = document.createElement('button');
      element.type = 'button';element.textContent = label;
      element.style.cssText = 'padding:4px 6px;border:1px solid #aabbcc66;border-radius:7px;corner-shape:squircle;background:#293240;color:#fff;font:11px/1.3 system-ui;cursor:pointer;';
      return element;
    };
    const a = button('A 原背景'), b = button('B 隐藏背景'), save = button('导出'), fold = button('收起');
    const steps = document.createElement('div');steps.style.cssText = 'display:flex;justify-content:center;gap:8px;margin-top:6px;';
    const up = button('↑ 半屏'), down = button('↓ 半屏');steps.append(up, down);
    up.addEventListener('click', () => scrollBy({top:-innerHeight*.65,behavior:'smooth'}));
    down.addEventListener('click', () => scrollBy({top:innerHeight*.65,behavior:'smooth'}));
    // Remove a candidate's renderer, not only its fixed position: WebKit may
    // retain a previously sampled edge while the old renderer stays visible.
    // Slots and article heights remain in place, preserving the failed scroll.
    const candidates = document.createElement('div');
    candidates.style.cssText = 'display:flex;justify-content:center;gap:5px;margin-top:6px;';
    const candidateStyle = document.createElement('style');
    candidateStyle.textContent = 'html[data-ios-hide-nav] .nav,html[data-ios-hide-legend] .wf-legend-anchor,html[data-ios-hide-story] .wf-sticky{display:none!important}';
    document.head.append(candidateStyle);
    for (const [key,label] of [['nav','导航'],['legend','快捷栏'],['story','内容']]) {
      const toggle = button(`隐藏${label}`);
      toggle.addEventListener('click', () => {
        const hidden = document.documentElement.toggleAttribute(`data-ios-hide-${key}`);
        toggle.textContent = `${hidden ? '恢复' : '隐藏'}${label}`;
        queue(`candidate:${key}:${hidden ? 'hidden' : 'visible'}`, true);
      });
      candidates.append(toggle);
    }
    toolbar.append(a, b, save, fold);details.append(steps,candidates,readout);panel.append(toolbar, details);document.body.append(panel);

    function snapshot(types = ['manual']) {
      const viewport = window.visualViewport;
      const scenes = [...document.querySelectorAll('#workflow-demo > .wf-feature')].map(element => {
        const story = element.querySelector('.wf-story'), image = element.querySelector('.wf-visual');
        const copyBounds = bounds(story), imageBounds = bounds(image), featureBounds = bounds(element);
        const copyVisible = copyBounds && copyBounds.bottom > 0 && copyBounds.top < innerHeight;
        const imageVisible = imageBounds && imageBounds.bottom > 0 && imageBounds.top < innerHeight;
        const visible = copyVisible || imageVisible || (featureBounds.bottom > 0 && featureBounds.top < innerHeight);
        return { element, story, image, copyBounds, imageBounds, visible,
          distance: Math.abs((copyBounds?.top || 0) + (copyBounds?.height || 0) / 2 - innerHeight / 2) };
      }).filter(scene => scene.visible).sort((left, right) => left.distance - right.distance).slice(0, 2).map(scene => {
        const element = scene.element;
        const complete = element.getAttribute('data-entry-complete') ?? scene.story?.getAttribute('data-entry-complete');
        return { id: element.id, phase: short(element.querySelector('[data-phase][aria-pressed="true"]')?.textContent?.trim()),
          revealed: !!scene.story?.classList.contains('is-revealed'),
          // The current implementation keeps this in a closure. Unknown is
          // explicit; media-ready is not fabricated into an entrance result.
          entryComplete: complete === null || complete === undefined ? null : complete === 'true',
          mediaReady: element.dataset.mediaReady ?? null, stacked: element.classList.contains('wf-stacked'),
          flow: element.classList.contains('wf-flow'), copy: scene.copyBounds, image: scene.imageBounds,
          copyStyle: paint(scene.story), imageStyle: paint(scene.image),
          titleStyle: paint(scene.story?.querySelector('h3')),
          runningAnimations: scene.story?.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length ?? null };
      });
      const root = document.documentElement;
      return { ms: round(performance.now()), types, background, scrollY: round(scrollY), innerHeight,
        innerWidth, visualViewport: viewport ? { height: round(viewport.height), width: round(viewport.width),
          offsetTop: round(viewport.offsetTop), pageTop: round(viewport.pageTop), scale: round(viewport.scale) } : null,
        visibility: document.visibilityState, motion: root.dataset.motion ?? null, theme:root.dataset.theme,
        field: {status:root.dataset.brandField ?? null,width:document.getElementById('brand-field-source')?.width,height:document.getElementById('brand-field-source')?.height},
        prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        safeTop: short(getComputedStyle(root).getPropertyValue('--brand-safe-top')),
        html: paint(root), body: paint(document.body), nav: { bounds: bounds(document.querySelector('.nav')), style: paint(document.querySelector('.nav')) },
        backdrop: paint(document.getElementById('brand-field-backdrop')), veil: paint(document.getElementById('brand-field-veil')),
        scenes };
    }

    function collect() {
      frame = 0;timer = 0;
      const sample = snapshot([...pending]);pending.clear();lastSample = performance.now();
      records.push(sample);if (records.length > limit) records.shift();
      const viewport = sample.visualViewport;
      readout.textContent = `${background} · ${sample.motion} · ${sample.theme} · y ${sample.scrollY} · H ${sample.innerHeight}\n${sample.field.status} ${sample.field.width}×${sample.field.height}\nroot ${sample.html?.backgroundColor ?? '—'}\nveil ${sample.veil?.backgroundColor ?? '—'}\nVV ${viewport?.height ?? '—'} · top ${viewport?.offsetTop ?? '—'} · ${sample.visibility}\n${sample.scenes.map(scene => `${scene.id.replace('feature-', '')}: ${scene.phase} · ready ${scene.mediaReady}`).join('\n')}`;
      a.setAttribute('aria-pressed', String(background === 'A'));b.setAttribute('aria-pressed', String(background === 'B'));
    }
    function queue(type, immediate = false) {
      pending.add(type);
      if (immediate) {
        clearTimeout(timer);cancelAnimationFrame(frame);timer = 0;frame = 0;collect();return;
      }
      if (timer || frame) return;
      const wait = Math.max(0, 100 - (performance.now() - lastSample));
      if (wait) timer = setTimeout(() => { timer = 0;frame = requestAnimationFrame(collect); }, wait);
      else frame = requestAnimationFrame(collect);
    }
    function setBackground(mode) {
      if (mode !== 'A' && mode !== 'B') return;
      background = mode;
      const earlyStyle = document.getElementById('ios-early-background-test');if (earlyStyle) earlyStyle.disabled = mode === 'A';
      for (const id of ['brand-field-backdrop', 'brand-field-veil']) {
        const element = document.getElementById(id);if (!element) continue;
        if (!originals.has(element)) originals.set(element, { value: element.style.getPropertyValue('display'), priority: element.style.getPropertyPriority('display') });
        if (mode === 'B') element.style.setProperty('display', 'none', 'important');
        else {
          const original = originals.get(element);
          if (original.value) element.style.setProperty('display', original.value, original.priority);
          else element.style.removeProperty('display');
        }
      }
      queue(`background:${mode}`, true);
    }
    function exportJSON() {
      queue('export', true);
      return JSON.stringify({ version: 1, startedAt, page: `${location.origin}${location.pathname}`,
        userAgent: navigator.userAgent, viewportMeta: document.querySelector('meta[name="viewport"]')?.content ?? null,
        entryCompleteObservable: !!document.querySelector('#workflow-demo [data-entry-complete]'),
        limit, samples: records }, null, 2);
    }
    function download() {
      const url = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' }));
      const link = document.createElement('a');link.href = url;link.download = `ios-scroll-${Date.now()}.json`;
      link.click();setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    a.addEventListener('click', () => setBackground('A'));b.addEventListener('click', () => setBackground('B'));
    save.addEventListener('click', download);
    fold.addEventListener('click', () => {
      collapsed = !collapsed;details.hidden = collapsed;
      a.hidden = collapsed;b.hidden = collapsed;save.hidden = collapsed;
      fold.textContent = collapsed ? '诊断 ▾' : '收起';panel.style.width = collapsed ? 'max-content' : '260px';
    });
    function listen(target, name, label = name) {
      if (!target) return;
      const handler = () => queue(label, name === 'visibilitychange' || name === 'glow:motionchange');
      target.addEventListener(name, handler, { passive: true });listeners.push([target, name, handler]);
    }
    listen(window, 'scroll');listen(window, 'resize');
    listen(window.visualViewport, 'scroll', 'visualViewport:scroll');listen(window.visualViewport, 'resize', 'visualViewport:resize');
    listen(document, 'visibilitychange');listen(document, 'glow:motionchange');listen(document, 'glow:mediavisibilitychange');
    window.GlowIOSCheck = { snapshot: () => snapshot(), exportJSON, download, setBackground,
      get records() { return records.slice(); },
      destroy() {
        setBackground('A');clearTimeout(timer);cancelAnimationFrame(frame);
        for (const key of ['nav','legend','story']) document.documentElement.removeAttribute(`data-ios-hide-${key}`);
        candidateStyle.remove();
        listeners.forEach(([target, name, handler]) => target.removeEventListener(name, handler));
        panel.remove();delete window.GlowIOSCheck;
      } };
    if (new URLSearchParams(location.search).get('ios-bg') === 'B') setBackground('B');
    queue('start', true);
  };
  if (document.body) start();else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
