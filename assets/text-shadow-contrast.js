import { getAppliedShadowFormula } from './shadow-formula-settings.js?v=shadow-20261026';
import { colorInputs, clampAlpha } from './shadow-formula.js?v=shadow-20261026';
import { createHeroBeamSampler } from './hero-beam-sampler.js?v=shadow-20261026';

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
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  const defs = document.createElementNS(ns, 'defs');
  svg.append(defs); document.body.append(svg);
  const sample = document.createElement('canvas');
  const context = sample.getContext('2d', {willReadFrequently:true});
  const paintBeams = createHeroBeamSampler();
  const records = new WeakMap();
  // Feature detection, not a browser-name branch. Keep the same alpha pixels
  // and native glyph filter on both paths.
  const liveMaskSupported = typeof document.getCSSCanvasContext === 'function' &&
    CSS.supports('-webkit-mask-image','-webkit-canvas(glow-shadow-probe)');
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
    if (!context || !decoded || !box || !el.isConnected) return;
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
      sample.width=Math.max(1,Math.ceil(width/3));sample.height=Math.max(1,Math.ceil(height/3));
      const dx=sample.width/(width*sx),dy=sample.height/(height*sy);
      const left=box.left-pad*sx,top=box.top-pad*sy;
      const first=Math.floor((top-field.top)/field.frameHeight);
      const last=Math.floor((top+height*sy-field.top)/field.frameHeight);
      for(let tile=first;tile<=last;tile++) context.drawImage(decoded,
        (field.left-left)*dx,(field.top+tile*field.frameHeight-top)*dy,
        field.frameWidth*dx,field.frameHeight*dy);
      const foreground=context.getImageData(0,0,sample.width,sample.height);
      context.fillStyle=veil;context.fillRect(0,0,sample.width,sample.height);
      paintBeams(context,{left,top,width:width*sx,height:height*sy});
      const background=context.getImageData(0,0,sample.width,sample.height).data;
      const pixels=foreground.data;
      let min=1,max=0;
      for(let i=0;i<pixels.length;i+=4) {
        const {c,d}=colorInputs([pixels[i],pixels[i+1],pixels[i+2]],
          [background[i],background[i+1],background[i+2]]);
        const weight=clampAlpha(formula.compiled.evaluate(c,d));
        min=Math.min(min,weight);max=Math.max(max,weight);
        pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(255*weight);
      }
      context.putImageData(foreground,0,0);
      if (liveMaskSupported) {
        if (!record.maskContext || record.maskWidth!==sample.width || record.maskHeight!==sample.height) {
          record.maskContext=document.getCSSCanvasContext('2d',record.maskName,sample.width,sample.height);
          record.maskWidth=sample.width;record.maskHeight=sample.height;
          record.layer.style.setProperty('--shadow-mask',`-webkit-canvas(${record.maskName})`);
        }
        record.maskContext.putImageData(foreground,0,0);
        record.layer.dataset.maskMode='live';
        record.layer.dataset.shadowUpdates=String(++record.commits);
        el.dataset.shadowDistribution=`${min.toFixed(3)}–${max.toFixed(3)}`;
        Object.assign(record,{key,frame:decoded,time:now});
        return;
      }
      record.layer.dataset.maskMode='png';
      const url=sample.toDataURL('image/png'),image=new Image();
      record.pending=true;image.src=url;
      // Keep the previous complete mask until the next resource is decoded.
      image.decode().then(() => {
        if (!el.isConnected || el.textContent!==text || record.geometryKey!==geometryKey || getAppliedShadowFormula().revision!==formula.revision) return;
        record.layer.style.setProperty('--shadow-mask',`url("${url}")`);
        record.image=image;
        record.layer.dataset.shadowUpdates=String(++record.commits);
        el.dataset.shadowDistribution=`${min.toFixed(3)}–${max.toFixed(3)}`;
        Object.assign(record,{key,frame:decoded,time:now});
      }).catch(error => {
        if (!record.reported) console.warn('Text shadow retained after mask decode failure',error);
        record.reported=true;
      }).finally(() => { record.pending=false; });
    } catch(error) {
      if (!record.reported) console.warn('Text shadow retained after sampling failure',error);
      record.reported=true;record.pending=false;
    }
  };
}
