/* Shared glass material; colour-field and animation settings have their own store. */
import { FIELD_PRESET } from './field-preset.js?v=shadow-final6';

const STORAGE_KEY = 'glow-field-glass-v1';
const DEFAULT_TRANSPARENCY = FIELD_PRESET.glassTransparency;
const DEFAULT_GRAIN = FIELD_PRESET.glassGrain;
const DEFAULT_GRAIN_SIZE = FIELD_PRESET.glassGrainSize;
const DEFAULT_GRAIN_BRIGHTNESS = FIELD_PRESET.glassGrainBrightness ?? 0.5;
const root = document.documentElement;
const slider = document.querySelector('#field-glass-transparency');
const output = document.querySelector('#field-glass-transparency-value');
const grainSlider = document.querySelector('#field-glass-grain');
const grainOutput = document.querySelector('#field-glass-grain-value');
const grainSizeSlider = document.querySelector('#field-glass-grain-size');
const grainSizeOutput = document.querySelector('#field-glass-grain-size-value');
const grainBrightnessSlider = document.querySelector('#field-glass-grain-brightness');
const grainBrightnessOutput = document.querySelector('#field-glass-grain-brightness-value');
const themeButton = document.querySelector('#field-glass-theme');
let transparency = DEFAULT_TRANSPARENCY;
let grain = DEFAULT_GRAIN;
let grainSize = DEFAULT_GRAIN_SIZE;
let grainBrightness = DEFAULT_GRAIN_BRIGHTNESS;
const sharedPreview = ['http://127.0.0.1:8767', 'http://localhost:8767'].includes(window.location.origin);
const sharedApi = 'http://127.0.0.1:8768';
let editSequence = 0;
let savedSequence = 0;
let sharedVersion = -1;
let sharedSaveTimer;
let sharedSending = false;
let sharedEvents;
let pendingRemote;

function parseSettings(raw) {
  const settings = { transparency: DEFAULT_TRANSPARENCY, grain: DEFAULT_GRAIN, grainSize: DEFAULT_GRAIN_SIZE, grainBrightness: DEFAULT_GRAIN_BRIGHTNESS };
  try {
    const saved = JSON.parse(raw || 'null');
    if (Number.isFinite(saved?.transparency) && saved.transparency >= 0 && saved.transparency <= 1) {
      settings.transparency = saved.transparency;
    }
    if (Number.isFinite(saved?.grain) && saved.grain >= 0 && saved.grain <= 0.35) settings.grain = saved.grain;
    if (Number.isFinite(saved?.grainSize) && saved.grainSize >= 0.5 && saved.grainSize <= 2) settings.grainSize = saved.grainSize;
    if (Number.isFinite(saved?.grainBrightness) && saved.grainBrightness >= 0 && saved.grainBrightness <= 1) settings.grainBrightness = saved.grainBrightness;
  } catch {
    // An older or invalid value must not prevent the controls from working.
  }
  return settings;
}

function applyTransparency(value) {
  transparency = value;
  const percent = Number((value * 100).toFixed(1));
  root.style.setProperty('--brand-glass-opacity', String(Number((1 - value).toFixed(4))));
  root.dataset.glassTransparency = String(percent);
  if (slider) {
    slider.value = String(percent);
    slider.setAttribute('aria-valuetext', `${percent}% 透明度`);
  }
  if (output) output.value = `${percent}%`;
}

function applySettings(settings) {
  applyTransparency(settings.transparency);
  grain = settings.grain;
  grainSize = settings.grainSize;
  // Older service packets omit brightness; retain the user's current value.
  grainBrightness = settings.grainBrightness ?? grainBrightness;
  const grainPercent = Number((grain * 100).toFixed(1));
  const brightnessPercent = Number((grainBrightness * 100).toFixed(1));
  root.style.setProperty('--glass-grain-opacity', String(grain));
  root.style.setProperty('--glass-grain-size', `${Number((180 * grainSize).toFixed(2))}px`);
  root.style.setProperty('--glass-grain-brightness', String(grainBrightness));
  if (grainSlider) {
    grainSlider.value = String(grain);
    grainSlider.setAttribute('aria-valuetext', `${grainPercent}% 玻璃颗粒强度`);
  }
  if (grainOutput) grainOutput.value = `${grainPercent}%`;
  if (grainSizeSlider) {
    grainSizeSlider.value = String(grainSize);
    grainSizeSlider.setAttribute('aria-valuetext', `${grainSize.toFixed(2)} 倍玻璃颗粒大小`);
  }
  if (grainSizeOutput) grainSizeOutput.value = `${grainSize.toFixed(2)}×`;
  if (grainBrightnessSlider) {
    grainBrightnessSlider.value = String(grainBrightness);
    grainBrightnessSlider.setAttribute('aria-valuetext', `${brightnessPercent}% 玻璃颗粒亮度`);
  }
  if (grainBrightnessOutput) grainBrightnessOutput.value = `${brightnessPercent}%`;
}

function restoreSettings() {
  try {
    applySettings(parseSettings(window.localStorage.getItem(STORAGE_KEY)));
  } catch {
    // Keep the current edit usable when storage is unavailable.
    applySettings({ transparency, grain, grainSize, grainBrightness });
  }
}

function saveSettings() {
  try {
    // Saving immediately also covers a refresh before the next animation frame.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ transparency, grain, grainSize, grainBrightness }));
  } catch {
    const status = document.querySelector('#palette-status');
    if (status) status.textContent = '玻璃设置已更新；此浏览器暂时无法保存设置';
  }
}

