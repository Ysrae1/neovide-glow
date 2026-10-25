// Colour estimate for the hero's existing CSS light beams. The visible beams
// remain native CSS; this small cached model is only used by contrast sampling.
// It deliberately excludes grain and the text's own glow/shadow (no feedback).
// CSS stacking contexts isolate blending: https://www.w3.org/TR/compositing-1/
// Sampling at about 3 CSS px and a truncated Gaussian is not screenshot parity.

const clamp01=value=>Math.max(0,Math.min(1,value));
const number=(value,fallback=0)=>Number.isFinite(parseFloat(value))?parseFloat(value):fallback;
const blurRadius=value=>number(/blur\(\s*([\d.]+)px\s*\)/.exec(value||'')?.[1]);

// Exported for the small numeric regression check; input/output are straight
// RGBA bytes, filtering itself uses premultiplied channels to avoid dark halos.
export function blurBeamPixels(bytes,width,height,sigma) {
  if(!(sigma>.05))return new Uint8ClampedArray(bytes);
  const radius=Math.ceil(3*sigma),kernel=new Float64Array(2*radius+1);
  let sum=0;
  for(let i=-radius;i<=radius;i++){const v=Math.exp(-i*i/(2*sigma*sigma));kernel[i+radius]=v;sum+=v;}
  for(let i=0;i<kernel.length;i++)kernel[i]/=sum;
  const source=new Float32Array(bytes.length),horizontal=new Float32Array(bytes.length);
  for(let i=0;i<bytes.length;i+=4){const a=bytes[i+3]/255;source[i]=bytes[i]*a;source[i+1]=bytes[i+1]*a;source[i+2]=bytes[i+2]*a;source[i+3]=bytes[i+3];}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const out=(y*width+x)*4;
    for(let k=Math.max(-radius,-x);k<=Math.min(radius,width-1-x);k++){
      const index=out+k*4,weight=kernel[k+radius];
      for(let c=0;c<4;c++)horizontal[out+c]+=source[index+c]*weight;
    }
  }
  const result=new Uint8ClampedArray(bytes.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const out=(y*width+x)*4;let r=0,g=0,b=0,a=0;
    for(let k=Math.max(-radius,-y);k<=Math.min(radius,height-1-y);k++){
      const index=out+k*width*4,weight=kernel[k+radius];
      r+=horizontal[index]*weight;g+=horizontal[index+1]*weight;
      b+=horizontal[index+2]*weight;a+=horizontal[index+3]*weight;
    }
    if(a>0){result[out]=r*255/a;result[out+1]=g*255/a;result[out+2]=b*255/a;}
    result[out+3]=a;
  }
  return result;
}

