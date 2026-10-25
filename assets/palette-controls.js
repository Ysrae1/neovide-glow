import { FIELD_PRESET } from './field-preset.js?v=shadow-final6';

const ORIGINAL_COLOURS = FIELD_PRESET.colours;
const STORAGE_KEY = 'glow-field-palette-hero-v1';
const DEFAULT_STATUS = '调整自动保存在此浏览器';
const container = document.querySelector('#palette-colours');
const status = document.querySelector('#palette-status');
const pairLabel = document.querySelector('#active-pair');
const items = [];
let colours = [...ORIGINAL_COLOURS];
let enabled = [...FIELD_PRESET.enabled];
let currentPair = [];
let pendingFrame = null;
let pendingIndex;
let statusTimer;
let paused = FIELD_PRESET.paused;
let blur = FIELD_PRESET.blur;
let speed = FIELD_PRESET.speed;
let collapsed = FIELD_PRESET.collapsed;
let grain = FIELD_PRESET.grain;
let grainSize = FIELD_PRESET.grainSize;
let pendingSaveFrame = null;
let colourDrag = null;

function setStatus(message, temporary = false) {
  window.clearTimeout(statusTimer);
  if (status) status.textContent = message;
  if (temporary) {
    statusTimer = window.setTimeout(() => {
      if (status) status.textContent = DEFAULT_STATUS;
    }, 2500);
  }
}

