// Local base-colour estimate, not a screenshot/accessibility measurement.
// Decorative beams, grain, glyph antialiasing and the shadow itself are excluded
// so the feedback cannot amplify its own shadow or flicker with the noise.
// Relative luminance: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
export function luminance(rgb) {
  const linear = rgb.map(value => {
    const c = value / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}

export function shadowWeight(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  const contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  // Visual tuning thresholds, not a claim of WCAG conformance.
  const t = Math.max(0, Math.min(1, (contrast - 1.2) / (4.5 - 1.2)));
  return 1 - t * t * (3 - 2 * t);
}

export function createTextShadowContrast() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  const defs = document.createElementNS(ns, 'defs');
  svg.append(defs); document.body.append(svg);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', {willReadFrequently:true});
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
    primitive(filter, 'feFlood', {'flood-color':'black', 'flood-opacity':'.6', result:'black'});
    primitive(filter, 'feComposite', {in:'black', in2:'exterior', operator:'in', result:'shadow'});
    const merge = primitive(filter, 'feMerge', {});
    primitive(merge, 'feMergeNode', {in:'shadow'});
    primitive(merge, 'feMergeNode', {in:'SourceGraphic'});
    return {filter, blur, map, id, el};
  }
  return function update(el, decoded, field, box, veil) {
    if (!context || !decoded || !box || failed) return;
    const radius = Number.parseFloat(document.documentElement.style.getPropertyValue('--glow-text-shadow-radius')) || 0;
    const style = document.documentElement.style;
    const pad = Math.ceil(3 * Math.max(
      Number.parseFloat(style.getPropertyValue('--glow-text-near-radius')) || 7,
      Number.parseFloat(style.getPropertyValue('--glow-text-far-radius')) || 18) + radius * 3 + 4);
    const now = performance.now(), previous = cache.get(el);
    const key = `${box.left}/${box.top}/${box.width}/${box.height}/${box.scaleX}/${box.scaleY}/${veil}/${radius}/${pad}`;
    if (previous && previous.key === key &&
        (previous.frame === decoded || now - previous.time < 100)) return;
    try {
      const record = previous || createFilter(el);
      const sx = box.scaleX, sy = box.scaleY;
      // Only these two short text surfaces get filters; no full-page filter.
      const width = box.width / sx + 2 * pad, height = box.height / sy + 2 * pad;
      canvas.width = Math.max(1, Math.ceil(width / 3));
      canvas.height = Math.max(1, Math.ceil(height / 3));
      const dx = canvas.width / (width * sx), dy = canvas.height / (height * sy);
      const left = box.left - pad * sx, top = box.top - pad * sy;
      const first = Math.floor((top - field.top) / field.frameHeight);
      const last = Math.floor((top + height * sy - field.top) / field.frameHeight);
      for (let tile = first; tile <= last; tile++) {
        context.drawImage(decoded, (field.left-left)*dx,
          (field.top + tile*field.frameHeight-top)*dy, field.frameWidth*dx, field.frameHeight*dy);
      }
      const foreground = context.getImageData(0, 0, canvas.width, canvas.height);
      context.fillStyle = veil; context.fillRect(0, 0, canvas.width, canvas.height);
      const background = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixels = foreground.data;
      let min = 1, max = 0;
      // A continuous position-dependent alpha texture; no word/line average.
      for (let i = 0; i < pixels.length; i += 4) {
        const weight = radius === 0 ? 0 : shadowWeight(
          [pixels[i], pixels[i+1], pixels[i+2]], [background[i], background[i+1], background[i+2]]);
        min = Math.min(min, weight); max = Math.max(max, weight);
        pixels[i] = pixels[i+1] = pixels[i+2] = 255;
        pixels[i+3] = Math.round(255 * weight);
      }
      context.putImageData(foreground, 0, 0);
      for (const node of [record.filter, record.map]) {
        for (const [name, value] of Object.entries({x:-pad, y:-pad, width, height})) node.setAttribute(name, value);
      }
      record.blur.setAttribute('stdDeviation', radius);
      record.map.setAttribute('href', canvas.toDataURL('image/png'));
      el.style.setProperty('--glow-text-spatial-filter', `url(#${record.id})`);
      el.style.removeProperty('--glow-text-shadow-contrast');
      el.dataset.shadowDistribution = `${min.toFixed(3)}–${max.toFixed(3)}`;
      cache.set(el, Object.assign(record, {key, frame:decoded, time:now}));
    } catch {
      // Do not interrupt the page's shared colour-field publication.
      failed = true;
      el.style.removeProperty('--glow-text-spatial-filter');
    }
  };
}
