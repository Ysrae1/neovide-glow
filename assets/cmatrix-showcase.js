/* SPDX-License-Identifier: GPL-3.0-or-later
 * Browser port of cmatrix-gm's GoStream scheduler, go_step and go_colors.
 * Source: portable/payload/patches/cmatrix-unimatrix.patch (unimatrix.c).
 * License text: cmatrix-showcase-LICENSE.txt in this asset directory.
 * Dashboard profile: --fade 4 --length 9:13 -o. Frame presentation is capped
 * at 20 fps; stream deadlines retain their original 30..139 ms periods.
 * Canvas font rasterization and the responsive cell grid are browser-specific.
 *
 * The scheduler was adapted from GeertJohan/gomatrix, commit cfb8e3310c1f.
 * Copyright 2013, Geert-Johan Riemer
 * Copyright 2015, Garrett D'Amore
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
(() => {
  'use strict';
  const canvas=document.getElementById('rain');
  if(!canvas)return;
  const context=canvas.getContext('2d');
  if(!context)return;
  const root=document.documentElement;
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>preference.matches||root.dataset.motion==='reduce';
  const glyphs=Array.from('｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  const rand=(low,high)=>low+Math.floor(Math.random()*(high-low+1));
  const historySize=129,fade=4,size=15;
  const palette={4:'#008000',5:'#00ff00',6:'#c0c0c0',7:'#ffffff'};
  for(let level=1;level<=8;level++){
    palette[8+2*(level-1)]=`rgb(0,${Math.floor(128*level/9)},0)`;
    palette[9+2*(level-1)]=`rgb(0,${Math.floor(255*level/9)},0)`;
  }

  // This is the native terminal-cell state, with owner IDs preventing an older
  // stream's tail from erasing or dimming a faster following stream's head.
  function createRain(rows,cols){
    const state={rows,cols,serial:0,streams:[],spawn:Array.from({length:cols},()=>rand(0,8999)/1000),owners:new Uint32Array(rows*cols),cells:Array(rows*cols).fill(null)};
    function put(row,x,glyph,pair){
      if(row>=0&&row<rows)state.cells[row*cols+x]=glyph===' '?null:{glyph,pair};
    }
    function spawn(x,now){
      const period=rand(30,139),length=rand(9,13);
      state.streams.push({x,period,length,id:++state.serial,head:0,tail:0,last:null,finished:false,glyphs:[],tones:new Uint8Array(historySize),next:now+period/1000});
      state.spawn[x]=-1;
    }
    function step(stream,now){
      const s=stream;
      if(s.head<=rows||(s.tail===0&&s.head<s.length)){
        const glyph=glyphs[rand(0,glyphs.length-1)];
        const body=rand(0,99)<66?4:5;
        if(s.last){
          const row=s.head-1;
          s.tones[row%historySize]=body===5?1:0;
          if(row<rows&&state.owners[row*cols+s.x]===s.id)put(row,s.x,s.last,body);
        }
        const head=rand(0,99)<33?6:7;
        put(s.head,s.x,glyph,head);
        s.glyphs[s.head%historySize]=glyph;
        if(s.head<rows)state.owners[s.head*cols+s.x]=s.id;
        s.last=glyph;s.head++;
      }
      if(s.tail>0||s.head>=s.length){
        if(s.tail===0)state.spawn[s.x]=now+rand(0,8999)/1000;
        if(s.tail<rows){
          const position=s.tail*cols+s.x;
          if(state.owners[position]===s.id){put(s.tail,s.x,' ',1);state.owners[position]=0;}
          s.tail++;
        }else s.finished=true;
      }
      const fadeLength=Math.min(fade,s.length-2);
      const fadeStart=s.tail>0?s.tail:s.head-s.length+1;
      for(let j=0;j<fadeLength;j++){
        const row=fadeStart+j;
        if(row<0)continue;
        if(row>=s.head-1||row>=rows)break;
        if(state.owners[row*cols+s.x]!==s.id)continue;
        const level=Math.floor((j+1)*9/(fadeLength+1));
        put(row,s.x,s.glyphs[row%historySize],8+2*(level-1)+s.tones[row%historySize]);
      }
      s.next=now+s.period/1000;
    }
    // Same deadline ordering as native go_advance: columns first, then streams;
    // finished streams are removed by moving the last stream into their slot.
    state.advance=target=>{
      for(;;){
        let next=target+1,spawnIndex=-1,streamIndex=state.streams.length;
        state.spawn.forEach((deadline,x)=>{if(deadline>=0&&deadline<next){next=deadline;spawnIndex=x;streamIndex=state.streams.length;}});
        state.streams.forEach((stream,index)=>{if(stream.next<next){next=stream.next;streamIndex=index;spawnIndex=-1;}});
        if(next>target)return;
        if(spawnIndex>=0)spawn(spawnIndex,next);
        else if(streamIndex<state.streams.length){
          const stream=state.streams[streamIndex];step(stream,next);
          if(stream.finished){const last=state.streams.pop();if(streamIndex<state.streams.length)state.streams[streamIndex]=last;}
        }
      }
    };
    return state;
  }

  let width=0,height=0,ratio=1,cellWidth=0,cellHeight=0,baseline=0,grid=null,background='',visible=false,running=false,frame=0,last=0,time=0;
  function draw(){
    context.fillStyle=background;context.fillRect(0,0,width,height);
    if(!grid)return;
    const offsetX=(width-grid.cols*cellWidth)/2,offsetY=(height-grid.rows*cellHeight)/2;
    grid.cells.forEach((cell,index)=>{
      if(!cell)return;
      const x=offsetX+(index%grid.cols)*cellWidth,y=offsetY+Math.floor(index/grid.cols)*cellHeight;
      context.fillStyle=palette[cell.pair];
      // Native rain_put gives half-width voicing marks their own one-cell
      // carrier, so they cannot combine with the neighbouring column.
      if(cell.glyph==='ﾞ'||cell.glyph==='ﾟ'){
        context.save();context.beginPath();context.rect(x,y,cellWidth,cellHeight);context.clip();
        context.fillText(cell.glyph==='ﾞ'?' \u3099':' \u309a',x,y+baseline);context.restore();
      }else context.fillText(cell.glyph,x,y+baseline);
    });
  }
  function recolor(){
    background=`rgb(${getComputedStyle(root).getPropertyValue('--rain-bg').trim()})`;
    draw();
  }
  function resize(force=false){
    const bounds=canvas.getBoundingClientRect(),nextRatio=Math.min(devicePixelRatio||1,1.5);
    if(!force&&width===bounds.width&&height===bounds.height&&ratio===nextRatio)return;
    width=bounds.width;height=bounds.height;ratio=nextRatio;
    canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
    context.setTransform(ratio,0,0,ratio,0,0);
    context.font=`${size}px "Glow Mono", monospace`;
    context.textBaseline='alphabetic';
    const metrics=context.measureText('M'),ascent=metrics.fontBoundingBoxAscent||size,descent=metrics.fontBoundingBoxDescent||size*.4;
    cellWidth=metrics.width;cellHeight=Math.ceil(ascent+descent);baseline=(cellHeight-ascent-descent)/2+ascent;
    grid=createRain(Math.max(1,Math.floor(height/cellHeight)),Math.max(1,Math.floor(width/cellWidth)));
    // Native --intro uses precisely this established-frame warm-up. Present a
    // still immediately, then run the Dashboard profile at its normal 1x rate.
    time=9+grid.rows*.139;grid.advance(time);last=0;recolor();
  }
  function stop(){running=false;cancelAnimationFrame(frame);frame=0;last=0;}
  function tick(timestamp){
    if(!running)return;
    if(!last)last=timestamp;
    if(timestamp-last>=50){time+=(timestamp-last)/1000;last=timestamp;grid.advance(time);draw();}
    frame=requestAnimationFrame(tick);
  }
  function sync(){
    const shouldRun=visible&&!document.hidden&&!reduced();
    if(!shouldRun){stop();return;}
    if(!running){running=true;frame=requestAnimationFrame(tick);}
  }
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);sync();},{threshold:.05}).observe(canvas);
  else visible=true;
  if('ResizeObserver' in window)new ResizeObserver(()=>{resize();sync();}).observe(canvas);
  addEventListener('resize',()=>{resize();sync();});
  document.addEventListener('visibilitychange',sync);
  document.addEventListener('glow:motionchange',sync);
  preference.addEventListener('change',sync);
  new MutationObserver(changes=>{if(changes.some(change=>change.attributeName==='data-theme'))recolor();sync();}).observe(root,{attributes:true,attributeFilter:['data-theme','data-motion']});
  resize();sync();
  document.fonts?.ready.then(()=>{resize(true);sync();});
})();