function normaliseHex(value, allowShort = false) {
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  if (allowShort && /^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${[...hex.slice(1)].map(character => character.repeat(2)).join('')}`.toLowerCase();
  }
  return null;
}

function saveSettings() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ colours, enabled, blur, speed, grain, grainSize, paused, collapsed }));
    return true;
  } catch {
    setStatus('设置已更新；此浏览器暂时无法保存设置');
    return false;
  }
}

function queueSettingsSave() {
  if (pendingSaveFrame !== null) return;
  pendingSaveFrame = window.requestAnimationFrame(() => {
    pendingSaveFrame = null;
    saveSettings();
  });
}

// Flush a pending user edit when refreshing before its animation frame runs.
window.addEventListener('pagehide', () => {
  if (pendingSaveFrame !== null || pendingFrame !== null) saveSettings();
});

function updateActivePair(pair) {
  if (!Array.isArray(pair) || pair.length > colours.length || !pair.every(index =>
    Number.isInteger(index) && index >= 0 && index < colours.length)) return;
  currentPair = pair.filter(index => enabled[index]);
  items.forEach((item, index) => item.element.classList.toggle('is-active', currentPair.includes(index)));
  if (pairLabel) {
    pairLabel.textContent = currentPair.length
      ? `当前主色 ${currentPair.map(index => String(index + 1).padStart(2, '0')).join(' + ')}`
      : '正在更新主色';
  }
}

// Subscribe before constructing controls so renderer updates cannot race setup.
window.addEventListener('glow:field-state', event => updateActivePair(event.detail?.pair));

function dispatchPalette(detail = {}) {
  window.dispatchEvent(new CustomEvent('glow:palette-change', {
    detail: { colours: [...colours], enabled: [...enabled], ...detail },
  }));
}

function queuePaletteChange(index) {
  pendingIndex = index;
  if (pendingFrame !== null) return;
  pendingFrame = window.requestAnimationFrame(() => {
    pendingFrame = null;
    saveSettings();
    dispatchPalette({ index: pendingIndex });
    pendingIndex = undefined;
  });
}

function syncItem(index) {
  const item = items[index];
  item.picker.value = colours[index];
  item.hex.value = colours[index].toUpperCase();
  item.hex.removeAttribute('aria-invalid');
  item.swatch.style.setProperty('--swatch', colours[index]);
  item.checkbox.checked = enabled[index];
  item.element.classList.toggle('is-disabled', !enabled[index]);
}

function applyColour(index, value) {
  const changed = colours[index] !== value;
  colours[index] = value;
  syncItem(index);
  if (changed) queuePaletteChange(index);
}

try {
  const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
  if (Array.isArray(saved) && saved.length > 0 &&
      saved.every(value => typeof value === 'string' && normaliseHex(value))) {
    colours = saved.map(value => normaliseHex(value));
    if (saved.length === 4) colours.push('#efd4ef', '#dac2ef', '#969af7', '#93c5f0', '#d7e3ff', '#90b4f0');
    enabled = colours.map(() => true);
    saveSettings();
  } else if (saved && Array.isArray(saved.colours) && saved.colours.length > 0 &&
      saved.colours.every(value => typeof value === 'string' && normaliseHex(value)) &&
      Array.isArray(saved.enabled) && saved.enabled.length === saved.colours.length &&
      saved.enabled.every(value => typeof value === 'boolean')) {
    colours = saved.colours.map(value => normaliseHex(value));
    enabled = [...saved.enabled];
    if (!enabled.some(Boolean)) enabled[0] = true;
    if (Number.isFinite(saved.blur) && saved.blur >= 2 && saved.blur <= 12) blur = saved.blur;
    if (Number.isFinite(saved.speed) && saved.speed >= 0.25 && saved.speed <= 6) speed = saved.speed;
    if (Number.isFinite(saved.grain) && saved.grain >= 0 && saved.grain <= 0.5) grain = saved.grain;
    if (Number.isFinite(saved.grainSize) && saved.grainSize >= 0.5 && saved.grainSize <= 2) grainSize = saved.grainSize;
    if (typeof saved.paused === 'boolean') paused = saved.paused;
    if (typeof saved.collapsed === 'boolean') collapsed = saved.collapsed;
  }
} catch {
  // An unavailable store or an older invalid value must not prevent editing.
}

function createColourRow(index) {
    if (!container) return null;
    const colour = colours[index];
    const number = index + 1;
    const element = document.createElement('div');
    element.className = 'colour-item';
    element.dataset.index = String(index);
    const getIndex = () => Number(element.dataset.index);

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'colour-drag-handle';
    handle.title = '拖动排序；方向键移动';
    handle.setAttribute('aria-label', `颜色 ${number} 排序，使用方向键移动`);
    handle.innerHTML = '<svg viewBox="0 0 12 18" aria-hidden="true" focusable="false"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/></svg>';

    const swatch = document.createElement('label');
    swatch.className = 'colour-swatch capability-icon';
    swatch.style.setProperty('--swatch', colour);
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = colour;
    picker.setAttribute('aria-label', `颜色 ${number} 取色器`);
    swatch.append(picker);

    const values = document.createElement('div');
    values.className = 'colour-values';
    const label = document.createElement('label');
    label.htmlFor = `colour-hex-${number}`;
    label.textContent = `颜色 ${String(number).padStart(2, '0')}`;
    const hex = document.createElement('input');
    hex.className = 'colour-hex';
    hex.type = 'text';
    hex.id = `colour-hex-${number}`;
    hex.value = colour.toUpperCase();
    hex.maxLength = 7;
    hex.autocomplete = 'off';
    hex.spellcheck = false;
    hex.setAttribute('autocapitalize', 'characters');
    hex.setAttribute('aria-label', `颜色 ${number} HEX`);
    const active = document.createElement('span');
    active.className = 'colour-active';
    active.setAttribute('aria-hidden', 'true');
    active.textContent = '主色';
    const participation = document.createElement('label');
    participation.className = 'colour-participation';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'colour-enabled';
    checkbox.checked = enabled[index];
    checkbox.setAttribute('aria-label', `颜色 ${number} 参与色场`);
    const participationText = document.createElement('span');
    participationText.textContent = '参与色场';
    participation.append(checkbox, participationText);
    values.append(label, hex, active, participation);
    element.append(handle, swatch, values);
    const item = { element, swatch, picker, hex, checkbox, label, handle };
    items.push(item);
    container.append(element);
    element.classList.toggle('is-disabled', !enabled[index]);

    checkbox.addEventListener('change', () => {
      const index = getIndex();
      if (!checkbox.checked && enabled.filter(Boolean).length === 1) {
        checkbox.checked = true;
        setStatus('请至少保留一种颜色参与色场', true);
        return;
      }
      enabled[index] = checkbox.checked;
      element.classList.toggle('is-disabled', !enabled[index]);
      updateActivePair(currentPair);
      queuePaletteChange(index);
    });

    picker.addEventListener('input', () => applyColour(getIndex(), picker.value.toLowerCase()));
    picker.addEventListener('change', () => applyColour(getIndex(), picker.value.toLowerCase()));
    hex.addEventListener('input', () => {
      hex.removeAttribute('aria-invalid');
      const value = normaliseHex(hex.value);
      if (value) applyColour(getIndex(), value);
    });
    hex.addEventListener('blur', () => {
      const index = getIndex();
      const value = normaliseHex(hex.value, true);
      if (value) {
        applyColour(index, value);
      } else {
        syncItem(index);
        setStatus(`颜色 ${String(index + 1).padStart(2, '0')} 格式无效，已恢复上次色值；请使用 #RGB 或 #RRGGBB`, true);
      }
    });
    hex.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        hex.blur();
      } else if (event.key === 'Escape') {
        syncItem(getIndex());
        hex.blur();
      }
    });
    handle.addEventListener('pointerdown', event => startColourDrag(event, item));
    handle.addEventListener('pointermove', moveColourDrag);
    handle.addEventListener('pointerup', event => endColourDrag(event, false));
    handle.addEventListener('pointercancel', event => endColourDrag(event, true));
    handle.addEventListener('lostpointercapture', event => endColourDrag(event, true));
    handle.addEventListener('click', event => event.preventDefault());
    handle.addEventListener('keydown', event => {
      if (colourDrag) return;
      const columns = window.getComputedStyle(container).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
      const index = getIndex();
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : Object.hasOwn(offsets, event.key) ? index + offsets[event.key] : null;
      if (target === null) return;
      event.preventDefault();
      moveColourItem(item, Math.max(0, Math.min(items.length - 1, target)));
      item.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return item;
}

function updateColourIdentities() {
  items.forEach((item, index) => {
    const number = index + 1;
    item.element.dataset.index = String(index);
    item.label.textContent = `颜色 ${String(number).padStart(2, '0')}`;
    item.label.htmlFor = `colour-hex-${number}`;
    item.hex.id = `colour-hex-${number}`;
    item.hex.setAttribute('aria-label', `颜色 ${number} HEX`);
    item.picker.setAttribute('aria-label', `颜色 ${number} 取色器`);
    item.checkbox.setAttribute('aria-label', `颜色 ${number} 参与色场`);
    item.handle.setAttribute('aria-label', `颜色 ${number} 排序，使用方向键移动`);
  });
}

function moveColourItem(item, destination) {
  const source = items.indexOf(item);
  if (source < 0 || source === destination) return;
  const oldItems = [...items];
  const order = [...items];
  order.splice(source, 1);
  order.splice(destination, 0, item);
  const nextColours = order.map(entry => colours[oldItems.indexOf(entry)]);
  const nextEnabled = order.map(entry => enabled[oldItems.indexOf(entry)]);
  const nextPair = currentPair.map(index => order.indexOf(oldItems[index])).filter(index => index >= 0);
  const focus = document.activeElement;
  container.insertBefore(item.element, order[destination + 1]?.element || null);
  items.splice(0, items.length, ...order);
  colours = nextColours;
  enabled = nextEnabled;
  updateColourIdentities();
  updateActivePair(nextPair);
  if (focus && item.element.contains(focus)) focus.focus({ preventScroll: true });
  // A reorder changes the sequence without selecting a new primary colour.
  if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
  pendingFrame = null;
  pendingIndex = undefined;
  const saved = saveSettings();
  dispatchPalette();
  if (saved) setStatus(`已移至第 ${destination + 1} 位，颜色顺序已保存`, true);
}

function clearDropMarker() {
  items.forEach(item => item.element.removeAttribute('data-drop-position'));
}

function locateColourDrop(drag) {
  clearDropMarker();
  drag.target = null;
  const bounds = container.getBoundingClientRect();
  if (drag.x < bounds.left || drag.x > bounds.right || drag.y < bounds.top - 32 || drag.y > bounds.bottom + 32) return;
  let nearest = null;
  let distance = Infinity;
  for (const item of items) {
    const rect = item.element.getBoundingClientRect();
    const dx = (drag.x - (rect.left + rect.width / 2)) / Math.max(rect.width, 1);
    const dy = (drag.y - (rect.top + rect.height / 2)) / Math.max(rect.height, 1);
    const candidate = dx * dx + dy * dy;
    if (candidate < distance) { nearest = { item, rect }; distance = candidate; }
  }
  if (!nearest || nearest.item === drag.item) return;
  drag.target = nearest.item;
  drag.after = drag.x > nearest.rect.left + nearest.rect.width / 2;
  nearest.item.element.dataset.dropPosition = drag.after ? 'after' : 'before';
}

function tickColourDrag(time) {
  const drag = colourDrag;
  if (!drag || !drag.started) return;
  const elapsed = Math.min(32, time - (drag.lastTime ?? time));
  drag.lastTime = time;
  const bounds = container.getBoundingClientRect();
  if (drag.x >= bounds.left && drag.x <= bounds.right) {
    const edge = Math.min(40, bounds.height / 4);
    const velocity = drag.y < bounds.top + edge ? -Math.min(1, (bounds.top + edge - drag.y) / edge)
      : drag.y > bounds.bottom - edge ? Math.min(1, (drag.y - bounds.bottom + edge) / edge) : 0;
    container.scrollTop += velocity * elapsed * 0.55;
  }
  locateColourDrop(drag);
  drag.frame = window.requestAnimationFrame(tickColourDrag);
}

function startColourDrag(event, item) {
  if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
  if (colourDrag) endColourDrag(null, true);
  event.preventDefault();
  item.handle.focus({ preventScroll: true });
  colourDrag = { item, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
    x: event.clientX, y: event.clientY, started: false, target: null, frame: null };
  item.handle.setPointerCapture(event.pointerId);
}

function moveColourDrag(event) {
  const drag = colourDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (!drag.started && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 5) {
    drag.started = true;
    drag.item.element.classList.add('is-dragging');
    container.classList.add('is-reordering');
    drag.frame = window.requestAnimationFrame(tickColourDrag);
  }
  if (drag.started) {
    event.preventDefault();
    locateColourDrop(drag);
  }
}

function endColourDrag(event, cancel) {
  const drag = colourDrag;
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
  colourDrag = null;
  if (drag.frame !== null) window.cancelAnimationFrame(drag.frame);
  drag.item.element.classList.remove('is-dragging');
  container.classList.remove('is-reordering');
  clearDropMarker();
  if (drag.item.handle.hasPointerCapture(drag.pointerId)) drag.item.handle.releasePointerCapture(drag.pointerId);
  if (!cancel && drag.started && drag.target) {
    const remaining = items.filter(item => item !== drag.item);
    const destination = remaining.indexOf(drag.target) + (drag.after ? 1 : 0);
    moveColourItem(drag.item, destination);
  } else if (cancel && drag.started) {
    setStatus('已取消排序，原顺序保持不变', true);
  }
}

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && colourDrag) {
    event.preventDefault();
    endColourDrag(null, true);
  }
});
window.addEventListener('blur', () => endColourDrag(null, true));
window.addEventListener('pagehide', () => endColourDrag(null, true));

