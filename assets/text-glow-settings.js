/* Two existing colour-glow layers; independently saved from the black shadow. */
const storageKey = 'glow-text-glow-v1';
const controls = [
  {name:'nearRadius', id:'text-glow-near-radius', css:'--glow-text-near-radius', value:7, max:30, step:.5, unit:'px'},
  {name:'nearStrength', id:'text-glow-near-strength', css:'--glow-text-near-strength', value:85, max:100, step:1, unit:'%'},
  {name:'farRadius', id:'text-glow-far-radius', css:'--glow-text-far-radius', value:18, max:60, step:.5, unit:'px'},
  {name:'farStrength', id:'text-glow-far-strength', css:'--glow-text-far-strength', value:60, max:100, step:1, unit:'%'},
];
let values = Object.fromEntries(controls.map(control => [control.name, control.value]));

function apply() {
  for (const control of controls) {
    const value = values[control.name];
    document.documentElement.style.setProperty(control.css,
      control.unit === '%' ? String(value / 100) : `${value}px`);
    const slider = document.getElementById(control.id);
    const number = document.getElementById(`${control.id}-number`);
    if (slider) {
      slider.value = String(value);
      slider.setAttribute('aria-valuetext', `${value} ${control.unit}`);
    }
    if (number) number.value = String(value);
  }
  dispatchEvent(new Event('glow:textpaintchange'));
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    values = Object.fromEntries(controls.map(control => {
      const value = saved?.[control.name];
      return [control.name, Number.isFinite(value) && value >= 0 && value <= control.max ? value : control.value];
    }));
  } catch { /* Keep controls usable when storage is unavailable. */ }
  apply();
}

for (const control of controls) {
  for (const id of [control.id, `${control.id}-number`]) {
    const input = document.getElementById(id);
    input?.addEventListener('input', () => {
      if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
      values[control.name] = Math.round(Math.max(0, Math.min(control.max, input.valueAsNumber)) / control.step) * control.step;
      apply();
      try { localStorage.setItem(storageKey, JSON.stringify(values)); }
      catch {
        const status = document.querySelector('#palette-status');
        if (status) status.textContent = '发光已更新；此浏览器暂时无法保存设置';
      }
    });
    if (input?.type === 'number') input.addEventListener('blur', apply);
  }
}
addEventListener('storage', event => { if (event.key === storageKey || event.key === null) restore(); });
addEventListener('pageshow', restore);
document.addEventListener('visibilitychange', () => { if (!document.hidden) restore(); });
restore();
