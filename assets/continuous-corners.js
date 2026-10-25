/* SwiftUI continuous-corner capability fallback, macOS 27.2 public Path export.
 * Three cubics per corner; not a squircle or semicircle capsule approximation.
 * No text cloning, idle animation loop, UA sniffing, or whole-host clipping.
 * Native browser corner-shape remains preferred. Native <select> rendering is
 * intentionally retained. Geometry provenance: continuous-corners-reference.json.
 */
(() => {
  'use strict';
  const inspectVector = new URLSearchParams(location.search).get('geometry') === 'vector';
  if (!inspectVector && window.CSS?.supports?.('corner-shape', 'superellipse(1.44)')) return;
  if (!window.CSS?.supports?.('clip-path', 'path("M0 0H1V1Z")')) return;
  const NS = 'http://www.w3.org/2000/svg';
  const EXTENT = 1.5286649465560913;
  const C = [1.0884900093078613, .8684070110321045, .07491140067577362,
    .6314939856529236, .16906000673770904, .3728240132331848];
  const SELECTOR = [
    '.nav','.nav-links a','.mobile-manual','.icon-button','.key','.glass-button',
    '.motion-toggle','.manual-more button','.chip','.manual-version',
    '.eyebrow','.tags li','.rain-caption','.flow-pills span','.wf-view-label',
    '.card','.manual-shell','.manual-loading','.window','.mini-notebook',
    '.wf-native-window','.capability-icon','.install','.ai-illustration>code',
    '.ai-illustration>div','.manual-search','.filter-trigger','.filter-menu',
    '.filter-option','.wf-phases','.segmented','.wf-frame-switch','.wf-view-switch',
    '.wf-demo-switch','.wf-phases button','.segment','.wf-frame-switch button',
    '.wf-view-switch button','.wf-demo-switch button','.platform-filters',
    '.platform-filters button','.wf-keys kbd','.shortcut-keys kbd','.manual-intro kbd',
    '.shortcut-row mark','.wf-legend.is-floating'
  ].join(',');
  const records = new Map(), dirty = new Set();
  let frame = 0, serial = 0, observer;
  const fmt = n => Number(n.toFixed(4));
  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(NS, tag);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const owned = node => node?.nodeType === 1 && !!node.closest('.cc-paint,[data-story-measure]');
  const split = value => {
    const out=[]; let start=0, depth=0;
    for(let i=0;i<value.length;i++) {
      if(value[i]==='(') depth++;
      if(value[i]===')') depth--;
      if(value[i]===',' && !depth) { out.push(value.slice(start,i)); start=i+1; }
    }
    out.push(value.slice(start)); return out;
  };
  function cornerPath(w,h,r, circle=false, dx=0,dy=0, morph=1) {
    const p=(x,y)=>`${fmt(x+dx)} ${fmt(y+dy)}`;
    if(circle) {
      const rx=w/2,ry=h/2;
      return `M${p(rx,0)}A${fmt(rx)} ${fmt(ry)} 0 1 1 ${p(rx,h)}A${fmt(rx)} ${fmt(ry)} 0 1 1 ${p(rx,0)}Z`;
    }
    // Match the source's non-overlap domain; capsules take the maximum radius
    // whose continuous tails fit, rather than joining straight sides to arcs.
    const sum=(a,b)=>EXTENT*(a+b);
    const ratio=(length,a,b)=>sum(a,b)>0?length/sum(a,b):Infinity;
    const scale=Math.min(1,ratio(w,r[0],r[1]),ratio(w,r[3],r[2]),
      ratio(h,r[0],r[3]),ratio(h,r[1],r[2]));
    r=r.map(x=>x*scale);
    let d=`M${p(r[0]*EXTENT,0)}L${p(w-r[1]*EXTENT,0)}`;
    // Transform a canonical corner (top tangent -> left tangent) to each corner.
    let points=[
      [[C[0],0],[C[1],0],[C[3],C[2]]],
      [[C[5],C[4]],[C[4],C[5]],[C[2],C[3]]],
      [[0,C[1]],[0,C[0]],[0,EXTENT]]
    ];
    if(morph<1) {
      // The floating legend is one component throughout its width animation.
      // Equal cubic topology keeps the moving contour continuous; the resting
      // closed state above still uses exact SVG circular arcs.
      const blend=Math.max(0,morph), circular=[];
      for(let i=0;i<3;i++) {
        const a=-Math.PI/2-i*Math.PI/6,b=a-Math.PI/6;
        const alpha=4/3*Math.tan((b-a)/4);
        const point=t=>[EXTENT*(1+Math.cos(t)),EXTENT*(1+Math.sin(t))];
        const start=point(a),end=point(b);
        circular.push([
          [start[0]-alpha*EXTENT*Math.sin(a),start[1]+alpha*EXTENT*Math.cos(a)],
          [end[0]+alpha*EXTENT*Math.sin(b),end[1]-alpha*EXTENT*Math.cos(b)],end
        ]);
      }
      points=points.map((segment,i)=>segment.map((point,j)=>point.map((value,k)=>circular[i][j][k]*(1-blend)+value*blend)));
    }
    function append(rad, transform) {
      if(!rad) { const [x,y]=transform(0,0); d+=`L${p(x,y)}`; return; }
      for(const segment of points) d+='C'+segment.map(([x,y])=>p(...transform(x*rad,y*rad))).join(' ');
    }
    append(r[1],(x,y)=>[w-x,y]);
    d+=`L${p(w,h-r[2]*EXTENT)}`;
    append(r[2],(x,y)=>[w-y,h-x]);
    d+=`L${p(r[3]*EXTENT,h)}`;
    append(r[3],(x,y)=>[x,h-y]);
    d+=`L${p(0,r[0]*EXTENT)}`;
    append(r[0],(x,y)=>[y,x]);
    return d+'Z';
  }
  function shadows(value) {
    if(!value || value==='none') return [];
    return split(value).map(item=>{
      const color=item.match(/(?:rgba?|hsla?|color)\([^)]*\)|#[\da-f]+/i)?.[0] || 'currentColor';
      const numbers=item.replace(color,'').match(/-?\d*\.?\d+(?:e[-+]?\d+)?(?=px)/gi)?.map(Number.parseFloat)||[];
      return {color,x:numbers[0]||0,y:numbers[1]||0,blur:Math.max(0,numbers[2]||0),spread:numbers[3]||0,inset:/\binset\b/.test(item)};
    });
  }
  function shadowFilter(defs,id,list,w,h) {
    const pad=Math.max(8,...list.map(s=>Math.abs(s.x)+Math.abs(s.y)+s.blur*2+Math.abs(s.spread)));
    const filter=svg('filter',{id,filterUnits:'userSpaceOnUse',x:-pad,y:-pad,width:w+pad*2,height:h+pad*2,'color-interpolation-filters':'sRGB'});
    const merge=svg('feMerge');
    list.slice().reverse().forEach((s,i)=>{
      const stem=`s${i}`;
      const radius=Math.abs(s.spread);
      let input='SourceAlpha';
      if(radius) {
        filter.append(svg('feMorphology',{in:input,operator:(s.inset?s.spread<0:s.spread>0)?'dilate':'erode',radius,result:stem+'m'})); input=stem+'m';
      }
      filter.append(svg('feGaussianBlur',{in:input,stdDeviation:s.blur/2,result:stem+'b'}));
      filter.append(svg('feOffset',{in:stem+'b',dx:s.x,dy:s.y,result:stem+'o'}));
      if(s.inset) filter.append(svg('feComposite',{in:'SourceAlpha',in2:stem+'o',operator:'out',result:stem+'a'}));
      filter.append(svg('feFlood',{'flood-color':s.color,result:stem+'c'}));
      filter.append(svg('feComposite',{in:stem+'c',in2:stem+(s.inset?'a':'o'),operator:'in',result:stem+'p'}));
      // CSS outer box-shadows are painted outside the border box. Without this
      // subtraction, their opaque source silhouette darkens translucent glass
      // beneath the fill and creates a second apparent material layer.
      filter.append(svg('feComposite',{in:stem+'p',in2:'SourceAlpha',operator:s.inset?'in':'out',result:stem+'r'}));
      merge.append(svg('feMergeNode',{in:stem+'r'}));
    });
    filter.append(merge);defs.append(filter);
  }
  function paintOuterShadow(record,d,list,w,h) {
    const canvas=record.outer;
    if(!record.shadowVisible||!list.length) {
      if(canvas.width!==1||canvas.height!==1) canvas.width=canvas.height=1;
      record.shadowKey='';return;
    }
    const pad=Math.ceil(Math.max(8,...list.map(s=>Math.abs(s.x)+Math.abs(s.y)+s.blur*2+Math.abs(s.spread))));
    const width=w+pad*2,height=h+pad*2;
    // These are soft shadows, while the actual fill/border retain native
    // resolution. Bound per-surface memory on large presentation panels.
    const density=Math.min(devicePixelRatio||1,2,4096/Math.max(width,height),Math.sqrt(4e6/(width*height)));
    const key=JSON.stringify([d,list,density]);
    if(record.shadowKey===key)return;
    canvas.width=Math.max(1,Math.ceil(width*density));
    canvas.height=Math.max(1,Math.ceil(height*density));
    Object.assign(canvas.style,{left:`${-pad}px`,top:`${-pad}px`,right:'auto',bottom:'auto',width:`${width}px`,height:`${height}px`});
    const output=canvas.getContext('2d');
    const mask=document.createElement('canvas');mask.width=canvas.width;mask.height=canvas.height;
    const source=mask.getContext('2d'),path=new Path2D(d);
    for(const s of list.slice().reverse()) {
      source.setTransform(1,0,0,1,0,0);source.clearRect(0,0,mask.width,mask.height);
      source.setTransform(density,0,0,density,pad*density,pad*density);
      source.globalCompositeOperation='source-over';source.fillStyle='#fff';source.strokeStyle='#fff';
      source.lineJoin='round';source.fill(path);
      if(s.spread) {
        source.lineWidth=Math.abs(s.spread)*2;
        source.globalCompositeOperation=s.spread<0?'destination-out':'source-over';
        source.stroke(path);
      }
      // Move only the source outside the bitmap; its shadow lands at the
      // original coordinates. No opaque source silhouette is composited.
      output.shadowColor=s.color;output.shadowBlur=s.blur*density;
      output.shadowOffsetX=mask.width*2+s.x*density;output.shadowOffsetY=s.y*density;
      output.drawImage(mask,-mask.width*2,0);
    }
    output.shadowColor='transparent';output.shadowBlur=0;
    output.shadowOffsetX=output.shadowOffsetY=0;
    output.setTransform(density,0,0,density,pad*density,pad*density);
    output.globalCompositeOperation='destination-out';output.fill(path);
    output.globalCompositeOperation='source-over';output.setTransform(1,0,0,1,0,0);
    // The same path removes every interior pixel from the finished shadow.
    // Safari now composites a cached bitmap instead of reevaluating SVG blur
    // and SourceAlpha filters for every changing background frame.
    record.shadowKey=key;
  }
  function buildVector(record,d,style,w,h) {
    const vector=record.vector;
    const all=shadows(style.boxShadow);
    paintOuterShadow(record,d,all.filter(s=>!s.inset),w,h);
    const key=JSON.stringify([d,w,h,style.boxShadow,style.borderTopColor,
      style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth]);
    if(record.vectorKey===key)return;
    record.vectorKey=key;
    vector.replaceChildren();
    vector.setAttribute('viewBox',`0 0 ${w} ${h}`);
    const defs=svg('defs');
    const clipId=`cc-clip-${record.id}`;
    const clip=svg('clipPath',{id:clipId,clipPathUnits:'userSpaceOnUse'});clip.append(svg('path',{d}));defs.append(clip);
    vector.append(defs);
    const inset=all.filter(s=>s.inset);
    if(inset.length) {
      const id=`cc-shadow-${record.id}-in`;
      shadowFilter(defs,id,inset,w,h);
      vector.append(svg('path',{d,fill:'#000',filter:`url(#${id})`,'clip-path':`url(#${clipId})`}));
    }
    const width=Math.max(...['Top','Right','Bottom','Left'].map(side=>parseFloat(style[`border${side}Width`])||0));
    if(width) vector.append(svg('path',{d,fill:'none',stroke:style.borderTopColor,'stroke-width':width*2,'clip-path':`url(#${clipId})`,'vector-effect':'non-scaling-stroke'}));
  }
  function schedule(el) {
    if(el && records.has(el)) dirty.add(el);
    if(dirty.size && !frame) frame=requestAnimationFrame(flush);
  }
  function discover(root) {
    if(!(root instanceof Element) && root!==document) return;
    const nodes=[...(root.matches?.(SELECTOR)?[root]:[]),...root.querySelectorAll(SELECTOR)];
    for(const el of nodes) if(!owned(el) && !records.has(el)) {
      records.set(el,{id:++serial,el,width:0,height:0,paint:null,clips:[],shadowVisible:false,shadowKey:''});
      resize.observe(el);shadowVisibility.observe(el);schedule(el);
    }
  }
  function measure(record) {
    const el=record.el;
    // Source-paint reads must not launch transitions between the original
    // box and the path-owned paint. Keep geometry transitions (nav height,
    // legend width, transforms) with their original timing throughout.
    const transitions=getComputedStyle(el);
    const properties=split(transitions.transitionProperty);
    const durations=split(transitions.transitionDuration),delays=split(transitions.transitionDelay);
    const easings=split(transitions.transitionTimingFunction);
    const paintProperty=/^(?:all|background(?:-.+)?|border(?:-(?:top|right|bottom|left))?-color|box-shadow|(?:-webkit-)?backdrop-filter)$/;
    const measuringTransitions=properties.map((name,i)=>({name:name.trim(),i}))
      .filter(({name})=>!paintProperty.test(name)&&name!=='none')
      .map(({name,i})=>`${name} ${durations[i%durations.length]} ${easings[i%easings.length]} ${delays[i%delays.length]}`);
    el.style.setProperty('--cc-measure-transitions',measuringTransitions.join(',')||'none');
    el.classList.add('cc-measuring');
    el.classList.remove('cc-host','cc-static','cc-unclip');
    // getComputedStyle is live: copy only source paint/geometry while overrides
    // are absent, then restore the host once per dirty batch.
    const cs=getComputedStyle(el),style={};
    for(const name of ['display','visibility','position','backgroundColor','backgroundImage','backgroundSize','backgroundPosition','backgroundRepeat','backgroundOrigin','backgroundClip','backgroundAttachment','boxShadow','backdropFilter','webkitBackdropFilter','overflowX','overflowY','borderTopColor','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius']) style[name]=cs[name];
    const legend=el.matches('.wf-legend.is-floating');
    const rawMorph=legend?parseFloat(cs.getPropertyValue('--legend-morph')):1;
    const legendMorph=Number.isFinite(rawMorph)?Math.max(0,Math.min(1,rawMorph)):(el.hasAttribute('data-open')?1:0);
    const w=record.width||el.offsetWidth,h=record.height||el.offsetHeight;
    const radius=['TopLeft','TopRight','BottomRight','BottomLeft'].map(c=>{
      const value=style[`border${c}Radius`].split(' ');
      const val=(s,extent)=>s?.includes('%')?parseFloat(s)*extent/100:parseFloat(s)||0;
      return Math.min(val(value[0],w),val(value[1]||value[0],h));
    });
    const clear=color=>color==='transparent'||/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(color)||/\/\s*0(?:\.0+)?\s*\)$/.test(color);
    const visiblePaint=style.backgroundImage!=='none'||!clear(style.backgroundColor)||style.boxShadow!=='none'||(parseFloat(style.borderTopWidth)>0&&!clear(style.borderTopColor));
    if(!w||!h||style.display==='none'||!radius.some(Boolean)||!visiblePaint) {
      record.paint?.remove();record.paint=null;
      for(const item of record.clips) {
        item.el.classList.remove('cc-content-clip');item.el.style.clipPath=item.clip;item.el.style.webkitClipPath=item.webkit;
      }
      record.clips=[];finishMeasure(el);return;
    }
    // Consumers may replace their text/content. A retained record must never
    // keep painting into a detached surface while clearing the host's paint.
    if(record.paint && record.paint.parentElement!==el) {
      record.paint.remove();record.paint=null;
    }
    if(!record.paint) {
      const paint=document.createElement('span');paint.className='cc-paint';paint.setAttribute('aria-hidden','true');
      const fill=document.createElement('span');fill.className='cc-fill';
      const outer=document.createElement('canvas');outer.setAttribute('aria-hidden','true');outer.classList.add('cc-vector','cc-outer-shadow');
      const vector=svg('svg',{'aria-hidden':'true',focusable:'false'});vector.classList.add('cc-vector');
      paint.append(outer,fill,vector);
      record.paint=paint;record.fill=fill;record.outer=outer;record.vector=vector;
      record.shadowKey='';record.vectorKey='';
      el.prepend(paint);
    }
    const circle=legend&&Math.abs(w-h)<.15&&legendMorph<.001;
    const morph=legend?Math.min(1,legendMorph/.2):1;
    const d=cornerPath(w,h,radius,circle,0,0,morph);
    const bLeft=parseFloat(style.borderLeftWidth)||0,bTop=parseFloat(style.borderTopWidth)||0;
    Object.assign(record.paint.style,{left:`${-bLeft}px`,top:`${-bTop}px`,width:`${w}px`,height:`${h}px`});
    record.paint.style.opacity=el.closest('.wf-phases')?'var(--wf-stage-emphasis,0)':'';
    record.scroller=/auto|scroll/.test(style.overflowX+' '+style.overflowY);
    record.paint.style.transform=record.scroller?`translate(${el.scrollLeft}px,${el.scrollTop}px)`:'';
    Object.assign(record.fill.style,{
      backgroundColor:style.backgroundColor,
      // Keep the shared animated viewport field live. Resolving its computed
      // gradient here would freeze one frame in a capability-fallback surface.
      backgroundImage:el.classList.contains('brand-field-fill')?'var(--brand-field-layers)':style.backgroundImage,
      backgroundSize:el.classList.contains('brand-field-fill')?'var(--brand-field-sizes)':style.backgroundSize,
      backgroundPosition:el.classList.contains('brand-field-fill')?'var(--brand-field-positions)':style.backgroundPosition,
      backgroundRepeat:style.backgroundRepeat,backgroundOrigin:style.backgroundOrigin,
      backgroundAttachment:style.backgroundAttachment,
      clipPath:`path("${d}")`,webkitClipPath:`path("${d}")`,
      backdropFilter:style.backdropFilter||style.webkitBackdropFilter||'none',
      webkitBackdropFilter:style.webkitBackdropFilter||style.backdropFilter||'none'
    });
    buildVector(record,d,style,w,h);
    el.classList.add('cc-host');
    if(style.position==='static') el.classList.add('cc-static');
    const unclip=style.overflowX==='hidden'&&style.overflowY==='hidden';
    if(unclip) {
      el.classList.add('cc-unclip');
      for(const child of el.children) {
        if(child===record.paint) continue;
        if(!record.clips.some(item=>item.el===child)) record.clips.push({el:child,clip:child.style.clipPath,webkit:child.style.webkitClipPath});
        let x=(child.offsetLeft||0)+bLeft,y=(child.offsetTop||0)+bTop;
        // offsetLeft/Top omit transforms. In particular, the legend's centered
        // toggle uses top:50% + translateY(-50%); omitting that translation
        // shifts its circular content clip up and cuts the icon in half.
        const transform=getComputedStyle(child).transform;
        if(transform!=='none') {
          const matrix=new DOMMatrixReadOnly(transform);
          if(matrix.is2D&&matrix.a===1&&matrix.b===0&&matrix.c===0&&matrix.d===1) {
            x+=matrix.e;y+=matrix.f;
          }
        }
        const childPath=cornerPath(w,h,radius,circle,-x,-y,morph);
        child.classList.add('cc-content-clip');child.style.clipPath=`path("${childPath}")`;child.style.webkitClipPath=`path("${childPath}")`;
      }
    } else for(const item of record.clips) {
      item.el.classList.remove('cc-content-clip');item.el.style.clipPath=item.clip;item.el.style.webkitClipPath=item.webkit;
    }
    if(!unclip) record.clips=[];
    record.path=d;
    finishMeasure(el);
  }
  function finishMeasure(el) {
    // Commit transparent host paint while paint transitions are suppressed.
    // Otherwise restoring transitions interpolates its shadow to none; that
    // transitionend schedules another measurement and repeats even at rest.
    void getComputedStyle(el).boxShadow;
    el.classList.remove('cc-measuring');
    el.style.removeProperty('--cc-measure-transitions');
  }
  function flush() {
    frame=0;observer.disconnect();
    const pending=[...dirty];dirty.clear();
    for(const el of pending) {
      const record=records.get(el);
      if(!el.isConnected) {resize.unobserve(el);shadowVisibility.unobserve(el);record.paint?.remove();records.delete(el);continue;}
      measure(record);
    }
    observe();
  }
  const shadowVisibility=new IntersectionObserver(entries=>{
    for(const entry of entries) {
      const record=records.get(entry.target);if(!record)continue;
      if(record.shadowVisible!==entry.isIntersecting) {record.shadowVisible=entry.isIntersecting;schedule(entry.target);}
    }
  },{rootMargin:'200px'});
  const resize=new ResizeObserver(entries=>{
    for(const entry of entries) {
      const record=records.get(entry.target);if(!record) continue;
      const size=entry.borderBoxSize?.[0];
      const w=size?.inlineSize||entry.target.offsetWidth,h=size?.blockSize||entry.target.offsetHeight;
      if(Math.abs(w-record.width)>.05||Math.abs(h-record.height)>.05) {
        record.width=w;record.height=h;
        if(entry.target.matches('.wf-legend.is-floating')) {
          // Its fixed right edge moves the host's left edge on every width
          // sample. Commit that sample's contour before paint, rather than
          // carrying the previous wider surface into the next animation frame.
          dirty.delete(entry.target);
          measure(record);
        } else schedule(entry.target);
      }
    }
  });
  function markAll() {for(const el of records.keys()) schedule(el);}
  function near(target) {for(let el=target instanceof Element?target:null;el;el=el.parentElement) schedule(el);}
  const brandPaintProperties=new Set(['--brand-underpage-color','--brand-underpage-tint','--brand-field-image','--brand-sample-position','--brand-sample-size','--brand-sample-grain','--brand-sample-grain-position',
    '--brand-edge-frame','--brand-edge-size','--brand-edge-position','--brand-edge-grain-position']);
  // Parse old inline declarations with the browser, including quoted/data URLs
  // and !important. This detached style never participates in document layout.
  const previousInlineStyle=document.createElement('span').style;
  function onlyBrandPaintChanged(target,oldValue) {
    previousInlineStyle.cssText=oldValue||'';
    const current=target.style;
    let previousCount=0,currentCount=0;
    for(let i=0;i<previousInlineStyle.length;i++) {
      const name=previousInlineStyle.item(i);
      if(brandPaintProperties.has(name)) continue;
      previousCount++;
      if(previousInlineStyle.getPropertyValue(name)!==current.getPropertyValue(name)||
          previousInlineStyle.getPropertyPriority(name)!==current.getPropertyPriority(name)) return false;
    }
    for(let i=0;i<current.length;i++) if(!brandPaintProperties.has(current.item(i))) currentCount++;
    return previousCount===currentCount;
  }
  function observe() {observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeOldValue:true,attributeFilter:['class','style','data-theme','data-open','aria-pressed','aria-selected','aria-expanded','aria-current','hidden','data-scope']});}
  function start() {
    document.documentElement.classList.add('cc-fallback');
    observer=new MutationObserver(changes=>{
      const previousStyles=new Map(),handledStyles=new Set();
      for(const change of changes) if(change.type==='attributes'&&change.attributeName==='style'&&!owned(change.target)&&!previousStyles.has(change.target)) {
        // Compare the first state in this batch with its final state. Looking
        // only at a later paint-variable mutation could hide a real resize or
        // material change that happened earlier in the same task.
        previousStyles.set(change.target,change.oldValue);
      }
      for(const change of changes) {
        if(owned(change.target)) continue;
        if(change.type==='attributes'&&change.attributeName==='style') {
          if(handledStyles.has(change.target)) continue;
          handledStyles.add(change.target);
          if(onlyBrandPaintChanged(change.target,previousStyles.get(change.target))) continue;
        }
        if(change.type==='childList') {
          for(const node of change.addedNodes) if(node instanceof Element&&!owned(node)) discover(node);
          near(change.target);
        } else if(change.target===document.documentElement||change.target===document.body) {
          markAll();
        } else {
          near(change.target);
          if(change.attributeName!=='style') {
            discover(change.target);
            for(const el of change.target.querySelectorAll(SELECTOR)) schedule(el);
          }
        }
      }
    });
    discover(document);observe();
    for(const event of ['pointerover','pointerout','pointerdown','pointerup','focusin','focusout','change']) document.addEventListener(event,e=>near(e.target),true);
    document.addEventListener('scroll',e=>{
      const record=records.get(e.target);
      if(record?.paint&&record.scroller) record.paint.style.transform=`translate(${e.target.scrollLeft}px,${e.target.scrollTop}px)`;
    },{capture:true,passive:true});
    document.addEventListener('transitionend',e=>near(e.target),true);
    addEventListener('resize',markAll,{passive:true});
    for(const query of ['(prefers-color-scheme: dark)','(prefers-reduced-transparency: reduce)','(prefers-contrast: more)']) matchMedia(query).addEventListener('change',markAll);
    document.fonts?.ready.then(markAll);
    window.ContinuousCorners={refresh:markAll,source:'SwiftUI continuous / three cubics',get count(){return [...records.values()].filter(r=>r.paint).length;}};
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