function updateColourCount() {
  const countLabel = document.querySelector('#palette-count');
  if (countLabel) countLabel.textContent = `${colours.length} 个颜色`;
}

function rebuildColourRows() {
  endColourDrag(null, true);
  items.length = 0;
  container?.replaceChildren();
  colours.forEach((_, index) => createColourRow(index));
  updateColourCount();
  updateActivePair(currentPair.filter(index => index < colours.length));
}

rebuildColourRows();

if (currentPair.length) updateActivePair(currentPair);
setStatus(DEFAULT_STATUS);

const resetButton = document.querySelector('#palette-reset');
if (resetButton) {
  resetButton.type = 'button';
  resetButton.addEventListener('click', () => {
    if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
    pendingIndex = undefined;
    colours = [...ORIGINAL_COLOURS];
    enabled = [...FIELD_PRESET.enabled];
    rebuildColourRows();
    const settingsSaved = saveSettings();
    dispatchPalette({ reset: true });
    setStatus(settingsSaved ? '已恢复保存的配色' : '已恢复保存的配色；此浏览器暂时无法保存设置', settingsSaved);
  });
}

const addButton = document.querySelector('#palette-add');
if (addButton) {
  addButton.type = 'button';
  addButton.addEventListener('click', () => {
    const index = colours.length;
    colours.push('#bca8ff');
    enabled.push(true);
    const item = createColourRow(index);
    updateColourCount();
    if (container) container.scrollTop = container.scrollHeight;
    queuePaletteChange(index);
    setStatus(`已添加颜色 ${String(index + 1).padStart(2, '0')}`, true);
    if (item) {
      try {
        if (typeof item.picker.showPicker === 'function') item.picker.showPicker();
        else item.picker.click();
      } catch {
        item.hex.focus();
      }
    }
  });
}

