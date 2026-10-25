/* One colour-field implementation for the palette preview and product masks.
 * Kawarp 1.3.1 (MIT): WebGL domain warp + cached, small-texture Kawase blur.
 * onFrame runs synchronously after rendering, while the WebGL buffer is intact.
 * canRender runs before source/GPU work; false retains one latest pending update.
 */
import { Kawarp } from './vendor/kawarp-1.3.1.js?v=20261025-overscan1';
import { FIELD_PRESET } from './field-preset.js?v=shadow-final6';

export function createColourField({
  canvas,settings=FIELD_PRESET,reduced=()=>false,
  onFrame=()=>{},onState=()=>{},onError=()=>{},canRender=()=>true,fps=30,maxEdge=960,
  measureViewport=null, viewportController=window.GlowViewport,
}={}){
  if(!canvas?.getContext)throw new TypeError('A colour-field canvas is required');
  const systemReduced=matchMedia('(prefers-reduced-motion: reduce)');
  const initial={...FIELD_PRESET,...settings};
  const frameInterval=1000/(Number.isFinite(fps)&&fps>0?fps:30);
  const edgeLimit=Number.isFinite(maxEdge)&&maxEdge>0?maxEdge:960;
  const getViewport=typeof measureViewport==='function'?measureViewport:()=>({width:innerWidth,height:innerHeight});
  const motionReduced=()=>systemReduced.matches||reduced();
  const size=128,orbitRadius=1.25,orbitSpeed=.09,softness=.085;
  const orbitCenter={x:.5,y:1.4};
  let colours=[...initial.colours];
  const toRGB=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  let rgb=colours.map(toRGB);
  let enabled=[...initial.enabled],sourceIndices=[],sourceRGB=[];
  let renderer,frame=0,nextRender=-Infinity,elapsed=0,previous=null,renders=0;
  let unsubscribeViewport=null,lastViewportSize='';
  let pendingRender=false,pendingForce=false,pendingResize=false,pendingBlur=null,blockedRenders=0;
  let rotationOffset=-Math.PI/2,lastTexture=-Infinity,textureTime=-1,shownPair='';
  let activeSources=[];
  let frameViewport;
  let paused=initial.paused,failed=false,disposed=false,suspended=false,speed=initial.speed;
  const inactive=()=>paused||suspended||document.hidden||motionReduced();
  const data=new Uint8Array(size*size*4);
  let sourceCount=0,angleStep=0,sourceRadius=orbitRadius,sourceCenterY=orbitCenter.y;
  let slopeX,slopeY,originScore,scores,weights,coverage,rowSources,exponents,weightStep;
  for(let offset=3;offset<data.length;offset+=4)data[offset]=255;

  function rebuildSources(){
    sourceIndices=enabled.flatMap((participates,index)=>participates?[index]:[]);
    sourceCount=sourceIndices.length;
    angleStep=2*Math.PI/sourceCount;
    // More saved sources expand the orbit, keeping the visible arc's regions large.
    sourceRadius=orbitRadius*Math.max(1,sourceCount/10);
    sourceCenterY=orbitCenter.y-orbitRadius+sourceRadius;
    slopeX=new Float64Array(sourceCount);
    slopeY=new Float64Array(sourceCount);
    originScore=new Float64Array(sourceCount);
    scores=new Float64Array(sourceCount);
    weights=new Float64Array(sourceCount);
    coverage=new Float64Array(sourceCount);
    rowSources=new Uint32Array(sourceCount);
    exponents=new Float64Array(sourceCount);
    weightStep=new Float64Array(sourceCount);
    activeSources=activeSources.filter(index=>enabled[index]);
  }
  rebuildSources();
  sourceRGB=sourceIndices.map(index=>rgb[index]);

  // Each color owns one moving source on a large orbit mostly below the viewport.
  // Only a short arc enters view, so two or three large regions dominate together.
  // Equal-variance Gaussian weights give each source a convex unwarped main region.
  // Their common distance terms cancel, leaving linear scores before normalization.
  function positionSources(){
    const rotation=rotationOffset+elapsed*orbitSpeed;
    const factor=2*sourceRadius/softness;
    for(let index=0;index<sourceCount;index++){
      const angle=rotation+index*angleStep;
      const x=factor*Math.cos(angle),y=factor*Math.sin(angle);
      slopeX[index]=x/(size-1);
      slopeY[index]=y/(size-1);
      originScore[index]=-x*orbitCenter.x-y*sourceCenterY;
      weightStep[index]=Math.exp(slopeX[index]);
    }
    canvas.dataset.rotation=rotation.toFixed(3);
  }
  function publishPair(pair,force=false){
    const key=pair.join(',');
    if(force||key!==shownPair){
      shownPair=key;
      canvas.dataset.pair=key;
      onState([...pair]);
    }
  }
  function updateColourMap(now,force=false){
    if(!force&&(now-lastTexture<1000/15||textureTime===elapsed))return;
    positionSources();
    coverage.fill(0);
    // exp(score + slope) = exp(score) * exp(slope); the shared anchor cancels
    // during normalization. Rebase before ranges can overflow or lose a future contributor.
    // The normal palette needs one anchor per row; large palettes use blocks.
    const exponentStride=Math.max(1,Math.min(size,Math.floor(300*(size-1)/(2*sourceRadius/softness))));
    for(let y=0;y<size;y++){
      // Every linear score stays between its row endpoints. This lower bound
      // on their maximum lets us omit sources below the existing -12 cutoff
      // for the entire row, without approximating any visible contribution.
      let rowFloor=-Infinity,rowCount=0;
      for(let index=0;index<sourceCount;index++){
        scores[index]=originScore[index]+slopeY[index]*y;
        rowFloor=Math.max(rowFloor,Math.min(scores[index],scores[index]+slopeX[index]*(size-1)));
      }
      const rowCutoff=rowFloor-12-1e-9*(1+Math.abs(rowFloor));
      for(let index=0;index<sourceCount;index++){
        if(Math.max(scores[index],scores[index]+slopeX[index]*(size-1))>=rowCutoff)rowSources[rowCount++]=index;
      }
      for(let x=0;x<size;x++){
        let maximum=-Infinity,total=0,red=0,green=0,blue=0;
        for(let slot=0;slot<rowCount;slot++)maximum=Math.max(maximum,scores[rowSources[slot]]);
        if(x%exponentStride===0)for(let slot=0;slot<rowCount;slot++){
          const index=rowSources[slot];
          exponents[index]=Math.exp(scores[index]-maximum);
        }
        for(let slot=0;slot<rowCount;slot++){
          const index=rowSources[slot];
          const distance=scores[index]-maximum;
          // Distant sources contribute below a visible byte; avoid their exp work.
          const weight=distance>-12?exponents[index]:0;
          weights[index]=weight;
          total+=weight;
          red+=sourceRGB[index][0]*weight;
          green+=sourceRGB[index][1]*weight;
          blue+=sourceRGB[index][2]*weight;
          scores[index]+=slopeX[index];
          exponents[index]*=weightStep[index];
        }
        const offset=(y*size+x)*4;
        const inverseTotal=1/total;
        data[offset]=Math.round(red*inverseTotal);
        data[offset+1]=Math.round(green*inverseTotal);
        data[offset+2]=Math.round(blue*inverseTotal);
        for(let slot=0;slot<rowCount;slot++){
          const index=rowSources[slot];
          coverage[index]+=weights[index]*inverseTotal;
        }
      }
    }
    renderer.loadImageData(data,size,size);
    activeSources=Array.from({length:sourceCount},(_,index)=>index)
      .sort((a,b)=>coverage[b]-coverage[a])
      .filter(index=>coverage[index]>size*size*.04)
      .slice(0,3)
      .map(index=>sourceIndices[index]);
    publishPair(activeSources,force);
    textureTime=elapsed;
    lastTexture=now;
  }
  function stop(){cancelAnimationFrame(frame);frame=0;previous=null;}
  function fail(error,status='unavailable'){
    if(failed||disposed)return;
    failed=true;
    stop();
    pendingRender=pendingForce=pendingResize=false;
    pendingBlur=null;
    canvas.dataset.renderer=status;
    canvas.dataset.paused='true';
    onError(error);
  }
  function render(now=performance.now(),force=false){
    if(!renderer||failed||disposed||suspended)return false;
    // Coalesce edits while the shared-frame consumer is busy. Keep a forced
    // source refresh until it is actually submitted, including while paused.
    pendingRender=true;
    pendingForce=pendingForce||force;
    if(document.hidden)return false;
    if(!canRender()){blockedRenders++;return false;}
    if(pendingResize){applyResize();pendingResize=false;}
    if(pendingBlur!==null){renderer.blurPasses=pendingBlur;pendingBlur=null;}
    updateColourMap(now,pendingForce);
    renderer.renderFrame(elapsed*2);
    renders++;
    pendingRender=pendingForce=false;
    canvas.dataset.time=elapsed.toFixed(2);
    // The immutable geometry belongs to this drawing buffer, including while
    // the consumer asynchronously encodes/decodes it across a later resize.
    onFrame(canvas,{seconds:elapsed,renders,viewport:frameViewport});
    return true;
  }
  function applyResize(){
    // Soft color fields do not need a retina-size fragment pass.
    const measured=getViewport();
    const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;
    const width=positive(measured?.width,innerWidth);
    const height=positive(measured?.height,innerHeight);
    const inset=value=>Number.isFinite(value)&&value>0?value:0;
    const top=inset(measured?.overscanTop),bottom=inset(measured?.overscanBottom);
    const fullHeight=height+top+bottom;
    frameViewport=Object.freeze({width,height,frameWidth:width,frameHeight:fullHeight,
      left:0,top:top?-top:0,overscanTop:top,overscanBottom:bottom});
    const ratio=Math.min(1,edgeLimit/Math.max(width,fullHeight));
    const bitmapWidth=Math.max(1,Math.round(width*ratio));
    const bitmapHeight=Math.max(1,Math.round(fullHeight*ratio));
    if(canvas.width!==bitmapWidth)canvas.width=bitmapWidth;
    if(canvas.height!==bitmapHeight)canvas.height=bitmapHeight;
    // WebGL UV is bottom-up: the added bottom band starts below UV zero.
    if(renderer)renderer.viewportUV=[0,bottom?-bottom/height:0,1,fullHeight/height];
    renderer?.resize();
  }
  function schedule(){
    if(!frame&&!failed&&!disposed&&!suspended&&!document.hidden&&(!inactive()||pendingRender))frame=requestAnimationFrame(tick);
  }
  function requestRender(force=false){
    // All mutations enter the same cadence; resize and palette edits never
    // bypass tick or burst extra WebGL frames while browser chrome animates.
    pendingRender=true;
    pendingForce=pendingForce||force;
    schedule();
  }
  function resize(){
    if(failed||disposed||suspended)return;
    if(!renderer){applyResize();return;}
    pendingResize=true;
    requestRender();
  }
  function tick(now){
    frame=0;
    if(failed||disposed||suspended||document.hidden)return;
    const moving=!inactive();
    if(moving){
      if(previous!==null)elapsed+=(now-previous)/1000*speed;
      previous=now;
    }else previous=null;
    try{
      if((moving||pendingRender)&&now+.5>=nextRender){
        render(now);
        // Keep the scheduled cadence through sub-millisecond rAF jitter. A late
        // callback skips missed work rather than starting a burst of catch-up frames.
        const deadline=nextRender+frameInterval;
        nextRender=Number.isFinite(deadline)&&deadline>now-.5?deadline:now+frameInterval;
      }
      schedule();
    }catch(error){fail(error);}
  }
  function refresh(){
    stop();
    if(!renderer||failed||disposed||suspended)return;
    canvas.dataset.paused=String(inactive());
    requestRender();
  }
  function setPalette(detail={}){
    if(!renderer||failed||disposed||suspended)return;
    const incoming=detail.colours;
    if(!Array.isArray(incoming)||incoming.length===0||!incoming.every(hex=>typeof hex==='string'&&/^#[\da-f]{6}$/i.test(hex)))return;
    const incomingEnabled=detail.enabled===undefined?incoming.map((_,index)=>enabled[index]??true):detail.enabled;
    if(!Array.isArray(incomingEnabled)||incomingEnabled.length!==incoming.length||!incomingEnabled.every(value=>typeof value==='boolean')||!incomingEnabled.some(Boolean))return;
    const sourcesChanged=incoming.length!==colours.length||incomingEnabled.some((value,index)=>value!==enabled[index]);
    colours=[...incoming];
    rgb=colours.map(toRGB);
    if(sourcesChanged){
      enabled=[...incomingEnabled];
      rebuildSources();
    }
    sourceRGB=sourceIndices.map(index=>rgb[index]);
    // Bring an inactive source onto the viewport's centerline for immediate editing.
    // This changes only its orbit angle; the GPU's fluid-motion clock keeps running.
    const sourceIndex=Number.isInteger(detail.index)?sourceIndices.indexOf(detail.index):-1;
    if(sourceIndex>=0&&!activeSources.includes(detail.index)){
      rotationOffset=-Math.PI/2-sourceIndex*angleStep-elapsed*orbitSpeed;
    }
    requestRender(true);
  }
  function setPaused(value){
    if(typeof value!=='boolean'||failed||disposed)return;
    paused=value;
    refresh();
  }
  function setBlur(value){
    if(!renderer||failed||disposed||!Number.isFinite(value))return;
    const passes=Math.max(2,Math.min(12,Math.round(value)));
    pendingBlur=passes;
    canvas.dataset.blur=String(passes);
    requestRender(true);
  }
  function setSpeed(value){
    if(failed||disposed||!Number.isFinite(value))return;
    speed=Math.max(.25,Math.min(6,value));
    canvas.dataset.speed=String(speed);
  }
  function contextLost(event){
    event.preventDefault();
    const error=new Error('The colour-field WebGL context was lost');
    error.name='WebGLContextLostError';
    fail(error,'context-lost');
  }
  function pageHide(event){
    if(!event.persisted){dispose();return;}
    suspended=true;
    stop();
    canvas.dataset.paused='true';
  }
  function pageShow(event){
    if(!event.persisted||disposed||failed)return;
    suspended=false;
    pendingResize=true;
    refresh();
  }
  function dispose(){
    if(disposed)return;
    disposed=true;
    stop();
    pendingRender=pendingForce=pendingResize=false;
    pendingBlur=null;
    unsubscribeViewport?.();
    removeEventListener('resize',resize);
    if(measureViewport)visualViewport?.removeEventListener('resize',resize);
    removeEventListener('pagehide',pageHide);
    removeEventListener('pageshow',pageShow);
    document.removeEventListener('visibilitychange',refresh);
    systemReduced.removeEventListener('change',refresh);
    canvas.removeEventListener('webglcontextlost',contextLost);
    renderer?.dispose();
    canvas.dataset.paused='true';
  }
  try{
    resize();
    canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'});
    renderer=new Kawarp(canvas,{warpIntensity:.45,blurPasses:initial.blur,saturation:1.12,tintIntensity:0,dithering:.002,scale:1,transitionDuration:0});
    applyResize();
    canvas.dataset.blur=String(initial.blur);
    canvas.dataset.speed=String(speed);
    canvas.dataset.renderer='webgl-domain-warp';
    pendingForce=true;
    if(viewportController){
      unsubscribeViewport=viewportController.subscribe({
        phase:'paint',
        measure(){const measured=getViewport();return `${measured.width}/${measured.height}/${measured.overscanTop||0}/${measured.overscanBottom||0}`;},
        commit(state,size){if(size!==lastViewportSize){lastViewportSize=size;resize();}}
      },90);
    }else{
      addEventListener('resize',resize,{passive:true});
      if(measureViewport)visualViewport?.addEventListener('resize',resize,{passive:true});
    }
    document.addEventListener('visibilitychange',refresh);
    systemReduced.addEventListener('change',refresh);
    canvas.addEventListener('webglcontextlost',contextLost);
    addEventListener('pagehide',pageHide);
    addEventListener('pageshow',pageShow);
    refresh();
  }catch(error){fail(error);}
  return Object.freeze({
    setPalette,setPaused,setSpeed,setBlur,refresh,dispose,
    get state(){
      return {
        running:!!frame,seconds:elapsed,renders,paused,
        pending:pendingRender,blockedRenders,
        reduced:motionReduced(),failed,disposed,suspended,speed,
        pair:[...activeSources],renderer:canvas.dataset.renderer,viewport:frameViewport,
      };
    },
  });
}
