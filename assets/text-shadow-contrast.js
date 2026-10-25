import { getAppliedShadowFormula } from './shadow-formula-settings.js?v=shadow-final6';
import { createShadowSampler } from './text-shadow-sampling.js?v=shadow-final6';
import { createNativeTextShadow } from './text-shadow-native.js?v=shadow-final6';

// Local base-colour estimate, not a screenshot/accessibility measurement.
// Hero beams are composited from their live CSS geometry. Grain, antialiasing
// and the text's own glow/shadow stay excluded to avoid self-feedback.
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

// Native text produces a static exterior shadow. The changing alpha image is
// applied to a separate parent, never fed through SVG feImage/filter rebuilds.
// Safari's live CSS canvas keeps its identity while alpha pixels change.
export function createTextShadowContrast() {
  const liveMaskSupported = typeof document.getCSSCanvasContext === 'function' &&
    CSS.supports('-webkit-mask-image','-webkit-canvas(glow-shadow-probe)');
  if(!liveMaskSupported)return createNativeTextShadow();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  const defs = document.createElementNS(ns, 'defs');
  svg.append(defs); document.body.append(svg);
  const sampleFrame=createShadowSampler();
  const records = new WeakMap();
  let nextId = 0;
  function primitive(parent, name, attrs) {
    const node = document.createElementNS(ns, name);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
    parent.append(node); return node;
  }
  function createRecord(el) {
    const id = `glow-native-shadow-${++nextId}`;
    const filter = primitive(defs,'filter',{id,filterUnits:'objectBoundingBox',
      primitiveUnits:'objectBoundingBox','color-interpolation-filters':'sRGB'});
    const blur = primitive(filter,'feGaussianBlur',{in:'SourceAlpha',result:'blur'});
    primitive(filter,'feComposite',{in:'blur',in2:'SourceAlpha',operator:'out',result:'exterior'});
    primitive(filter,'feFlood',{class:'glow-text-shadow-colour','flood-opacity':'1',result:'shadow-colour'});
    primitive(filter,'feComposite',{in:'shadow-colour',in2:'exterior',operator:'in'});
    const layer = document.createElement('span');
    layer.className = 'glow-text-shadow-layer';
    layer.setAttribute('aria-hidden','true');
    const glyph = document.createElement('span');
    glyph.className = 'glow-text-shadow-glyph';
    glyph.style.filter = `url(#${id})`;
    layer.append(glyph);
    // Generated text does not enter host.textContent (used by translation/glow).
    return {filter,blur,layer,glyph,commits:0,maskName:id+'-alpha'};
  }
  return function update(el, decoded, field, box, veil) {
    if (!decoded || !box || !el.isConnected) return;
    const parsed = parseFloat(document.documentElement.style.getPropertyValue('--glow-text-shadow-radius'));
    const radius = Number.isFinite(parsed) ? Math.max(0,parsed) : 1.7;
    let record = records.get(el);
    if (!record) { record = createRecord(el); records.set(el,record); }
    const text = el.textContent;
    if (record.glyph.dataset.shadowText !== text) record.glyph.dataset.shadowText = text;
    if (record.layer.parentElement !== el) el.append(record.layer);
    if (!el.classList.contains('glow-text-shadow-ready')) el.classList.add('glow-text-shadow-ready');
    if (record.layer.hidden !== (radius === 0)) record.layer.hidden = radius === 0;
    if (radius === 0) { record.key = ''; return; }
    const sx=box.scaleX,sy=box.scaleY,w=box.width/sx,h=box.height/sy;
    if (!(w>0 && h>0)) return;
    const pad=Math.ceil(radius*3+4),width=w+2*pad,height=h+2*pad;
    const geometryKey=`${w}/${h}/${radius}`;
    if (record.geometryKey !== geometryKey) {
      record.layer.style.setProperty('--shadow-pad',`${pad}px`);
      for (const [name,value] of Object.entries({x:-pad/w,y:-pad/h,width:width/w,height:height/h}))
        record.filter.setAttribute(name,value);
      record.blur.setAttribute('stdDeviation',`${radius/w} ${radius/h}`);
      record.geometryKey=geometryKey;
    }
    const formula=getAppliedShadowFormula();
    if (el.dataset.shadowFormula!==formula.source) el.dataset.shadowFormula=formula.source;
    const key=JSON.stringify([text,geometryKey,box.left,box.top,sx,sy,veil,formula.revision]);
    const now=performance.now();
    if (record.pending || (record.key===key && (record.frame===decoded || now-record.time<100))) return;
    try {
      const sampled=sampleFrame(decoded,field,box,pad,veil,formula);
      if(!sampled)return;
      const {canvas:sample,alpha:foreground,min,max}=sampled;
      if (liveMaskSupported) {
        if (!record.maskContext || record.maskWidth!==sample.width || record.maskHeight!==sample.height) {
          record.maskContext=document.getCSSCanvasContext('2d',record.maskName,sample.width,sample.height);
          record.maskWidth=sample.width;record.maskHeight=sample.height;
          record.layer.style.setProperty('--shadow-mask',`-webkit-canvas(${record.maskName})`);
        }
        record.maskContext.putImageData(foreground,0,0);
        record.layer.dataset.maskMode='live';
        el.dataset.shadowPipeline='native-layer-live';
        record.layer.dataset.shadowUpdates=String(++record.commits);
        el.dataset.shadowDistribution=`${min.toFixed(3)}–${max.toFixed(3)}`;
        Object.assign(record,{key,frame:decoded,time:now});
        return;
      }
    } catch(error) {
      if (!record.reported) console.warn('Text shadow retained after sampling failure',error);
      record.reported=true;record.pending=false;
    }
  };
}
