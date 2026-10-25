import { DEFAULT_FORMULA, ORIGINAL_FORMULA, COLOR_FORMULA, validateFormula, clampAlpha } from './shadow-formula.js?v=shadow-final6';

const storageKey='glow-text-shadow-formula-v1';
let applied={source:DEFAULT_FORMULA,compiled:validateFormula(DEFAULT_FORMULA),revision:0};
export function getAppliedShadowFormula() { return applied; }
function restore() {
  let source=DEFAULT_FORMULA;
  try { source=localStorage.getItem(storageKey)||DEFAULT_FORMULA; } catch {}
  try {
    if(source!==applied.source) {
      applied={source,compiled:validateFormula(source),revision:applied.revision+1};
      dispatchEvent(new Event('glow:textpaintchange'));
    }
  } catch { /* An invalid saved expression never replaces the current one. */ }
}
restore();
addEventListener('storage',event=>{if(event.key===storageKey||event.key===null){restore();refreshApplied();}});
addEventListener('pageshow',()=>{restore();refreshApplied();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){restore();refreshApplied();}});

const editor=document.querySelector('#shadow-expression');
const message=document.querySelector('#shadow-formula-message');
const current=document.querySelector('#shadow-applied');
const applyButton=document.querySelector('#shadow-apply');
let draft=applied.compiled;
function refreshApplied() {
  if(current) current.textContent=applied.source;
  if(editor) renderDraft();
}
function renderDraft() {
  try {
    draft=validateFormula(editor.value);
    editor.removeAttribute('aria-invalid');applyButton.disabled=false;
    message.textContent=editor.value===applied.source?'当前公式已应用。':'草稿预览；点击“应用到主页”后生效。';
    message.dataset.error='false';
    const math=document.querySelector('#shadow-formula-math');
    if(window.katex) window.katex.render(String.raw`\alpha = \operatorname{clamp}\!\left(${draft.tex},0,1\right)`,math,{throwOnError:false,displayMode:true,trust:false});
    else math.textContent=editor.value;
    drawPreview();
  } catch(error) {
    draft=null;editor.setAttribute('aria-invalid','true');applyButton.disabled=true;
    message.textContent=`${error.message}。主页继续使用上一条有效公式。`;message.dataset.error='true';
    document.querySelector('#shadow-formula-math').textContent='表达式未完成，预览保留上一条有效曲线。';
  }
}
function drawPreview() {
  if(!draft)return;
  const c=Number(document.querySelector('#shadow-probe-c').value);
  const d=Number(document.querySelector('#shadow-probe-d').value);
  document.querySelector('#shadow-probe-c-number').value=String(c);
  document.querySelector('#shadow-probe-d-number').value=String(d);
  const percent=(x,y)=>Math.round(clampAlpha(draft.evaluate(x,y))*100);
  document.querySelector('#shadow-probe-result').textContent=`此位置：明暗对比度 ${c.toFixed(2)}，色度差 ${d.toFixed(3)} → 阴影 ${percent(c,d)}%`;
  // Two slices of the exact same expression used to paint the page.
  const width=480,height=190,left=42,right=12,top=20,bottom=32;
  for(const axis of ['c','d']) {
    const chart=document.querySelector(`#shadow-curve-${axis}`);
    const min=axis==='c'?1:0,max=axis==='c'?21:.7;
    const px=x=>left+(x-min)/(max-min)*(width-left-right);
    const py=y=>height-bottom-y*(height-top-bottom);
    let path='';
    for(let i=0;i<=160;i++) {
      const x=min+(max-min)*i/160,y=clampAlpha(draft.evaluate(axis==='c'?x:c,axis==='d'?x:d));
      path+=`${i?'L':'M'}${px(x).toFixed(2)},${py(y).toFixed(2)} `;
    }
    chart.querySelector('.formula-curve').setAttribute('d',path);
    const point=chart.querySelector('.formula-point');
    point.setAttribute('cx',px(axis==='c'?c:d));point.setAttribute('cy',py(clampAlpha(draft.evaluate(c,d))));
    chart.querySelector('title').textContent=axis==='c'?`固定色度差 ${d.toFixed(3)}，明暗对比度从1到21时的阴影浓度`:`固定明暗对比度 ${c.toFixed(2)}，色度差从0到0.7时的阴影浓度`;
  }
  const values=[['几乎同色',1,0],['同明暗、色差明显',1,.15],['明暗差明显、无色差',4.5,0]];
  document.querySelector('#shadow-examples').replaceChildren(...values.map(([label,x,y])=>{
    const row=document.createElement('tr');
    for(const value of [label,`${x.toFixed(1)} / ${y.toFixed(2)}`,`${percent(x,y)}%`]){const td=document.createElement('td');td.textContent=value;row.append(td);}return row;
  }));
  const lo=percent(1,0),hue=percent(1,.15),bright=percent(4.5,0);
  document.querySelector('#shadow-impact').textContent=`这条公式在几乎同色时给 ${lo}% 阴影；只增加色度差至 0.15 时变为 ${hue}%；只增加明暗对比度至 4.5 时变为 ${bright}%。${lo===hue?'当前公式在这两个色度采样点没有区别。':''} 曲线越高，阴影越浓；横向平坦表示在该范围内不随该变量改变。`;
}
if(editor) {
  if(window.katex) window.katex.render(validateFormula(COLOR_FORMULA).tex,
    document.querySelector('#shadow-colour-formula-math'),{throwOnError:false,displayMode:true,trust:false});
  editor.value=applied.source;
  editor.addEventListener('input',renderDraft);
  applyButton.addEventListener('click',()=>{
    try {
      const source=editor.value.trim(),compiled=validateFormula(source);
      applied={source,compiled,revision:applied.revision+1};
      let saved=true;try{localStorage.setItem(storageKey,source);}catch{saved=false;}
      dispatchEvent(new Event('glow:textpaintchange'));refreshApplied();
      if(!saved)message.textContent='已应用到此页，但浏览器未能保存或同步公式。';
    } catch { renderDraft(); }
  });
  for(const [id,source] of [['shadow-use-original',ORIGINAL_FORMULA],['shadow-use-colour',COLOR_FORMULA]])
    document.getElementById(id).addEventListener('click',()=>{editor.value=source;renderDraft();});
  for(const axis of ['c','d']) {
    const slider=document.getElementById(`shadow-probe-${axis}`),number=document.getElementById(`shadow-probe-${axis}-number`);
    slider.addEventListener('input',drawPreview);
    number.addEventListener('input',()=>{if(number.value!==''&&Number.isFinite(number.valueAsNumber)){slider.value=String(Math.max(Number(slider.min),Math.min(Number(slider.max),number.valueAsNumber)));drawPreview();}});
    number.addEventListener('blur',drawPreview);
  }
  refreshApplied();
}