function splitArguments(value) {
  const parts=[];let depth=0,start=0;
  for(let i=0;i<value.length;i++){
    if(value[i]==='(')depth++;
    else if(value[i]===')')depth--;
    else if(value[i]===','&&depth===0){parts.push(value.slice(start,i).trim());start=i+1;}
  }
  parts.push(value.slice(start).trim());return parts;
}
function paintGradient(ctx,image,x,y,width,height,radius) {
  if(!image?.startsWith('linear-gradient('))return;
  const parts=splitArguments(image.slice(16,-1));
  const heading=parts[0];
  // These are the site's vertical 180deg gradients, read from computed CSS.
  if(/^(?:180deg|to bottom)$/.test(heading))parts.shift();
  else if(!/^(?:rgba?\(|#[\da-f]|transparent)/i.test(heading))throw new Error('Unsupported hero beam gradient direction');
  const gradient=ctx.createLinearGradient(0,y,0,y+height);
  for(const part of parts){
    const match=/^(.*?)\s+([\d.]+)%$/.exec(part);
    if(!match)throw new Error('Hero beam gradient needs explicit percentage stops');
    gradient.addColorStop(clamp01(Number(match[2])/100),match[1]);
  }
  ctx.fillStyle=gradient;ctx.beginPath();ctx.roundRect(x,y,width,height,Math.min(radius,width/2,height/2));ctx.fill();
}
function canvas(width,height) {
  const el=document.createElement('canvas');el.width=width;el.height=height;return el;
}
function blurCanvas(el,sigma) {
  if(!(sigma>.05))return;
  const ctx=el.getContext('2d',{willReadFrequently:true});
  const pixels=ctx.getImageData(0,0,el.width,el.height);
  pixels.data.set(blurBeamPixels(pixels.data,el.width,el.height,sigma));ctx.putImageData(pixels,0,0);
}
function makeTexture(style,core,width,height) {
  const blur=blurRadius(style.filter),coreBlur=blurRadius(core.filter);
  const pad=Math.ceil(4*(blur+coreBlur)+3);
  const scale=Math.min(1/3,768/(height+pad*2));
  const texture=canvas(Math.ceil((width+pad*2)*scale),Math.ceil((height+pad*2)*scale));
  const ctx=texture.getContext('2d',{willReadFrequently:true});ctx.scale(scale,scale);
  const radius=number(style.borderTopLeftRadius,width/2);
  paintGradient(ctx,style.backgroundImage,pad,pad,width,height,radius);
  if(core.content!=='none'&&core.display!=='none'&&core.backgroundImage!=='none'){
    const centre=canvas(texture.width,texture.height),cc=centre.getContext('2d',{willReadFrequently:true});
    cc.scale(scale,scale);
    // Computed inset/width are px on supported Safari and Chromium versions.
    const left=String(core.left).endsWith('%')?width*number(core.left)/100:number(core.left,width*.36);
    const right=String(core.right).endsWith('%')?width*number(core.right)/100:number(core.right,width*.36);
    const top=number(core.top),bottom=number(core.bottom);
    paintGradient(cc,core.backgroundImage,pad+left,pad+top,Math.max(0,width-left-right),Math.max(0,height-top-bottom),number(core.borderTopLeftRadius,radius));
    blurCanvas(centre,coreBlur*scale);
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=clamp01(number(core.opacity,1));ctx.drawImage(centre,0,0);ctx.restore();
  }
  blurCanvas(texture,blur*scale);
  return {texture,pad,scale,width:texture.width/scale,height:texture.height/scale};
}

// Matrix translation and transform-origin are already present in rect. Using
// transformed corner minima avoids applying either a second time.
export function beamPlacement(matrix,rect,width,height,scrollLeft=0,scrollTop=0) {
  const xs=[0,matrix.a*width,matrix.c*height,matrix.a*width+matrix.c*height];
  const ys=[0,matrix.b*width,matrix.d*height,matrix.b*width+matrix.d*height];
  const minX=Math.min(...xs),minY=Math.min(...ys);
  const sx=rect.width/(Math.max(...xs)-minX)||1,sy=rect.height/(Math.max(...ys)-minY)||1;
  return {a:matrix.a*sx,b:matrix.b*sy,c:matrix.c*sx,d:matrix.d*sy,
    e:rect.left+scrollLeft-minX*sx,f:rect.top+scrollTop-minY*sy};
}

export function createHeroBeamSampler() {
  const textures=new WeakMap();
  const group=canvas(1,1),gc=group.getContext('2d');
  let warned=false;
  return function paint(context,{left,top,width,height}) {
    if(!(width>0&&height>0))return;
    const glow=document.querySelector('.hero .glow');if(!glow)return;
    const groupStyle=getComputedStyle(glow),opacity=clamp01(number(groupStyle.opacity,1));
    if(groupStyle.display==='none'||groupStyle.visibility==='hidden'||opacity===0)return;
    const cw=context.canvas.width,ch=context.canvas.height;
    if(group.width!==cw)group.width=cw;if(group.height!==ch)group.height=ch;
    gc.setTransform(1,0,0,1,0,0);gc.clearRect(0,0,cw,ch);
    const dx=cw/width,dy=ch/height;
    try {
      for(const beam of glow.querySelectorAll('.band')){
        const style=getComputedStyle(beam),alpha=clamp01(number(style.opacity,1));
        if(style.display==='none'||style.visibility==='hidden'||alpha===0)continue;
        const w=number(style.width,beam.offsetWidth),h=number(style.height,beam.offsetHeight);
        if(!(w>0&&h>0))continue;
        const core=getComputedStyle(beam,'::after');
        const key=JSON.stringify([w,h,style.backgroundImage,style.filter,style.borderTopLeftRadius,
          core.backgroundImage,core.filter,core.left,core.right,core.top,core.bottom,core.borderTopLeftRadius,core.content,core.display,core.opacity]);
        let cached=textures.get(beam);
        if(!cached||cached.key!==key){cached={key,...makeTexture(style,core,w,h)};textures.set(beam,cached);}
        const matrix=beamPlacement(new DOMMatrix(style.transform==='none'?undefined:style.transform),beam.getBoundingClientRect(),w,h,scrollX,scrollY);
        gc.globalAlpha=alpha;gc.globalCompositeOperation=style.mixBlendMode==='screen'?'screen':'source-over';
        gc.setTransform(dx*matrix.a,dy*matrix.b,dx*matrix.c,dy*matrix.d,dx*(matrix.e-left),dy*(matrix.f-top));
        gc.drawImage(cached.texture,-cached.pad,-cached.pad,cached.width,cached.height);
      }
      // .glow is a stacking context (transform + positioned z-index), so its
      // children blend on transparent, then the group is composited normally.
      context.save();context.setTransform(1,0,0,1,0,0);
      context.globalCompositeOperation='source-over';context.globalAlpha=opacity;
      context.drawImage(group,0,0);context.restore();
    } catch(error) {
      if(!warned)console.warn('Hero beam background estimate unavailable',error);
      warned=true;
    }
  };
}
