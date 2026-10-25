/* Shared phase text for visible stories and their offscreen layout probes. */
(() => {
  'use strict';

  const localized = (value, language) => typeof value === 'string' ? value : value?.[language] || '';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const symbols = { Space: '␣', Ctrl: '⌃', Cmd: '⌘', Alt: '⌥', Option: '⌥', Shift: '⇧', Enter: '↩', Return: '↩', Tab: '⇥', Esc: '⎋', Backspace: '⌫', Delete: '⌦' };
  const defaultKeys = (keys, language) => keys.map(key => `<kbd>${escape(symbols[key] || (key === 'Click' ? language === 'en' ? 'Click' : '单击' : key))}</kbd>`).join('');

  function renderPhase(story, phases, phase, language, options = {}) {
    const title = story.querySelector('h3');
    if (title) {
      const text = localized(phase.title, language);
      title.innerHTML = language === 'en' ? escape(text) : `<span>${escape(text).replace(/，/g, '，</span><span>')}</span>`;
    }
    const description = story.querySelector('.wf-description');
    if (description) description.textContent = localized(phase.description, language);
    if (options.groupLabel !== undefined) story.querySelector('.wf-phases')?.setAttribute('aria-label', options.groupLabel);
    story.querySelectorAll('[data-phase]').forEach((button, index) => {
      const label = button.querySelector('.wf-phase-label');
      const text = localized(phases[index]?.label, language);
      // Live buttons also own a continuous-corner paint surface. Preserve it,
      // and retain the live renderer's no-op when the label already matches.
      if (label && (!options.onlyChangedLabels || label.textContent !== text)) label.textContent = text;
      const selected = options.phaseIndex === undefined ? phases[index] === phase : index === options.phaseIndex;
      button.setAttribute('aria-pressed', String(selected));
    });
    const action = story.querySelector('.wf-action');
    if (action) {
      const keys = phase.keys || [];
      action.hidden = keys.length === 0;
      const label = action.querySelector('.wf-state-label');
      if (label) label.textContent = localized(phase.label, language);
      const keyGroup = action.querySelector('.wf-keys');
      if (keyGroup) keyGroup.innerHTML = options.keysHTML ? options.keysHTML(keys, language) : defaultKeys(keys, language);
    }
    const manual = story.querySelector('.wf-manual-link');
    if (manual) manual.textContent = language === 'en' ? 'Explore these actions ↗' : '查看相关操作 ↗';
  }

  window.GlowStoryCopy = { renderPhase };
})();
