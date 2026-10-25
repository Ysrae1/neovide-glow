/* Automatic media waits for a full two seconds without scrolling input. */
(() => {
  'use strict';
  const delay=2000;
  let lastActivity=performance.now(),timer;
  const remaining=()=>Math.max(0,delay-(performance.now()-lastActivity));
  function idle(){
    const wait=remaining();
    if(wait>0){timer=setTimeout(idle,wait);return;}
    document.dispatchEvent(new Event('glow:scrollidle'));
  }
  function activity(){
    lastActivity=performance.now();clearTimeout(timer);
    document.dispatchEvent(new Event('glow:scrollactivity'));
    timer=setTimeout(idle,delay);
  }
  window.GlowPlaybackIdle={remaining};
  addEventListener('wheel',activity,{passive:true,capture:true});
  addEventListener('scroll',activity,{passive:true});
  addEventListener('touchmove',activity,{passive:true});
  addEventListener('keydown',event=>{
    if(!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))return;
    if(event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable="true"],button,video'))return;
    activity();
  });
  timer=setTimeout(idle,delay);
})();