const pauseButton = document.querySelector('#field-pause');
if (pauseButton) {
  pauseButton.type = 'button';
  pauseButton.textContent = paused ? '继续变幻' : '暂停变幻';
  pauseButton.setAttribute('aria-pressed', String(paused));
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.textContent = paused ? '继续变幻' : '暂停变幻';
    pauseButton.setAttribute('aria-pressed', String(paused));
    window.dispatchEvent(new CustomEvent('glow:field-pause', { detail: { paused } }));
    queueSettingsSave();
  });
}

const copyButton = document.querySelector('#palette-copy');
if (copyButton) {
  copyButton.type = 'button';
  copyButton.addEventListener('click', async () => {
    const participatingColours = colours.filter((_, index) => enabled[index]);
    try {
      await navigator.clipboard.writeText(participatingColours.map(colour => colour.toUpperCase()).join(' '));
      setStatus(`已复制 ${participatingColours.length} 个参与色场的 HEX 色值`, true);
    } catch {
      setStatus('复制失败，请手动选择并复制色值');
    }
  });
}

dispatchPalette();

const blurSlider = document.querySelector('#field-blur');
const blurValue = document.querySelector('#field-blur-value');
if (blurSlider) {
  let pendingBlurFrame = null;
  const dispatchBlur = () => {
    window.dispatchEvent(new CustomEvent('glow:field-blur', {
      detail: { passes: Number(blurSlider.value) },
    }));
  };
  const updateBlur = () => {
    blur = Number(blurSlider.value);
    if (blurValue) blurValue.textContent = blurSlider.value;
    queueSettingsSave();
    if (pendingBlurFrame !== null) return;
    pendingBlurFrame = window.requestAnimationFrame(() => {
      pendingBlurFrame = null;
      dispatchBlur();
    });
  };
  blurSlider.value = String(blur);
  if (blurValue) blurValue.textContent = blurSlider.value;
  blurSlider.addEventListener('input', updateBlur);
  blurSlider.addEventListener('change', updateBlur);
  dispatchBlur();
}

