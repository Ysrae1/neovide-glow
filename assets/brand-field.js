/* One WebGL field, one mirrored frame texture, one document coordinate system.
 * CSS keeps real text/shape masks; every opening samples the same decoded frame.
 */
import { createColourField } from './field-renderer.js?v=20261025-hero-shadow1';
import { FIELD_PRESET } from './field-preset.js?v=20261025-hero-shadow1';
import { createPhaseFlatFill } from './phase-flat-fill.js?v=20261025-document-field1';
import { createTextShadowContrast } from './text-shadow-contrast.js?v=shadow-20261026';

const root = document.documentElement;
const updateTextShadowContrast = createTextShadowContrast();
let shadowMaterialKey = '', shadowVeil = '';
// The field belongs to document coordinates; scrolling never moves its host.
const viewportController = window.GlowViewport;
let viewportState = viewportController?.state || {x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,visualHeight:innerHeight};
const canvas = document.createElement('canvas');
canvas.id = 'brand-field-source';
canvas.hidden = true;
canvas.setAttribute('aria-hidden', 'true');
const backdrop = document.createElement('div');
backdrop.id = 'brand-field-backdrop';
backdrop.setAttribute('aria-hidden', 'true');
const veil = document.createElement('div');
veil.id = 'brand-field-veil';
veil.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas, backdrop, veil);
root.classList.add('brand-field-integrated');

