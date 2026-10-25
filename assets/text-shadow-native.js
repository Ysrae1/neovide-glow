// Preserve the pre-existing Chromium SVG feImage/filter/SourceGraphic pipeline.
import { getAppliedShadowFormula } from './shadow-formula-settings.js?v=shadow-final6';
import { createShadowSampler } from './text-shadow-sampling.js?v=shadow-final6';

export function createNativeTextShadow() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  const defs = document.createElementNS(ns, 'defs');
  svg.append(defs); document.body.append(svg);
  const sampleFrame = createShadowSampler();
  const cache = new WeakMap();
  let nextId = 0, failed = false;
  function primitive(parent, name, attributes) {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    parent.append(node); return node;
  }
  function createFilter(el) {
    const id = `glow-spatial-shadow-${++nextId}`;
    const filter = primitive(defs, 'filter', {id, filterUnits:'userSpaceOnUse',
      primitiveUnits:'userSpaceOnUse', 'color-interpolation-filters':'sRGB'});
    const blur = primitive(filter, 'feGaussianBlur', {in:'SourceAlpha', stdDeviation:'1.7', result:'blur'});
    const map = primitive(filter, 'feImage', {preserveAspectRatio:'none', result:'distribution'});
    primitive(filter, 'feComposite', {in:'blur', in2:'distribution', operator:'in', result:'weighted'});
    // Keep the original glyph/coloured halo untouched: only exterior alpha.
    primitive(filter, 'feComposite', {in:'weighted', in2:'SourceAlpha', operator:'out', result:'exterior'});
    primitive(filter, 'feFlood', {'flood-color':'black', 'flood-opacity':'1', result:'black'});
    primitive(filter, 'feComposite', {in:'black', in2:'exterior', operator:'in', result:'shadow'});
    const merge = primitive(filter, 'feMerge', {});
    primitive(merge, 'feMergeNode', {in:'shadow'});
    primitive(merge, 'feMergeNode', {in:'SourceGraphic'});
    return {filter, blur, map, id, el};
  }
  return function update(el, decoded, field, box, veil) {
    if (!decoded || !box || failed) return;
    const radius = Number.parseFloat(document.documentElement.style.getPropertyValue('--glow-text-shadow-radius')) || 0;
    const style = document.documentElement.style;
    const pad = Math.ceil(3 * Math.max(
      Number.parseFloat(style.getPropertyValue('--glow-text-near-radius')) || 7,
      Number.parseFloat(style.getPropertyValue('--glow-text-far-radius')) || 18) + radius * 3 + 4);
    const formula=getAppliedShadowFormula();
    const now = performance.now(), previous = cache.get(el);
    const key = `${box.left}/${box.top}/${box.width}/${box.height}/${box.scaleX}/${box.scaleY}/${veil}/${radius}/${pad}/${formula.revision}`;
    if (previous && previous.key === key &&
        (previous.frame === decoded || now - previous.time < 100)) return;
    try {
      const record = previous || createFilter(el);
      const sampled=sampleFrame(decoded,field,box,pad,veil,formula,radius!==0);
      if(!sampled)return;
      const {canvas,min,max,width,height}=sampled;
      for (const node of [record.filter, record.map]) {
        for (const [name, value] of Object.entries({x:-pad, y:-pad, width, height})) node.setAttribute(name, value);
      }
      record.blur.setAttribute('stdDeviation', radius);
      record.map.setAttribute('href', canvas.toDataURL('image/png'));
      el.style.setProperty('--glow-text-spatial-filter', `url(#${record.id})`);
      el.style.removeProperty('--glow-text-shadow-contrast');
      el.dataset.shadowPipeline='native-svg';
      el.dataset.shadowFormula=formula.source;
      el.dataset.shadowDistribution = `${min.toFixed(3)}–${max.toFixed(3)}`;
      cache.set(el, Object.assign(record, {key, frame:decoded, time:now}));
    } catch {
      // Do not interrupt the page's shared colour-field publication.
      failed = true;
      el.style.removeProperty('--glow-text-spatial-filter');
    }
  };
}