function validSharedPacket(packet) {
  const settings = packet?.settings;
  return Number.isSafeInteger(packet?.version) && packet.version >= 0 && settings &&
    Number.isFinite(settings.transparency) && settings.transparency >= 0 && settings.transparency <= 1 &&
    Number.isFinite(settings.grain) && settings.grain >= 0 && settings.grain <= 0.35 &&
    Number.isFinite(settings.grainSize) && settings.grainSize >= 0.5 && settings.grainSize <= 2 &&
    (settings.grainBrightness === undefined ||
      (Number.isFinite(settings.grainBrightness) && settings.grainBrightness >= 0 && settings.grainBrightness <= 1));
}

function receiveShared(packet) {
  if (!validSharedPacket(packet) || packet.version <= sharedVersion) return;
  if (editSequence > savedSequence) {
    if (!pendingRemote || packet.version > pendingRemote.version) pendingRemote = packet;
    return;
  }
  sharedVersion = packet.version;
  applySettings(packet.settings);
  saveSettings(); // Remote updates persist locally but never POST back.
  root.dataset.glassSync = 'connected';
}

async function sharedRequest(path, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${sharedApi}${path}`, { ...options, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Glass sync unavailable');
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

async function readSharedSettings() {
  const sequence = editSequence;
  try {
    const packet = await sharedRequest('/settings');
    // A delayed initial read must never replace a newer local edit.
    if (sequence === editSequence) receiveShared(packet);
  } catch {
    root.dataset.glassSync = 'local';
  }
}

async function postSharedSettings() {
  if (sharedSending || editSequence === savedSequence) return;
  const sequence = editSequence;
  const settings = { transparency, grain, grainSize, grainBrightness };
  sharedSending = true;
  let succeeded = false;
  try {
    const packet = await sharedRequest('/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings), keepalive: true,
    });
    if (!validSharedPacket(packet)) throw new Error('Invalid glass sync response');
    savedSequence = sequence;
    succeeded = true;
    receiveShared(packet);
    if (pendingRemote && editSequence === savedSequence) {
      const pending = pendingRemote;
      pendingRemote = undefined;
      receiveShared(pending);
    }
  } catch {
    root.dataset.glassSync = 'local';
  } finally {
    sharedSending = false;
    if (succeeded && editSequence > savedSequence) scheduleSharedSave();
  }
}

function scheduleSharedSave() {
  window.clearTimeout(sharedSaveTimer);
  sharedSaveTimer = window.setTimeout(postSharedSettings, 100);
}

function userEditedSettings() {
  saveSettings();
  if (!sharedPreview) return;
  editSequence += 1;
  scheduleSharedSave();
}

function connectSharedPreview() {
  if (!sharedPreview) return;
  readSharedSettings();
  if (sharedEvents || !window.EventSource) return;
  sharedEvents = new EventSource(`${sharedApi}/events`);
  sharedEvents.addEventListener('settings', event => {
    try { receiveShared(JSON.parse(event.data)); } catch { /* Keep local settings. */ }
  });
  sharedEvents.onopen = () => {
    root.dataset.glassSync = 'connected';
    if (editSequence > savedSequence) scheduleSharedSave();
  };
  sharedEvents.onerror = () => { root.dataset.glassSync = 'local'; };
}

restoreSettings();
connectSharedPreview();

slider?.addEventListener('input', () => {
  const percent = Number(slider.value);
  if (!Number.isFinite(percent)) return;
  applySettings({ transparency: Math.max(0, Math.min(100, percent)) / 100, grain, grainSize, grainBrightness });
  userEditedSettings();
});

grainSlider?.addEventListener('input', () => {
  const value = Number(grainSlider.value);
  if (!Number.isFinite(value)) return;
  applySettings({ transparency, grain: Math.max(0, Math.min(0.35, value)), grainSize, grainBrightness });
  userEditedSettings();
});

grainSizeSlider?.addEventListener('input', () => {
  const value = Number(grainSizeSlider.value);
  if (!Number.isFinite(value)) return;
  applySettings({ transparency, grain, grainSize: Math.max(0.5, Math.min(2, value)), grainBrightness });
  userEditedSettings();
});

grainBrightnessSlider?.addEventListener('input', () => {
  const value = Number(grainBrightnessSlider.value);
  if (!Number.isFinite(value)) return;
  applySettings({ transparency, grain, grainSize, grainBrightness: Math.max(0, Math.min(1, value)) });
  userEditedSettings();
});

if (themeButton) {
  // The preview's theme is local to this page; transparency is shared site-wide.
  themeButton.addEventListener('click', () => {
    const light = root.dataset.theme !== 'light';
    root.dataset.theme = light ? 'light' : 'dark';
    themeButton.setAttribute('aria-pressed', String(light));
    themeButton.textContent = light ? '切换深色玻璃' : '切换浅色玻璃';
  });
}

window.addEventListener('storage', event => {
  if ((event.key === STORAGE_KEY || event.key === null) && editSequence === savedSequence) restoreSettings();
});
window.addEventListener('pageshow', () => {
  if (editSequence === savedSequence) restoreSettings();
  connectSharedPreview();
});
window.addEventListener('pagehide', () => {
  if (sharedPreview && editSequence > savedSequence) {
    window.clearTimeout(sharedSaveTimer);
    postSharedSettings();
  }
  sharedEvents?.close();
  sharedEvents = undefined;
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (editSequence === savedSequence) restoreSettings();
    if (sharedPreview) readSharedSettings();
  }
});
