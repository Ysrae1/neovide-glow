// Shared colour/opacity math only. Each browser keeps its own native painter.
import { colorInputs, clampAlpha } from './shadow-formula.js?v=shadow-final6';
import { createHeroBeamSampler } from './hero-beam-sampler.js?v=shadow-20261026';
export function createShadowSampler() {
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d',{willReadFrequently:true});
  const paintBeams=createHeroBeamSampler();
  return function sample(decoded,field,box,pad,veil,formula,enabled=true) {
    if(!context)return null;
    const sx=box.scaleX,sy=box.scaleY;
    const width=box.width/sx+2*pad,height=box.height/sy+2*pad;
    canvas.width=Math.max(1,Math.ceil(width/3));canvas.height=Math.max(1,Math.ceil(height/3));
    const dx=canvas.width/(width*sx),dy=canvas.height/(height*sy);
    const left=box.left-pad*sx,top=box.top-pad*sy;
    const first=Math.floor((top-field.top)/field.frameHeight);
    const last=Math.floor((top+height*sy-field.top)/field.frameHeight);
    for(let tile=first;tile<=last;tile++)context.drawImage(decoded,
      (field.left-left)*dx,(field.top+tile*field.frameHeight-top)*dy,field.frameWidth*dx,field.frameHeight*dy);
    const alpha=context.getImageData(0,0,canvas.width,canvas.height);
    context.fillStyle=veil;context.fillRect(0,0,canvas.width,canvas.height);
    paintBeams(context,{left,top,width:width*sx,height:height*sy});
    const background=context.getImageData(0,0,canvas.width,canvas.height).data;
    const pixels=alpha.data;let min=1,max=0;
    for(let i=0;i<pixels.length;i+=4) {
      const {c,d}=colorInputs([pixels[i],pixels[i+1],pixels[i+2]],[background[i],background[i+1],background[i+2]]);
      const weight=enabled?clampAlpha(formula.compiled.evaluate(c,d)):0;
      min=Math.min(min,weight);max=Math.max(max,weight);
      pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(255*weight);
    }
    context.putImageData(alpha,0,0);
    return {canvas,alpha,min,max,width,height};
  };
}
