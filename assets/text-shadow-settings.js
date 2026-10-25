/* Independent text-shadow radius, shared between same-origin preview tabs. */
import { FIELD_PRESET } from './field-preset.js?v=shadow-final6';

const key = 'glow-text-shadow-radius-v1';
const defaultRadius = FIELD_PRESET.textShadowRadius;
const slider = document.querySelector('#field-text-shadow-radius');
const number = document.querySelector('#field-text-shadow-number');
let radius = defaultRadius;

function apply(value) {
  radius = Math.round(Math.max(0, Math.min(4, value)) * 10) / 10;
  document.documentElement.style.setProperty('--glow-text-shadow-radius', `${radius}px`);
  // Zero disables this shadow entirely rather than leaving a zero-blur edge.
  document.documentElement.style.setProperty('--glow-text-shadow-alpha', radius === 0 ? '0' : '.6');
  if (slider) {
    slider.value = String(radius);
    slider.setAttribute('aria-valuetext', `${radius.toFixed(1)} px`);
  }
  if (number) number.value = String(radius);
  dispatchEvent(new Event('glow:textpaintchange'));
}

function restore() {
  try {
    const saved = localStorage.getItem(key);
    const value = saved === null ? defaultRadius : Number(saved);
    apply(Number.isFinite(value) && value >= 0 && value <= 4 ? value : defaultRadius);
  } catch { apply(radius); }
}

function edit(input) {
  if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
  apply(input.valueAsNumber);
  try { localStorage.setItem(key, String(radius)); }
  catch {
    const status = document.querySelector('#palette-status');
    if (status) status.textContent = '阴影已更新；此浏览器暂时无法保存设置';
  }
}

slider?.addEventListener('input', () => edit(slider));
number?.addEventListener('input', () => edit(number));
number?.addEventListener('blur', () => { number.value = String(radius); });
addEventListener('storage', event => { if (event.key === key || event.key === null) restore(); });
addEventListener('pageshow', restore);
document.addEventListener('visibilitychange', () => { if (!document.hidden) restore(); });
restore();
