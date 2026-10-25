/* Palette controls for the same colour field used by the product page. */
import { createColourField } from './field-renderer.js?v=20261025-hero-shadow1';

const canvas=document.querySelector('body > canvas[aria-label="Glow 品牌动态色场"]');
if(canvas){
  const holes=[...document.querySelectorAll('.glass-preview-hole')].map(el=>({
    el, canvas:el.querySelector('canvas'), grain:el.querySelector('.field-hole-grain'),
    context:el.querySelector('canvas')?.getContext('2d'), last:''
  }));
  const noise=getComputedStyle(document.body,'::after').backgroundImage;
  for(const hole of holes) if(hole.grain) hole.grain.style.backgroundImage=noise;
  function drawOpenings(source){
    for(const hole of holes){
      const r=hole.el.getBoundingClientRect();
      if(!hole.context||!r.width||!r.height)continue;
      const density=Math.min(devicePixelRatio||1,2);
      const width=Math.round(r.width*density),height=Math.round(r.height*density);
      if(hole.canvas.width!==width)hole.canvas.width=width;
      if(hole.canvas.height!==height)hole.canvas.height=height;
      hole.context.clearRect(0,0,width,height);
      hole.context.drawImage(source,r.left*source.width/innerWidth,r.top*source.height/innerHeight,
        r.width*source.width/innerWidth,r.height*source.height/innerHeight,0,0,width,height);
      const position=`${-r.left}px ${-r.top}px`;
      if(hole.grain&&hole.last!==position){hole.grain.style.backgroundPosition=position;hole.last=position;}
    }
  }
  const renderer=createColourField({
    canvas,
    onFrame:drawOpenings,
    onState(pair){
      dispatchEvent(new CustomEvent('glow:field-state',{detail:{pair}}));
    },
    onError(error){
      document.documentElement.dataset.renderer=canvas.dataset.renderer;
      canvas.hidden=true;
      console.error('Color-field WebGL preview could not render',error);
    },
  });
  document.documentElement.dataset.renderer=canvas.dataset.renderer;
  const changePalette=event=>renderer.setPalette(event.detail||{});
  const changePause=event=>renderer.setPaused(event.detail?.paused);
  const changeBlur=event=>renderer.setBlur(event.detail?.passes);
  const changeSpeed=event=>renderer.setSpeed(event.detail?.speed);
  addEventListener('glow:palette-change',changePalette);
  addEventListener('glow:field-pause',changePause);
  addEventListener('glow:field-blur',changeBlur);
  addEventListener('glow:field-speed',changeSpeed);
  function cleanup(event){
    if(event.persisted)return;
    removeEventListener('glow:palette-change',changePalette);
    removeEventListener('glow:field-pause',changePause);
    removeEventListener('glow:field-blur',changeBlur);
    removeEventListener('glow:field-speed',changeSpeed);
    removeEventListener('pagehide',cleanup);
  }
  addEventListener('pagehide',cleanup);
}