const speedSlider = document.querySelector('#field-speed');
const speedValue = document.querySelector('#field-speed-value');
if (speedSlider) {
  let pendingSpeedFrame = null;
  const displaySpeed = () => {
    if (speedValue) speedValue.textContent = `${Number(speedSlider.value).toFixed(2).replace(/0$/, '')}×`;
  };
  const dispatchSpeed = () => {
    window.dispatchEvent(new CustomEvent('glow:field-speed', {
      detail: { speed: Number(speedSlider.value) },
    }));
  };
  const updateSpeed = () => {
    speed = Number(speedSlider.value);
    displaySpeed();
    queueSettingsSave();
    if (pendingSpeedFrame !== null) return;
    pendingSpeedFrame = window.requestAnimationFrame(() => {
      pendingSpeedFrame = null;
      dispatchSpeed();
    });
  };
  speedSlider.value = String(speed);
  displaySpeed();
  speedSlider.addEventListener('input', updateSpeed);
  speedSlider.addEventListener('change', updateSpeed);
  dispatchSpeed();
}

const grainSlider = document.querySelector('#field-grain');
const grainValue = document.querySelector('#field-grain-value');
const grainSizeSlider = document.querySelector('#field-grain-size');
const grainSizeValue = document.querySelector('#field-grain-size-value');
function applyGrainSettings() {
  document.documentElement.style.setProperty('--field-grain-opacity', String(grain));
  document.documentElement.style.setProperty('--field-grain-size', `${180 * grainSize}px`);
  if (grainValue) grainValue.textContent = `${Math.round(grain * 100)}%`;
  if (grainSizeValue) grainSizeValue.textContent = `${grainSize.toFixed(2).replace(/0$/, '')}×`;
}
if (grainSlider) {
  grainSlider.value = String(grain);
  grainSlider.addEventListener('input', () => {
    grain = Number(grainSlider.value);
    applyGrainSettings();
    queueSettingsSave();
  });
}
if (grainSizeSlider) {
  grainSizeSlider.value = String(grainSize);
  grainSizeSlider.addEventListener('input', () => {
    grainSize = Number(grainSizeSlider.value);
    applyGrainSettings();
    queueSettingsSave();
  });
}
applyGrainSettings();