// The noise remains a full-resolution, document-anchored layer, shared by every
// opening; it is not blurred/downsampled into the small WebGL colour texture.
const grainSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 0"/></filter><rect width="100%" height="100%" opacity="${FIELD_PRESET.grain}" filter="url(#n)"/></svg>`;
root.style.setProperty('--brand-grain-image', `url("data:image/svg+xml,${encodeURIComponent(grainSvg)}")`);
root.style.setProperty('--brand-grain-size', `${180 * FIELD_PRESET.grainSize}px`);
root.style.setProperty('--brand-field-image', `linear-gradient(120deg,${FIELD_PRESET.colours[0]},${FIELD_PRESET.colours[1]},${FIELD_PRESET.colours[3]})`);

const records = new Map();
const visible = new Set();
const active = new Set();
const pendingSamples = new Set();
let publishedImage = '', decodedFrame = null, phaseFlatFill;
let publishedViewport = Object.freeze({width:viewportState.width,height:viewportState.height,
  frameWidth:viewportState.width,frameHeight:viewportState.height*2,left:0,top:0,repeatY:true});
// At the first document edge Safari can expose a native, solid under-page
// fill. WebKit excludes background images from that fill. Supply a colour
// derived from this same decoded frame; this is a tint fallback, not texture.
const underpageCanvas = matchMedia('(any-pointer: coarse)').matches ? document.createElement('canvas') : null;
if (underpageCanvas) { underpageCanvas.width = 16;underpageCanvas.height = 1; }
const underpageContext = underpageCanvas?.getContext('2d', {willReadFrequently:true});
const underpageBlend = underpageContext ? document.createElement('div') : null;
if (underpageBlend) {
  underpageBlend.id = 'brand-underpage-blend';
  underpageBlend.setAttribute('aria-hidden', 'true');
  document.body.prepend(underpageBlend);
}
let underpageMaterialKey = '', underpageVeil = '', underpageColour = '', underpageFailed = false;
function updateUnderpageColour(decoded, viewport) {
  if (!underpageContext || !decoded || underpageFailed) return;
  try {
    const key = `${root.dataset.theme}/${root.dataset.glassTransparency}`;
    if (key !== underpageMaterialKey) {
      underpageVeil = getComputedStyle(root).getPropertyValue('--brand-glass-veil').trim();
      underpageMaterialKey = key;
    }
    const scale = decoded.naturalHeight / viewport.frameHeight;
    // Native browser chrome can use a solid fallback rather than the image.
    // Match the document's first field band, composited with the single tint.
    const y = Math.max(0, (-viewport.top - 24) * scale);
    const bottom = Math.min(decoded.naturalHeight, (-viewport.top + 24) * scale);
    underpageContext.clearRect(0, 0, 16, 1);
    underpageContext.filter = 'saturate(1.05)';
    underpageContext.drawImage(decoded, 0, y, decoded.naturalWidth, Math.max(1, bottom-y), 0, 0, 16, 1);
    underpageContext.filter = 'none';
    underpageContext.fillStyle = underpageVeil;
    underpageContext.fillRect(0, 0, 16, 1);
    const pixels = underpageContext.getImageData(0, 0, 16, 1).data;
    const sum = [0, 0, 0];
    for (let offset = 0; offset < pixels.length; offset += 4) {
      for (let channel = 0; channel < 3; channel++) sum[channel] += pixels[offset+channel];
    }
    const colour = `rgb(${sum.map(value => Math.round(value/16)).join(', ')})`;
    if (colour !== underpageColour) {
      root.style.setProperty('--brand-underpage-color', colour);
      underpageBlend.style.setProperty('--brand-underpage-tint', colour);
      underpageColour = colour;
    }
  } catch {
    // A native tint fallback must never interrupt frame publication.
    underpageFailed = true;
  }
}
let underpageDirty=false;
new MutationObserver(() => {
  underpageMaterialKey='';underpageDirty=true;scheduleGeometry();
}).observe(root,{attributes:true,attributeFilter:['data-theme','data-glass-transparency']});
backdrop.style.setProperty('--brand-sample-size', `${innerWidth}px ${innerHeight}px`);
backdrop.style.setProperty('--brand-sample-position', '0px 0px');
let geometryPasses = 0, frameStyleWrites = 0;
let sampleId = 0, geometryFrame = 0, movingUntil = 0;
let nextMotionScan = 0, geometryAnimations = [];
let prewarmDistance = 0, intersectionObserver;
let coverageScans = 0, coverageY = NaN, coverageX = NaN, coverageDirty = true;
const horizontalPrewarm = 120;
function measureFieldViewport() {
  return {width:viewportState.width,height:viewportState.height};
}
function updateEdgeGeometry() {
  // Repeated mirrored cells cover the entire root canvas at every scroll offset.
  // The only size changes are committed with a newly decoded immutable frame.
  root.style.setProperty('--brand-edge-size', `${publishedViewport.frameWidth}px ${publishedViewport.frameHeight}px`);
}
const paintOnlyKeys = new Set(['offset', 'computedOffset', 'easing', 'composite',
  'opacity', 'color', 'backgroundColor', 'backgroundImage', 'backgroundPosition',
  'borderColor', 'boxShadow', 'textShadow', 'filter', 'backdropFilter', 'webkitBackdropFilter']);
function scanGeometryAnimations() {
  const ancestors = new Set(), animations = new Set();
  for (const el of active) for (let node = el; node; node = node.parentElement) ancestors.add(node);
  for (const node of ancestors) for (const animation of node.getAnimations?.() || []) {
    if (animation.playState !== 'running' && !animation.pending) continue;
    const keyframes = animation.effect?.getKeyframes?.();
    if (!keyframes || keyframes.some(keys => Object.keys(keys).some(key => !paintOnlyKeys.has(key)))) {
      animations.add(animation);
    }
  }
  geometryAnimations = [...animations];
}
function setSampleImage(record, image) {
  if (record.image === image) return;
  if (image) record.style.setProperty('--brand-field-image', image);
  else record.style.removeProperty('--brand-field-image');
  record.image = image;
  frameStyleWrites++;
}
function paintPhaseFill(el, geometry) {
  if (!geometry || !root.classList.contains('cc-fallback') ||
      !el.matches('.wf-phases button')) {
    phaseFlatFill?.release(el);
    return;
  }
  if (!phaseFlatFill) {
    phaseFlatFill = createPhaseFlatFill({
      grainUrl: `data:image/svg+xml,${encodeURIComponent(grainSvg)}`,
      grainSize: 180 * FIELD_PRESET.grainSize,
      onReady: () => scheduleGeometry(300)
    });
    if (decodedFrame) phaseFlatFill.setFrame(decodedFrame, publishedViewport);
  }
  phaseFlatFill.paint(el, geometry);
}
function deactivateSample(el) {
  active.delete(el);
  phaseFlatFill?.release(el);
  const record = records.get(el);
  if (record) setSampleImage(record, '');
}
function removeSample(el, record) {
  deactivateSample(el);
  visible.delete(el); records.delete(el);
  resizeObserver.unobserve(el); intersectionObserver.unobserve(el);
  for (const name of ['--brand-field-image', '--brand-sample-position', '--brand-sample-size', '--brand-sample-grain', '--brand-sample-grain-position']) record.style.removeProperty(name);
}
const resizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const record = records.get(entry.target);
    if (!record) continue;
    const box = entry.borderBoxSize?.[0];
    record.width = box?.inlineSize || 0;
    record.height = box?.blockSize || 0;
  }
  scheduleGeometry();
});
const updateIntersections = entries => {
  const entering = [];
  for (const entry of entries) {
    if (entry.isIntersecting) {
      visible.add(entry.target); entering.push(entry.target);
    } else {
      visible.delete(entry.target); deactivateSample(entry.target);
    }
  }
  // Prepare both directions before an opening reaches the viewport, including
  // when the renderer is paused. All consumers still use one decoded frame.
  if (entering.length) {
    updateGeometry(entering);
    scheduleGeometry(300);
  }
};
function configurePrewarm() {
  const distance = Math.ceil(Math.max(640, viewportState.height * 2));
  if (distance === prewarmDistance && intersectionObserver) return;
  prewarmDistance = distance;
  intersectionObserver?.disconnect();
  intersectionObserver = new IntersectionObserver(updateIntersections,
    { rootMargin: `${prewarmDistance}px ${horizontalPrewarm}px` });
  for (const el of records.keys()) intersectionObserver.observe(el);
  coverageDirty = true;
}
configurePrewarm();
const surfaceSelector = '.brand-field-fill,.brand-field-text,.brand-field-surface,.wf-phases button';
function bindSample(el) {
  if (!el.matches(surfaceSelector)) {
    // Selection changes can happen inside rAF. Retire the old bitmap in this
    // mutation checkpoint instead of leaving it visible until the next rAF.
    if (records.has(el)) deactivateSample(el);
    return;
  }
  pendingSamples.add(el);
  if (records.has(el)) return;
  const id = ++sampleId;
  el.dataset.brandSample = String(id);
  records.set(el, { style: el.style, width: 0, height: 0, last: '', image: '' });
  visible.add(el);
  resizeObserver.observe(el);
  intersectionObserver.observe(el);
  scheduleGeometry();
}
function measureGeometry(elements = visible) {
  geometryPasses++;
  const materialKey = `${root.dataset.theme}/${root.dataset.glassTransparency}`;
  if (materialKey !== shadowMaterialKey) {
    shadowVeil = getComputedStyle(root).getPropertyValue('--brand-glass-veil').trim();
    shadowMaterialKey = materialKey;
  }
  const updates = [];
  // Read all geometry before writing only each visible sample's inline paint
  // variables. The corner observer ignores these variables, preserving its SVG.
  for (const el of elements) {
    const record = records.get(el);
    if (!record) continue;
    if (!el.isConnected) {
      updates.push({el,record,remove:true});
      continue;
    }
    if (!el.matches(surfaceSelector)) { updates.push({ el, record }); continue; }
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom < -prewarmDistance || rect.top > viewportState.visualHeight + prewarmDistance ||
        rect.right < -horizontalPrewarm || rect.left > viewportState.width + horizontalPrewarm) {
      visible.delete(el);
      updates.push({ el, record }); continue;
    }
    visible.add(el);
    const width = record.width || el.offsetWidth || rect.width;
    const height = record.height || el.offsetHeight || rect.height;
    const sx = rect.width / width;
    const sy = rect.height / height;
    if (!(sx > 0 && sy > 0)) { updates.push({ el, record }); continue; }
    const field = publishedViewport;
    const documentLeft=rect.left+viewportState.x, documentTop=rect.top+viewportState.y;
    const values = [ (field.left-documentLeft)/sx, (field.top-documentTop)/sy,
      field.frameWidth/sx, field.frameHeight/sy,
      180*FIELD_PRESET.grainSize/sx, 180*FIELD_PRESET.grainSize/sy,
      -documentLeft/sx, -documentTop/sy ].map(n => `${n.toFixed(3)}px`);
    const key = values.join(' ');
    const flatGeometry = el.matches('.wf-phases button') ? {
      left: documentLeft, top: documentTop, width, height, scaleX: sx, scaleY: sy,
      dpr: devicePixelRatio
    } : null;
    if (flatGeometry && root.classList.contains('cc-fallback')) {
      const label = el.querySelector('.wf-phase-label');
      if (label) {
        const box = label.getBoundingClientRect(), style = getComputedStyle(label);
        const paintStyle = getComputedStyle(el);
        const emphasis = Number.parseFloat(paintStyle.getPropertyValue('--wf-stage-emphasis'));
        flatGeometry.emphasis = Number.isFinite(emphasis) ? emphasis : 0;
        const baseline = label.querySelector('.brand-field-baseline');
        flatGeometry.label = {
          node: label, text: label.textContent, x: (box.left - rect.left) / sx,
          width: box.width / sx,
          baseline: baseline ? (baseline.getBoundingClientRect().top - rect.top) / sy : null,
          font: style.font || `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
          color: paintStyle.color, letterSpacing: style.letterSpacing,
          direction: style.direction, fontKerning: style.fontKerning
        };
      }
    }
    const shadowGeometry = el.matches(':is(.hero-line,.hero-copy) .soft') ?
      {left:documentLeft, top:documentTop, width:rect.width, height:rect.height, scaleX:sx, scaleY:sy} : null;
    updates.push({ el, record, values, key, flatGeometry, shadowGeometry });
  }
  return updates;
}
function commitGeometry(updates) {
  for (const { el, record, values: v, key, flatGeometry, shadowGeometry, remove } of updates) {
    if(remove){removeSample(el,record);continue;}
    if (!v) { deactivateSample(el); continue; }
    if (record.last !== key) {
      record.style.setProperty('--brand-sample-position', `${v[0]} ${v[1]}`);
      record.style.setProperty('--brand-sample-size', `${v[2]} ${v[3]}`);
      record.style.setProperty('--brand-sample-grain', `${v[4]} ${v[5]}`);
      record.style.setProperty('--brand-sample-grain-position', `${v[6]} ${v[7]}`);
      record.last = key;
    }
    active.add(el);
    record.flatGeometry = flatGeometry;
    setSampleImage(record, publishedImage);
    paintPhaseFill(el, flatGeometry);
    if (shadowGeometry) updateTextShadowContrast(el, decodedFrame, publishedViewport, shadowGeometry, shadowVeil);
  }
}
function updateGeometry(elements=visible) { commitGeometry(measureGeometry(elements)); }
function publishVisibleFrame(image, decoded, viewport) {
  updateUnderpageColour(decoded, viewport);
  publishedImage=image;decodedFrame=decoded;publishedViewport=viewport;
  phaseFlatFill?.setFrame(decoded,viewport);
  backdrop.style.setProperty('--brand-field-image',image);
  root.style.setProperty('--brand-edge-frame',image);
  updateEdgeGeometry();frameStyleWrites+=2;
}
let pendingPublication=null;
function commitPublication(){
  if(!pendingPublication)return;
  const {image,decoded,viewport,complete}=pendingPublication;pendingPublication=null;
  publishVisibleFrame(image,decoded,viewport);complete();
}
function scheduleGeometry(duration = 0) {
  movingUntil = Math.max(movingUntil, performance.now() + duration);
  if(viewportController){viewportController.request('field');return;}
  if(geometryFrame)return;
  geometryFrame=requestAnimationFrame(()=>{geometryFrame=0;commitPublication();updateGeometry(records.keys());
    if(underpageDirty){underpageDirty=false;updateUnderpageColour(decodedFrame,publishedViewport);}});
}
if(viewportController)viewportController.subscribe({
  phase:'paint',
  measure(state){
    viewportState=state;
    if(pendingPublication)publishedViewport=pendingPublication.viewport;
    if(underpageContext){
      const key=`${root.dataset.theme}/${root.dataset.glassTransparency}`;
      if(key!==underpageMaterialKey){
        underpageVeil=getComputedStyle(root).getPropertyValue('--brand-glass-veil').trim();
        underpageMaterialKey=key;
      }
    }
    if(state.now>=nextMotionScan){scanGeometryAnimations();nextMotionScan=state.now+250;}
    const scan=coverageDirty||Math.abs(state.y-coverageY)>prewarmDistance/2||Math.abs(state.x-coverageX)>horizontalPrewarm/2;
    if(scan){coverageDirty=false;coverageY=state.y;coverageX=state.x;coverageScans++;}
    return measureGeometry(scan?records.keys():visible);
  },
  commit(state,updates){
    commitPublication();commitGeometry(updates);
    if(underpageDirty){underpageDirty=false;updateUnderpageColour(decodedFrame,publishedViewport);}
    configurePrewarm();
    if(state.now<movingUntil||geometryAnimations.some(a=>a.playState==='running'||a.pending))viewportController.request('field-motion');
  }
},80);
else {
  addEventListener('resize',()=>{viewportState={x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,visualHeight:innerHeight};configurePrewarm();scheduleGeometry();},{passive:true});
  addEventListener('scroll',()=>{viewportState.x=scrollX;viewportState.y=scrollY;scheduleGeometry();},{passive:true});
}
for (const event of ['transitionrun', 'animationstart']) document.addEventListener(event, () => scheduleGeometry(1000), true);
document.fonts?.ready.then(() => scheduleGeometry(300));

let renderer, inFlight = false, generation = 0, previousUrl = null, publishedUrl = null;
let publishedFrames = 0, encodingMs = 0;
const mirroredCanvas=document.createElement('canvas');
const mirroredContext=mirroredCanvas.getContext('2d');
const liveUrls = new Set();
const revoke = url => { if (url) { URL.revokeObjectURL(url); liveUrls.delete(url); } };
function publishFrame(source, frame) {
  // The renderer owns the 30fps cadence. A second 24fps gate discarded every
  // other rendered frame; only encoding back-pressure belongs at this boundary.
  if (inFlight || document.hidden) return;
  inFlight = true;
  const began = performance.now(), epoch = generation;
  // Reflect the same soft field at each cell boundary. Opposite edges agree,
  // so native repeated painting has no gaps or hard seams during async scroll.
  if(mirroredCanvas.width!==source.width)mirroredCanvas.width=source.width;
  if(mirroredCanvas.height!==source.height*2)mirroredCanvas.height=source.height*2;
  mirroredContext.setTransform(1,0,0,1,0,0);
  mirroredContext.drawImage(source,0,0);
  mirroredContext.setTransform(1,0,0,-1,0,source.height*2);
  mirroredContext.drawImage(source,0,0);
  const viewport=Object.freeze({...frame.viewport,frameHeight:frame.viewport.height*2,top:0,repeatY:true});
  mirroredCanvas.toBlob(async blob => {
    let url;
    try {
      if (!blob || epoch !== generation) return;
      url = URL.createObjectURL(blob); liveUrls.add(url);
      const decoded = new Image(); decoded.src = url;
      await decoded.decode();
      if (epoch !== generation) { revoke(url); return; }
      // Keep the frame below each visible mask, rather than inheriting a new
      // URL from :root through the entire document on every rendered frame.
      // Inline variables keep invalidation local. Mutating a stylesheet rule
      // each frame can make WebKit rebuild its resolver and invalidate all styles.
      // Corner fills and text-glow pseudos inherit the same local image.
      pendingPublication={url,image:`url("${url}")`,decoded,viewport,complete(){
        revoke(previousUrl);previousUrl=publishedUrl;publishedUrl=url;
        publishedFrames++;encodingMs=performance.now()-began;
        backdrop.dataset.encodingMs=encodingMs.toFixed(1);
        root.dataset.brandField='webgl-shared';
        backdrop.dataset.frame=String(publishedFrames);backdrop.dataset.time=frame.seconds.toFixed(2);
        dispatchEvent(new CustomEvent('glow:brandfieldframe',{detail:{seconds:frame.seconds,renders:publishedFrames}}));
      }};
      scheduleGeometry();
    } catch (error) {
      revoke(url);
      console.warn('Shared colour-field frame retained after encode failure', error);
    } finally { inFlight = false; }
  }, 'image/png');
}
function onFailure(error) {
  root.dataset.brandField = publishedUrl ? 'static-last-frame' : 'static-fallback';
  console.warn('Shared colour field is displaying its static fallback', error);
}
function refreshMotion() { renderer?.refresh(); scheduleGeometry(300); }
document.addEventListener('glow:motionchange', refreshMotion);
new MutationObserver(refreshMotion).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
addEventListener('pagehide', event => {
  generation++;
  if(pendingPublication){revoke(pendingPublication.url);pendingPublication=null;}
  phaseFlatFill?.clear();
  if (geometryFrame) cancelAnimationFrame(geometryFrame);
  geometryFrame = 0;
  if (!event.persisted) { for (const url of liveUrls) URL.revokeObjectURL(url); liveUrls.clear(); }
});
addEventListener('pageshow', () => { scheduleGeometry(300); });
addEventListener('glow:textpaintchange', () => scheduleGeometry());

  // Colour hooks are refreshed only when markup or selection attributes change.
  // Private paint variables do not match this observer's attribute filter.
  const fillSelector = [
    '.wf-view-label', '.manual-more button', '.shortcut-row mark',
    '.segment[aria-pressed="true"]', '.wf-phases button[aria-pressed="true"]',
    '.wf-view-switch button[aria-pressed="true"]', '.wf-frame-switch button[aria-pressed="true"]',
    '.wf-demo-switch button[aria-pressed="true"]', '.platform-filters button[aria-pressed="true"]',
    '.filter-option[aria-selected="true"]', '.motion-toggle[aria-pressed="true"]',
    '#motion-toggle[aria-pressed="true"]', '.nav-links a[aria-current]:not([aria-current="false"])'
  ].join(',');
  const textSelector = [
    '.link', '.release-link', '.section-kicker', '.soft', '.wf-manual-link', '.wf-source a',
    '.wf-story .wf-index',
    '.capability-query', '.manual-reset', '.shortcut-group-heading h3', '.shortcut-category',
    '.mini-notebook samp', '.ai-illustration span', '.platform-symbol:not(img)', '.capability-letter'
  ].join(',');
  const labelSelector = '.eyebrow,.flow-pills > span';
  const candidateSelector = ['.halo', fillSelector, textSelector, labelSelector,
    '.segment,.wf-phases button,.wf-view-switch button,.wf-frame-switch button',
    '.wf-demo-switch button,.platform-filters button,.filter-option,.motion-toggle,#motion-toggle,.nav-links a'
  ].join(',');
  const managedFill = new WeakSet();
  const managedText = new WeakSet();
  function toggleManaged(el, name, desired, managed) {
    if (desired) {
      if (!el.classList.contains(name)) { managed.add(el); el.classList.add(name); }
    } else if (managed.has(el)) {
      managed.delete(el); el.classList.remove(name);
    }
  }
  function syncElement(el) {
    if (!(el instanceof Element) || el.closest('.cc-paint,[data-story-measure]')) return;
    if (el.matches(':is(.hero-line,.hero-copy) .soft') && el.dataset.brandGlow !== el.textContent) {
      el.dataset.brandGlow = el.textContent;
    }
    const fill = el.matches(fillSelector);
    if (el.matches('.halo')) el.classList.add('brand-field-surface');
    toggleManaged(el, 'brand-field-fill', fill, managedFill);
    toggleManaged(el, 'brand-field-text', !fill && el.matches(textSelector), managedText);
    // Glass label containers keep their material; only their content is a mask.
    if (el.matches(labelSelector) && !el.querySelector(':scope > .brand-field-label')) {
      const label = document.createElement('span');
      label.className = 'brand-field-label brand-field-text';
      for (const child of [...el.childNodes]) {
        if (!(child instanceof Element) || !child.matches('.cc-paint')) label.appendChild(child);
      }
      el.appendChild(label);
      bindSample(label);
    }
    bindSample(el);
  }
  function syncTree(node) {
    if (!(node instanceof Element) || node.closest('.cc-paint,[data-story-measure]')) return;
    syncElement(node);
    node.querySelectorAll(candidateSelector).forEach(syncElement);
  }
  function bindColourHooks() {
    syncTree(document.body);
    document.addEventListener('glow:languagechange', () => {
      document.querySelectorAll(':is(.hero-line,.hero-copy) .soft').forEach(syncElement);
      scheduleGeometry(800);
    });
    updateGeometry(pendingSamples);
    pendingSamples.clear();
    const colourObserver = new MutationObserver(records => {
      const changed = new Set();
      for (const record of records) {
        if (record.type === 'attributes') changed.add(record.target);
        else {
          changed.add(record.target);
          for (const node of record.addedNodes) if (node instanceof Element) syncTree(node);
        }
      }
      changed.forEach(syncElement);
      // Class/selection changes and new links must receive their decoded frame
      // AND viewport coordinates before this rendering opportunity. Deferring
      // this work to the next rAF exposes the inherited bootstrap gradient for
      // one paint, especially when workflow text changes the button's height.
      if (pendingSamples.size) {
        updateGeometry(pendingSamples);
        pendingSamples.clear();
      }
      scheduleGeometry(800);
    });
    colourObserver.observe(document.body, { subtree: true, childList: true,
      attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'aria-current', 'class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindColourHooks, { once: true });
  else bindColourHooks();

renderer = createColourField({ canvas, settings: FIELD_PRESET,
  measureViewport: measureFieldViewport,
  reduced: () => root.dataset.motion === 'reduce',
  // This intentionally soft texture is enlarged under native-resolution text
  // and grain. Bound both full-screen GPU passes and PNG readback/encoding.
  maxEdge: 640,
  canRender: () => !inFlight&&!pendingPublication, onFrame: publishFrame, onError: onFailure });
window.GlowBrandField = Object.freeze({
  pause() { renderer.setPaused(true); },
  resume() { renderer.setPaused(false); },
  get state() { return { ...renderer.state, sharedFrame: publishedFrames, encodingMs,
    textureUrls: liveUrls.size, consumers: records.size, visibleConsumers: visible.size,
    activeConsumers: active.size, geometryPasses, frameStyleWrites,
    prewarmDistance, coverageScans,
    phaseFlatFill: phaseFlatFill?.state || null,
    grain: FIELD_PRESET.grain, grainSize: FIELD_PRESET.grainSize }; }
});
scheduleGeometry(1000);
