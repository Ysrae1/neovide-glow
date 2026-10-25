// User-approved fixed-weight/native-shadow baseline, captured on 2026-10-26.
// Keep disabled colours in their chosen positions for later adjustments.
export const FIELD_PRESET = Object.freeze({
  id: 'glow-20261026-native-shadow',
  colours: Object.freeze([
    '#ff6f9c', '#9a72ff', '#ffc6c2', '#5f93ff', '#70ffd4', '#3fc8ff',
    '#dac2ef', '#969af7', '#93c5f0', '#7ae4ff', '#90b4f0', '#d7e3ff',
    '#efd4ef', '#9270ff',
  ]),
  enabled: Object.freeze([
    true, true, false, true, true, true, true,
    true, true, true, true, true, true, true,
  ]),
  speed: 2.5,
  blur: 8,
  grain: 0.45,
  grainSize: 1,
  glassTransparency: 0.09,
  glassGrain: 0.09,
  glassGrainSize: 1,
  glassGrainBrightness: 0.33,
  textShadowRadius: 1.7,
  textShadowFormula: '0.6 * (1 - smoothstep(1.2, 4.5, c))',
  textGlow: Object.freeze({nearRadius:7,nearStrength:85,farRadius:18,farStrength:60}),
  paused: false,
  collapsed: true,
});