const panel = document.querySelector('#palette-panel');
const panelContent = document.querySelector('#palette-content');
const panelToggle = document.querySelector('#palette-toggle');
if (panel && panelContent && panelToggle) {
  let expanded = !collapsed;
  let expandedHeight = panel.getBoundingClientRect().height;
  let panelFrame = null;
  let panelTimer;
  panelToggle.type = 'button';
  panelToggle.setAttribute('aria-controls', 'palette-content');

  const syncPanelAccess = () => {
    panelToggle.setAttribute('aria-expanded', String(expanded));
    panelToggle.setAttribute('aria-label', expanded ? '收起调色面板' : '展开调色面板');
    panelContent.inert = !expanded;
    panelContent.setAttribute('aria-hidden', String(!expanded));
  };
  const finishPanelTransition = () => {
    window.clearTimeout(panelTimer);
    if (expanded) {
      panel.style.removeProperty('height');
      expandedHeight = panel.getBoundingClientRect().height;
      panel.style.setProperty('--panel-expanded-height', `${expandedHeight}px`);
    }
  };
  panel.dataset.collapsed = String(!expanded);
  panel.style.setProperty('--panel-expanded-height', `${expandedHeight}px`);
  if (!expanded) panel.style.height = '48px';
  syncPanelAccess();

  panelToggle.addEventListener('click', () => {
    if (panelFrame !== null) window.cancelAnimationFrame(panelFrame);
    window.clearTimeout(panelTimer);
    const currentHeight = panel.getBoundingClientRect().height;
    if (expanded && !panel.style.height) expandedHeight = currentHeight;
    panel.style.setProperty('--panel-expanded-height', `${expandedHeight}px`);
    panel.style.height = `${currentHeight}px`;
    // Establish the current height before asking CSS to animate to the new one.
    void panel.offsetHeight;
    expanded = !expanded;
    collapsed = !expanded;
    queueSettingsSave();
    syncPanelAccess();
    panelFrame = window.requestAnimationFrame(() => {
      panelFrame = null;
      panel.dataset.collapsed = String(!expanded);
      panel.style.height = expanded ? `${expandedHeight}px` : '48px';
      const style = window.getComputedStyle(panel);
      const milliseconds = value => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);
      const duration = Math.max(...style.transitionDuration.split(',').map(milliseconds));
      const delay = Math.max(...style.transitionDelay.split(',').map(milliseconds));
      panelTimer = window.setTimeout(finishPanelTransition, duration + delay + 50);
    });
  });
  panel.addEventListener('transitionend', event => {
    if (event.target === panel && event.propertyName === 'height' && panelFrame === null) {
      finishPanelTransition();
    }
  });
}

window.dispatchEvent(new CustomEvent('glow:field-pause', { detail: { paused } }));
