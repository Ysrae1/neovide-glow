/* Manual diagnostic only. Records page-side causes, not WebKit Paint events. */
(() => {
  'use strict';
  if (window.GlowPhaseTrace) return;
  const LIMIT = 16000, DURATION = 90000;
  let active = false, began = 0, ended = 0, count = 0, dropped = 0;
  let buffer = [], sources = [], sourceIds = new Map(), urls = new Map();
  let styles = new WeakMap(), nodes = new WeakMap(), restores = [], timers = [];
  let observer, feature, story, group, button, sampleTimer, busy = false, lastSnapshot = -Infinity;
  const now = () => +(performance.now() - began).toFixed(2);
  function safe(value) {
    return String(value ?? '').replace(/(?:blob:|data:)[^\s"')]+/g, url => {
      if (!urls.has(url)) urls.set(url, `image-${urls.size + 1}`);
      return `<${urls.get(url)}>`;
    }).slice(0, 1000);
  }
  function add(type, data = {}) {
    if (!active) return;
    const item = { t: now(), type, ...data };
    buffer[count % LIMIT] = item;
    count++;
    if (count > LIMIT) dropped++;
  }
  function source(role, entry, property) {
    const key = `${role}/${entry}/${property}`;
    if (!sourceIds.has(key)) {
      const id = sources.length + 1;
      sourceIds.set(key, id);
      sources.push({ id, role, entry, property,
        stack: safe(new Error().stack).slice(0, 1000) });
    }
    return sourceIds.get(key);
  }
  function bind(node, role) {
    if (!node) return;
    nodes.set(node, role);
    if (node.style) styles.set(node.style, role);
  }
  function selectFeature() {
    const visibleRect = node => {
      if (!node) return null;
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight &&
        rect.right > 0 && rect.left < innerWidth && style.visibility !== 'hidden' &&
        Number.parseFloat(style.opacity) > 0 ? rect : null;
    };
    const candidates = [];
    for (const el of document.querySelectorAll('.wf-feature')) {
      const copy = el.querySelector('.wf-story');
      if (!copy?.classList.contains('is-revealed') || !el.querySelector('.wf-phases button')) continue;
      const copyStyle = getComputedStyle(copy);
      if (copyStyle.visibility === 'hidden' || !(Number.parseFloat(copyStyle.opacity) > 0)) continue;
      const controls = visibleRect(copy.querySelector('.wf-phases'));
      const text = visibleRect(copy), bounds = visibleRect(el);
      const rect = controls || text || bounds;
      if (!rect) continue;
      candidates.push({ el, priority: controls ? 0 : text ? 1 : 2,
        distance: Math.abs((rect.top + rect.bottom) / 2 - innerHeight / 2) });
    }
    candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
    return candidates[0]?.el;
  }
  function discover() {
    bind(feature, 'feature');
    story = feature.querySelector('.wf-story'); bind(story, 'story');
    group = story?.querySelector('.wf-phases'); bind(group, 'phases');
    const next = group?.querySelector('button[aria-pressed="true"]') ||
      group?.querySelector('button[data-phase="0"]');
    if (next !== button) {
      for (const node of [button, ...(button?.querySelectorAll('.cc-paint,.cc-fill,.cc-outer-shadow,.cc-vector') || [])]) {
        if (node) { nodes.delete(node); if (node.style) styles.delete(node.style); }
      }
      button = next; add('target', { present: !!button, featureId: feature.id,
        phase: button?.getAttribute('data-phase') ?? null });
    }
    bind(button, 'button');
    for (const [host, prefix] of [[group, 'phases'], [button, 'button']]) {
      const paint = host?.querySelector(':scope > .cc-paint'); bind(paint, `${prefix}.paint`);
      bind(paint?.querySelector(':scope > .cc-fill'), `${prefix}.fill`);
      bind(paint?.querySelector(':scope > .cc-outer-shadow'), `${prefix}.shadow`);
      bind(paint?.querySelector(':scope > svg.cc-vector'), `${prefix}.vector`);
    }
  }
  function patch(object, name, descriptor) {
    const original = Object.getOwnPropertyDescriptor(object, name);
    if (!original || !original.configurable) return;
    Object.defineProperty(object, name, { ...original, ...descriptor });
    restores.push(() => Object.defineProperty(object, name, original));
  }
  function owner(object, name) {
    for (let p = object; p; p = Object.getPrototypeOf(p)) {
      if (Object.prototype.hasOwnProperty.call(p, name)) return p;
    }
    return null;
  }
  function patchStyles() {
    for (const method of ['setProperty', 'removeProperty']) {
      const proto = owner(button.style, method), original = proto?.[method];
      if (!original) continue;
      patch(proto, method, { value: function (...args) {
        const role = active && styles.get(this);
        const before = role ? this.getPropertyValue(args[0]) : '';
        const result = original.apply(this, args);
        if (role && !busy) add('style', { role, entry: method, property: safe(args[0]),
          before: safe(before), after: safe(this.getPropertyValue(args[0])),
          source: source(role, method, String(args[0])) });
        return result;
      } });
    }
    const properties = ['cssText', 'background', 'backgroundColor', 'backgroundImage',
      'backgroundPosition', 'backgroundSize', 'backgroundBlendMode', 'backgroundRepeat',
      'backgroundOrigin', 'backgroundAttachment', 'opacity', 'clipPath', 'webkitClipPath',
      'backdropFilter', 'webkitBackdropFilter', 'transform', 'width', 'height', 'left', 'top',
      'display', 'visibility', 'color', 'webkitTextFillColor', 'boxShadow', 'filter',
      'zIndex', 'isolation', 'position', 'transition'];
    for (const property of properties) {
      const proto = owner(button.style, property);
      const descriptor = proto && Object.getOwnPropertyDescriptor(proto, property);
      if (!descriptor?.set) continue;
      patch(proto, property, { set: function (value) {
        const role = active && styles.get(this);
        const before = role && descriptor.get ? descriptor.get.call(this) : '';
        descriptor.set.call(this, value);
        if (role && !busy) add('style', { role, entry: 'setter', property,
          before: safe(before), after: safe(descriptor.get ? descriptor.get.call(this) : value),
          source: source(role, 'setter', property) });
      } });
    }
  }
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    restores.push(() => target.removeEventListener(type, handler, options));
  }
  function snapshot() {
    if (!active) return;
    const sampledAt = performance.now();
    if (sampledAt - lastSnapshot < 200) return;
    lastSnapshot = sampledAt;
    busy = true;
    try {
      const entries = [];
      for (const node of [feature, story, group, button,
        group?.querySelector(':scope > .cc-paint'),
        button?.querySelector(':scope > .cc-paint'),
        button?.querySelector(':scope > .cc-paint > .cc-fill')]) {
        if (!node) continue;
        const cs = getComputedStyle(node), r = node.getBoundingClientRect();
        const values = {};
        for (const property of ['opacity', 'background-color', 'background-image',
          'background-position', 'background-size', 'background-blend-mode', 'clip-path',
          'color', '-webkit-text-fill-color', 'filter', 'backdrop-filter', 'transform',
          'z-index', 'isolation', '--wf-stage-emphasis', '--brand-sample-position']) {
          values[property] = safe(cs.getPropertyValue(property));
        }
        entries.push({ role: nodes.get(node), connected: node.isConnected,
          rect: [r.x, r.y, r.width, r.height].map(v => +v.toFixed(3)), values });
      }
      add('snapshot', { scrollY, entries });
    } finally { busy = false; }
  }
  function stop() {
    if (!active) return report();
    add('stop'); console.timeStamp?.('GlowPhaseTrace stop'); ended = performance.now();
    active = false;
    observer?.disconnect(); observer = null;
    clearInterval(sampleTimer); sampleTimer = null;
    timers.forEach(clearTimeout); timers = [];
    restores.reverse().forEach(restore => restore()); restores = [];
    return report();
  }
  function report() {
    const length = Math.min(count, LIMIT), start = Math.max(0, count - LIMIT);
    return { active, performanceTimeOriginMs: performance.timeOrigin, startPerformanceNowMs: began,
      durationMs: +(active ? performance.now() - began : ended - began).toFixed(2),
      featureId: feature?.id || null,
      scope: 'Visible revealed feature selected at start, pressed button and its paint; ancestors for inherited geometry only',
      stackPolicy: 'Once per target role / write entry / property; not every call site',
      limitation: 'Page-side attributes and animation causes only; not browser Paint events',
      dropped, sources: sources.map(item => ({ ...item })),
      events: Array.from({ length }, (_, i) => buffer[(start + i) % LIMIT]) };
  }
  function start() {
    if (active) return { active: true };
    feature = selectFeature();
    if (!feature) throw new Error('No visible revealed phase scene is ready');
    buffer = []; count = dropped = 0; sources = []; sourceIds = new Map(); urls = new Map();
    styles = new WeakMap(); nodes = new WeakMap(); button = null;
    began = performance.now(); ended = began; lastSnapshot = -Infinity; active = true;
    try {
      discover(); patchStyles();
      const proto = owner(Element.prototype, 'animate'), original = proto?.animate;
      if (original) patch(proto, 'animate', { value: function (keyframes, options) {
        const animation = original.call(this, keyframes, options);
        const hasLeft = Array.isArray(keyframes) ? keyframes.some(k => Object.hasOwn(k, 'left')) :
          keyframes && Object.hasOwn(keyframes, 'left');
        if (active && story?.contains(this) && hasLeft) {
          const role = nodes.get(this) || (this.classList.contains('wf-alignment-run') ? 'alignment-run' : 'story-child');
          add('align-start', { role, duration: typeof options === 'number' ? options : options?.duration,
            source: source(role, 'animate', 'left') });
          for (const type of ['finish', 'cancel']) listen(animation, type, () => add(`align-${type}`, { role }), { once: true });
        }
        return animation;
      } });
      observer = new MutationObserver(changes => {
        for (const change of changes) {
          const role = nodes.get(change.target);
          if (change.type === 'childList') {
            if (role || group?.contains(change.target)) add('dom', { role: role || 'phase-child',
              added: change.addedNodes.length, removed: change.removedNodes.length });
          } else if (role) add('attribute', { role, name: change.attributeName,
            value: safe(change.target.getAttribute(change.attributeName)) });
        }
        discover();
      });
      observer.observe(feature, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['class', 'aria-pressed', 'disabled', 'inert', 'style'] });
      for (const type of ['glow:scrollactivity', 'glow:scrollidle']) listen(document, type, () => {
        add(type, { scrollY });
        if (type === 'glow:scrollidle') console.timeStamp?.('GlowPhaseTrace scroll idle');
      });
      add('start'); console.timeStamp?.('GlowPhaseTrace start'); snapshot();
      sampleTimer = setInterval(snapshot, 200); timers.push(setTimeout(stop, DURATION));
      return { active: true, maxDurationMs: DURATION, maxEvents: LIMIT };
    } catch (error) { stop(); throw error; }
  }
  window.GlowPhaseTrace = Object.freeze({ start, stop, report });
})();
