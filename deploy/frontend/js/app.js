/*
  Going Green Inference - page logic

  The rule behind most of this file: the page does not know how the models
  work. It collects raw inputs, posts them, and shows the answer. The stem rule,
  the calendar columns and the twelve-month level are derived by the backend
  only, so the page and the model cannot drift apart after a retrain.

  The 3D view is a picture of the input, loaded on the side. If it fails to
  load, everything here still works.

  Contract: deploy/README.md. Model contracts: CLAUDE.md sections 5.5 and 6.14.
*/

import { MUSHROOM_COLOURS, dotFor } from './palette.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================================================================ storage */

// localStorage can throw (private windows, blocked storage); every access is
// guarded and the page works with nothing stored.
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
};

const settings = {
  apiBase: store.get('ggi.apiBase', ''),
  demo: store.get('ggi.demoMode', '0') === '1',
};

/* ================================================================ field definitions */

// Valid values and training ranges: CLAUDE.md 5.1. "none" means the feature is
// absent (no ring, no gills, no stem surface) and is information. "Not
// observed" is the absence of an observation and is sent as null.
const MUSHROOM_SECTIONS = [
  {
    title: 'Size', icon: 'ruler',
    fields: [
      { kind: 'slider', name: 'cap_diameter', label: 'Cap diameter', unit: 'cm', min: 0.56, max: 57.4, curve: 3, decimals: 1, nullable: true },
      { kind: 'slider', name: 'stem_height', label: 'Stem height', unit: 'cm', min: 0, max: 32.4, curve: 2.6, decimals: 1, nullable: true },
      { kind: 'slider', name: 'stem_width', label: 'Stem width', unit: 'mm', min: 0, max: 102.5, curve: 3, decimals: 1, nullable: true },
    ],
  },
  {
    title: 'Cap and gills', icon: 'umbrella-simple',
    fields: [
      { kind: 'chips', name: 'cap_shape', label: 'Cap shape',
        values: ['bell', 'conical', 'convex', 'flat', 'spherical', 'sunken', 'others'] },
      { kind: 'swatches', name: 'gill_color', label: 'Gill colour', none: 'no gills',
        values: ['black', 'brown', 'buff', 'gray', 'green', 'orange', 'pink', 'purple', 'red', 'white', 'yellow'] },
    ],
  },
  {
    title: 'Stem', icon: 'plant',
    fields: [
      { kind: 'chips', name: 'stem_surface', label: 'Stem surface',
        values: ['smooth', 'fibrous', 'grooves', 'scaly', 'shiny', 'silky', 'sticky', 'none'] },
      { kind: 'chips', name: 'ring_type', label: 'Ring',
        values: ['none', 'large', 'pendant', 'flaring', 'movable', 'zone', 'evanescent', 'grooved'] },
    ],
  },
  {
    title: 'Spore print', icon: 'drop',
    fields: [
      { kind: 'swatches', name: 'spore_print_color', label: 'Spore print colour',
        values: ['black', 'brown', 'gray', 'green', 'pink', 'purple', 'white'] },
    ],
  },
  {
    title: 'Where and when', icon: 'map-pin',
    fields: [
      { kind: 'chips', name: 'habitat', label: 'Habitat',
        values: ['woods', 'grasses', 'leaves', 'meadows', 'paths', 'heaths', 'urban', 'waste'],
        icons: { woods: 'tree', grasses: 'plant', leaves: 'leaf', meadows: 'flower', paths: 'path', heaths: 'tree-evergreen', urban: 'buildings', waste: 'trash' } },
      { kind: 'chips', name: 'season', label: 'Season',
        values: ['spring', 'summer', 'autumn', 'winter'],
        icons: { spring: 'flower-tulip', summer: 'sun', autumn: 'leaf', winter: 'snowflake' } },
    ],
  },
];

const CITIBIKE_SECTIONS = [
  {
    title: 'Day', icon: 'calendar-blank',
    fields: [{ kind: 'date', name: 'date', label: 'Date in New York' }],
  },
  {
    title: 'Temperature', icon: 'thermometer',
    fields: [
      { kind: 'slider', name: 'tmax_c', label: 'Maximum', unit: '°C', min: -15, max: 40, curve: 0, decimals: 1 },
      { kind: 'slider', name: 'tmin_c', label: 'Minimum', unit: '°C', min: -20, max: 32, curve: 0, decimals: 1 },
    ],
  },
  {
    title: 'Rain and snow', icon: 'cloud-rain',
    fields: [
      { kind: 'slider', name: 'precipitation_mm', label: 'Precipitation', unit: 'mm', min: 0, max: 60, curve: 2.2, decimals: 1 },
      { kind: 'slider', name: 'snowfall_mm', label: 'Snowfall', unit: 'mm', min: 0, max: 300, curve: 2.2, decimals: 0 },
      { kind: 'slider', name: 'snow_depth_mm', label: 'Snow on the ground', unit: 'mm', min: 0, max: 500, curve: 2.2, decimals: 0 },
    ],
  },
  {
    title: 'Wind', icon: 'wind',
    fields: [
      { kind: 'slider', name: 'wind_ms', label: 'Average wind', unit: 'm/s', min: 0, max: 15, curve: 0, decimals: 1, nullable: true, unsetLabel: 'not set' },
    ],
  },
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MUSHROOM_EMPTY = {
  cap_diameter: null, stem_height: null, stem_width: null, cap_shape: null, gill_color: null,
  spore_print_color: null, stem_surface: null, ring_type: null, habitat: null, season: null,
};
const CITIBIKE_DEFAULT = () => ({
  date: today(), tmax_c: 20, tmin_c: 12, precipitation_mm: 0, snowfall_mm: 0, snow_depth_mm: 0, wind_ms: null,
});

const state = {
  mode: 'mushroom',
  mushroom: { ...MUSHROOM_EMPTY },
  citibike: CITIBIKE_DEFAULT(),
};

let stage = null;           // the 3D stage, once loaded
const controls = { mushroom: {}, citibike: {} };   // name -> { set(value) }

/* ================================================================ small helpers */

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.setAttribute('style', v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}
const icon = (name, fill = false) => el('i', { class: `${fill ? 'ph-fill' : 'ph'} ph-${name}`, 'aria-hidden': 'true' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================================================================ form controls */

/* Slider with an optional "not measured" state.

   Two reasons for sliders over number boxes: they cannot hold a malformed
   number (a comma typed where the browser expects a full stop used to arrive
   as "not observed"), and dragging one makes the mushroom grow in real time.
   Small values matter most, so most sliders use a curved scale: the first half
   of the track covers the small sizes. */
function slider(def, initial, onChange) {
  const id = `f-${def.name}`;
  const k = def.curve || 0;
  const span = def.max - def.min;
  const toValue = (s) => {
    const raw = k ? def.min + span * (Math.exp(k * s) - 1) / (Math.exp(k) - 1) : def.min + span * s;
    const f = 10 ** def.decimals;
    return Math.round(raw * f) / f;
  };
  const toPos = (v) => {
    const x = Math.min(Math.max((v - def.min) / span, 0), 1);
    return k ? Math.log(1 + x * (Math.exp(k) - 1)) / k : x;
  };

  const input = el('input', { type: 'range', id, min: 0, max: 1000, step: 1 });
  const out = el('output', { class: 'slider-value', for: id });
  const clear = def.nullable
    ? el('button', { type: 'button', class: 'slider-clear', 'aria-label': `Clear ${def.label.toLowerCase()}` }, icon('x'))
    : null;
  const wrap = el('div', { class: 'slider' },
    el('div', { class: 'slider-head' },
      el('label', { for: id, text: def.label }),
      el('span', {}, out, clear)),
    input,
    el('div', { class: 'slider-scale' },
      el('span', { text: `${def.min}` }),
      el('span', { text: `${def.max} ${def.unit}` })));

  let value = initial;
  const unsetText = def.unsetLabel || 'not measured';

  function paint() {
    const unset = value == null;
    wrap.toggleAttribute('data-unset', unset);
    const pos = unset ? 0.32 : toPos(value);
    input.value = String(Math.round(pos * 1000));
    input.style.setProperty('--pct', `${(pos * 100).toFixed(1)}%`);
    const text = unset ? unsetText : `${value.toFixed(def.decimals)} ${def.unit}`;
    out.textContent = text;
    input.setAttribute('aria-valuetext', text);
  }
  function commit() {
    value = toValue(Number(input.value) / 1000);
    paint();
    onChange(value);
  }

  input.addEventListener('input', commit);
  // Pressing an unset slider without moving it should still count as "measured".
  input.addEventListener('pointerdown', () => { if (value == null) commit(); });
  input.addEventListener('keydown', (e) => {
    if (value == null && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) commit();
  });
  if (clear) clear.addEventListener('click', () => { value = null; paint(); onChange(null); input.focus(); });

  paint();
  return { node: wrap, set(v) { value = v; paint(); } };
}

/* Chips and swatches are radio groups. "Not observed" is always the first
   option and the default; it sends null. */
function choiceGroup(def, initial, onChange, swatch) {
  const legendOut = el('output');
  const options = el('div', { class: swatch ? 'swatches' : 'chips' });
  const group = el('fieldset', { class: 'group' },
    el('legend', {}, el('span', { text: def.label }), legendOut), options);

  const add = (value, text, extraClass, style) => {
    const input = el('input', { type: 'radio', name: def.name, value: value ?? '', 'aria-label': swatch ? text : null });
    const face = swatch ? el('span') : el('span', {}, def.icons?.[value] ? icon(def.icons[value]) : null, text);
    const label = el('label', { class: `${swatch ? 'swatch' : 'chip'} ${extraClass || ''}`.trim(), title: swatch ? text : null, style }, input, face);
    input.addEventListener('change', () => { if (input.checked) { show(value); onChange(value); } });
    options.append(label);
    return input;
  };

  const inputs = new Map();
  inputs.set(null, add(null, 'Not observed', 'unknown'));
  if (swatch && def.none) inputs.set('none', add('none', `None, ${def.none}`, 'none'));
  for (const v of def.values) {
    if (swatch) inputs.set(v, add(v, v, '', `--c:${MUSHROOM_COLOURS[v]};--dot:${dotFor(v)}`));
    else inputs.set(v, add(v, v === 'none' ? 'None (absent)' : cap(v)));
  }

  function show(value) {
    legendOut.textContent = value == null ? 'not observed' : (value === 'none' ? 'none' : value);
    legendOut.classList.toggle('set', value != null);
  }
  function set(value) {
    const input = inputs.get(value ?? null) || inputs.get(null);
    input.checked = true;
    show(value ?? null);
  }
  set(initial);
  return { node: group, set };
}

function dateField(def, initial, onChange) {
  const input = el('input', { type: 'date', id: `f-${def.name}`, value: initial, min: '2014-01-01', max: '2035-12-31' });
  input.addEventListener('change', () => onChange(input.value || null));
  const node = el('label', { class: 'text-field' }, el('span', { text: def.label }), input);
  return { node, set(v) { input.value = v || ''; } };
}

function buildPanel(mode, sections, container) {
  sections.forEach((section, i) => {
    const box = el('section', { class: 'section', style: `--i:${i}` },
      el('h2', {}, icon(section.icon), section.title));
    for (const def of section.fields) {
      const onChange = (value) => setField(mode, def.name, value);
      const initial = state[mode][def.name];
      let control;
      if (def.kind === 'slider') control = slider(def, initial, onChange);
      else if (def.kind === 'chips') control = choiceGroup(def, initial, onChange, false);
      else if (def.kind === 'swatches') control = choiceGroup(def, initial, onChange, true);
      else control = dateField(def, initial, onChange);
      controls[mode][def.name] = control;
      box.append(control.node);
    }
    container.append(box);
  });
}

/* ================================================================ state changes */

function setField(mode, name, value) {
  state[mode][name] = value;

  // Keep the minimum at or below the maximum: impossible weather is prevented
  // here rather than rejected later.
  if (mode === 'citibike') {
    const c = state.citibike;
    if (name === 'tmax_c' && c.tmin_c > c.tmax_c) { c.tmin_c = c.tmax_c; controls.citibike.tmin_c.set(c.tmin_c); }
    if (name === 'tmin_c' && c.tmin_c > c.tmax_c) { c.tmax_c = c.tmin_c; controls.citibike.tmax_c.set(c.tmax_c); }
  }
  syncScene(mode);
  markStale(mode);
}

function syncScene(mode) {
  if (!stage) return;
  stage[mode].update(state[mode]);
  stage.refreshSky();
}

function markStale(mode) {
  const hud = $(`hud-${mode}`);
  if (hud.dataset.state === 'done') hud.setAttribute('data-stale', '');
}

function setAll(mode, values) {
  Object.assign(state[mode], values);
  for (const [name, control] of Object.entries(controls[mode])) control.set(state[mode][name]);
  syncScene(mode);
  markStale(mode);
}

/* A random but plausible mushroom, to make exploring the model one click. */
function randomMushroom() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const maybe = (p, v) => (Math.random() < p ? v : null);
  const field = (name) => MUSHROOM_SECTIONS.flatMap((s) => s.fields).find((f) => f.name === name);
  const m = {
    cap_diameter: maybe(0.85, Math.round((1 + Math.random() ** 2 * 18) * 10) / 10),
    stem_height: maybe(0.8, Math.round((1 + Math.random() ** 1.5 * 12) * 10) / 10),
    stem_width: maybe(0.8, Math.round((2 + Math.random() ** 2 * 30) * 10) / 10),
    cap_shape: maybe(0.85, pick(field('cap_shape').values)),
    gill_color: maybe(0.8, pick(field('gill_color').values)),
    spore_print_color: maybe(0.6, pick(field('spore_print_color').values)),
    stem_surface: maybe(0.75, pick(field('stem_surface').values.filter((v) => v !== 'none'))),
    ring_type: maybe(0.8, pick(field('ring_type').values)),
    habitat: maybe(0.9, pick(field('habitat').values)),
    season: maybe(0.9, pick(field('season').values)),
  };
  // Now and then a stemless one, which is a strong signal in the data.
  if (Math.random() < 0.12) Object.assign(m, { stem_surface: 'none', stem_height: 0, stem_width: 0, ring_type: 'none' });
  return m;
}

/* ================================================================ API */

function apiUrl(path) {
  return settings.apiBase.replace(/\/+$/, '') + path;
}

/*
  The API runs on a free host that sleeps after about fifteen minutes idle and
  needs about a minute to wake. A request that reaches it while asleep fails at
  the proxy (502, 504) or at the network level, without our JSON. Those are
  retried. A 503 WITH a `detail` is our API answering on purpose (for example a
  missing artefact) and is shown straight away.
*/
async function postJson(path, body, onRetry) {
  const attempts = 8;
  const delay = 8000;
  for (let attempt = 1; ; attempt++) {
    let response;
    let data = null;
    try {
      response = await fetch(apiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    } catch {
      response = null;
    }

    const waking = !response || response.status === 502 || response.status === 504
      || (response.status === 503 && !(data && data.detail));
    if (waking) {
      if (attempt >= attempts) throw new Error('The backend did not wake up in time. Try again in a minute.');
      onRetry(attempt);
      await wait(delay);
      continue;
    }
    if (!response.ok) throw new Error((data && (data.detail || data.error)) || `HTTP ${response.status}`);
    if (!data) throw new Error('The API answered with something that is not JSON.');
    return data;
  }
}

let healthTimer = null;
async function checkHealth(attempt = 0) {
  const pill = $('api-status');
  const label = $('api-status-text');
  clearTimeout(healthTimer);
  if (settings.demo) {
    pill.dataset.state = 'demo';
    label.textContent = 'Demo mode';
    return;
  }
  if (attempt === 0) { pill.dataset.state = ''; label.textContent = 'Checking backend'; }

  try {
    const response = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const info = await response.json();
    pill.dataset.state = 'online';
    label.textContent = 'Backend online';
    if (info && info.models) $('footer-models').textContent = `Serving: ${[].concat(info.models).join(', ')}.`;
  } catch {
    // Retry for about two minutes before calling the backend unreachable.
    if (attempt + 1 < 12) {
      pill.dataset.state = 'waking';
      label.textContent = 'Waking the backend';
      healthTimer = setTimeout(() => checkHealth(attempt + 1), 10000);
      return;
    }
    pill.dataset.state = 'offline';
    label.textContent = 'Backend unreachable';
  }
}

/* ================================================================ demo mode */

/* Placeholder arithmetic so the interface can be shown without a backend. It
   is not the model and does not pretend to be: a banner stays on screen and
   every result says so. */
function demoMushroom(m) {
  let score = -0.6;
  if (m.stem_width != null) score += (m.stem_width - 12) * 0.04;
  if (m.cap_diameter != null) score += (m.cap_diameter - 7) * 0.03;
  if (m.stem_surface === 'none' || m.stem_height === 0 || m.stem_width === 0) score += 2.2;
  if (m.ring_type === 'none') score += 0.3;
  const p = 1 / (1 + Math.exp(-score));
  return {
    probability_poisonous: p, threshold: 0.139, verdict: p >= 0.139 ? 'poisonous' : 'edible',
    has_stem: null, model: 'demo placeholder', notes: [], demo: true,
  };
}

function demoCitibike(c) {
  const level = 124000;
  const t = c.tmax_c ?? 15;
  let ratio = 0.45 + 0.055 * t - 0.0012 * t * t;
  ratio *= Math.exp(-0.03 * (c.precipitation_mm || 0)) * Math.exp(-0.004 * (c.snowfall_mm || 0));
  ratio = Math.max(0.1, Math.min(1.6, ratio));
  const d = new Date(`${c.date}T12:00:00`);
  return {
    trips: Math.round(level * ratio), level_12m: level, ratio,
    calendar: { weekday: (d.getDay() + 6) % 7, month: d.getMonth() + 1, holiday: false, christmas_week: false },
    model: 'demo placeholder', demo: true,
  };
}

/* ================================================================ result card */

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function setHud(mode, hudState) {
  const hud = $(`hud-${mode}`);
  hud.dataset.state = hudState;
  hud.removeAttribute('data-stale');
}

/* Count the headline number up. Decoration, so skipped under reduced motion
   and when the tab is hidden (animation frames do not run in background tabs,
   and a slow cold start is exactly when people switch tabs). */
function countUp(node, value, format) {
  if (REDUCED || document.hidden) { node.innerHTML = format(value); return; }
  const start = performance.now();
  const frame = (now) => {
    const p = Math.min(1, (now - start) / 750);
    node.innerHTML = format(value * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* The gauge arc is one SVG path; the value is drawn by dashing it, and the
   threshold tick sits on the same path. */
function setGauge(fraction, fill, track) {
  const path = $('arc-fill');
  const length = path.getTotalLength();
  $('arc-track').style.setProperty('--track', track);
  path.style.setProperty('--fill', fill);
  path.style.strokeDasharray = length;
  path.style.strokeDashoffset = length;
  path.getBoundingClientRect();   // commit the start so the transition runs
  path.style.strokeDashoffset = length * (1 - Math.min(Math.max(fraction, 0), 1));
}
function setTick(fraction) {
  const at = (r) => {
    const a = Math.PI * (1 - fraction);
    return [100 + r * Math.cos(a), 100 - r * Math.sin(a)];
  };
  const [x1, y1] = at(68);
  const [x2, y2] = at(92);
  for (const id of ['tick', 'tick-halo']) {
    const line = $(id);
    line.setAttribute('x1', x1.toFixed(2)); line.setAttribute('y1', y1.toFixed(2));
    line.setAttribute('x2', x2.toFixed(2)); line.setAttribute('y2', y2.toFixed(2));
  }
}

function renderMushroom(res) {
  const p = Number(res.probability_poisonous);
  const threshold = Number(res.threshold);
  const poisonous = p >= threshold;

  const verdict = $('mushroom-verdict');
  verdict.dataset.level = poisonous ? 'critical' : 'good';
  verdict.querySelector('.verdict-icon').className = `verdict-icon ph-fill ${poisonous ? 'ph-skull' : 'ph-check-circle'}`;
  verdict.querySelector('.verdict-text').textContent = poisonous ? 'Flagged as poisonous' : 'Not flagged';

  const hue = poisonous ? 'var(--critical)' : 'var(--good)';
  setGauge(p, hue, `color-mix(in oklab, ${hue} 22%, var(--surface-2))`);
  setTick(threshold);
  countUp($('mushroom-prob'), p * 100, (v) => `${v.toFixed(1)}<small>%</small>`);

  const facts = $('mushroom-facts');
  facts.replaceChildren();
  const row = (k, v) => facts.append(el('dt', { text: k }), el('dd', { text: v }));
  row('Decision line', `${(threshold * 100).toFixed(1)}%`);
  row('Stem, as the API read it', res.has_stem === 1 ? 'has a stem' : res.has_stem === 0 ? 'no stem' : 'unknown');

  const notes = $('mushroom-notes');
  notes.replaceChildren();
  if (res.notes && res.notes.length) {
    notes.append(el('div', { class: 'notes' },
      el('strong', { text: 'Worth knowing about this input' }),
      el('ul', {}, ...res.notes.map((n) => el('li', { text: n })))));
  }

  $('mushroom-provenance').textContent = res.demo
    ? 'Demo placeholder, not a model prediction.'
    : `Model: ${res.model}${res.notebook ? ` (${res.notebook})` : ''}. The decision line is the highest `
      + 'threshold that still caught 90% of the poisonous mushrooms in the validation set, so false '
      + 'alarms are expected and intended. The model has a known blind spot for large mushrooms with '
      + 'a stem and no striking features.';
  setHud('mushroom', 'done');
}

function renderCitibike(res) {
  const trips = Number(res.trips);
  const level = Number(res.level_12m);
  const ratio = res.ratio != null ? Number(res.ratio) : (level ? trips / level : 0);

  countUp($('citibike-trips'), trips, (v) => `${Math.round(v).toLocaleString('en-US')}<small> trips</small>`);
  $('citibike-relative').textContent =
    `${Math.round(ratio * 100)}% of an average day over the last twelve months.`;

  const scaleMax = 1.5;
  const fill = $('citibike-meter').querySelector('.meter-fill');
  fill.style.width = '0%';
  fill.getBoundingClientRect();
  fill.style.width = `${Math.min(ratio / scaleMax, 1) * 100}%`;
  const mark = `${(100 / scaleMax).toFixed(1)}%`;
  $('meter-mark').style.left = mark;
  $('meter-mark-label').style.left = mark;

  const tags = $('citibike-tags');
  tags.replaceChildren();
  const cal = res.calendar || {};
  if (cal.weekday != null) tags.append(el('li', { text: WEEKDAYS[cal.weekday] }));
  if (cal.month != null) tags.append(el('li', { text: MONTHS[cal.month - 1] }));
  if (cal.holiday) tags.append(el('li', { class: 'flag', text: 'US federal holiday' }));
  if (cal.christmas_week) tags.append(el('li', { class: 'flag', text: 'Christmas week' }));

  $('citibike-provenance').textContent = res.demo
    ? 'Demo placeholder, not a model prediction.'
    : `Model: ${res.model}${res.notebook ? ` (${res.notebook})` : ''}. It predicts the day as a ratio `
      + `of the twelve-month level (${Math.round(level).toLocaleString('en-US')} trips a day`
      + `${res.level_source ? `, ${res.level_source}` : ''}) and the API turns that into trips. `
      + 'The validation error was about 9.6% per day; recent months ran higher than the model expected, '
      + 'so treat a single day as indicative.';
  setHud('citibike', 'done');
}

function showError(mode, message, retry) {
  const box = $(`hud-${mode}`).querySelector('.hud-error');
  box.replaceChildren(el('strong', { text: 'No answer this time. ' }), message);
  if (retry) {
    const again = el('button', { type: 'button', class: 'link', text: 'Try again' });
    again.addEventListener('click', retry);
    box.append(' ', again);
  }
  setHud(mode, 'error');
}

/* ================================================================ predicting */

const busy = { mushroom: false, citibike: false };

async function predict(mode) {
  if (busy[mode]) return;
  if (mode === 'citibike' && !state.citibike.date) {
    showError('citibike', 'Pick a date first.');
    return;
  }

  busy[mode] = true;
  const button = $(`predict-${mode}`);
  button.disabled = true;
  const waitText = $(`${mode}-wait`);
  waitText.textContent = 'Asking the model.';
  setHud(mode, 'loading');
  if (stage) stage[mode].startScan();
  const started = performance.now();

  try {
    const payload = { ...state[mode] };
    const res = settings.demo
      ? (mode === 'mushroom' ? demoMushroom(payload) : demoCitibike(payload))
      : await postJson(`/api/${mode}`, payload, (n) => {
        waitText.textContent = `The backend is waking up after a quiet spell. Retrying (${n} of 7).`;
        if (n === 1) checkHealth();
      });

    // A short minimum so the scan is seen even when the API is instant.
    const minimum = REDUCED ? 0 : 650;
    await wait(Math.max(0, minimum - (performance.now() - started)));

    if (mode === 'mushroom') {
      if (stage) stage.mushroom.stopScan(res.verdict);
      renderMushroom(res);
    } else {
      const ratio = res.ratio != null ? res.ratio : res.trips / res.level_12m;
      if (stage) stage.citibike.stopScan(ratio);
      renderCitibike(res);
    }
    if (!settings.demo) $('api-status').dataset.state = 'online';
    revealResult(mode);
  } catch (error) {
    if (stage) stage[mode].stopScan(null);
    showError(mode, error.message, () => predict(mode));
  } finally {
    busy[mode] = false;
    button.disabled = false;
  }
}

/* On narrow screens the result card sits under the 3D view; bring it into view. */
function revealResult(mode) {
  if (window.innerWidth >= 1024) return;
  $(`hud-${mode}`).scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
}

async function fetchWeather() {
  const button = $('weather-citibike');
  if (settings.demo) { showError('citibike', 'Real weather needs the backend. Turn off demo mode first.'); return; }
  if (!state.citibike.date) { showError('citibike', 'Pick a date first.'); return; }

  const label = button.innerHTML;
  button.disabled = true;
  button.textContent = 'Fetching';
  try {
    const response = await fetch(apiUrl(`/api/weather?date=${encodeURIComponent(state.citibike.date)}`));
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || `HTTP ${response.status}`);
    const next = {};
    for (const key of ['tmax_c', 'tmin_c', 'precipitation_mm', 'snowfall_mm', 'snow_depth_mm']) {
      if (body[key] != null) next[key] = body[key];
    }
    next.wind_ms = body.wind_ms ?? null;
    setAll('citibike', next);
  } catch (error) {
    showError('citibike', error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = label;
  }
}

/* ================================================================ mode switch */

const INTRO = {
  mushroom: ['Build a mushroom. Ask the model.', 'Describe what you see. Anything you leave out stays a wireframe.'],
  citibike: ['Pick a day. Forecast the city.', 'Set the weather and see how busy the bikes of New York get.'],
};

function setMode(mode, { fromHash = false } = {}) {
  if (!['mushroom', 'citibike'].includes(mode)) mode = 'mushroom';
  const changed = state.mode !== mode;
  state.mode = mode;
  document.body.dataset.mode = mode;

  for (const m of ['mushroom', 'citibike']) {
    const on = m === mode;
    const tab = $(`tab-${m}`);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`panel-${m}`).hidden = !on;
    $(`hud-${m}`).hidden = !on;
  }

  const intro = document.querySelector('.stage-intro');
  $('stage-title').textContent = INTRO[mode][0];
  $('stage-sub').textContent = INTRO[mode][1];
  if (changed) { intro.classList.remove('swap'); void intro.offsetWidth; intro.classList.add('swap'); }

  if (stage) stage.setMode(mode);
  if (!fromHash && location.hash !== `#${mode}`) history.replaceState(null, '', `#${mode}`);
}

function wireTabs() {
  const tabs = [$('tab-mushroom'), $('tab-citibike')];
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => setMode(i === 0 ? 'mushroom' : 'citibike'));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const next = tabs[1 - i];
      next.focus();
      next.click();
    });
  });
  window.addEventListener('hashchange', () => setMode(location.hash.slice(1), { fromHash: true }));
}

/* ================================================================ theme, settings */

function isDark() {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'dark') return true;
  if (set === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function wireTheme() {
  const stored = store.get('ggi.theme', 'auto');
  if (stored === 'light' || stored === 'dark') document.documentElement.setAttribute('data-theme', stored);
  $('theme-toggle').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('ggi.theme', next);
    if (stage) stage.setDark(next === 'dark');
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (stage) stage.setDark(isDark());
  });
}

function wireSettings() {
  const dialog = $('api-dialog');
  const open = () => {
    $('api-base').value = settings.apiBase;
    $('demo-mode').checked = settings.demo;
    dialog.showModal();
  };
  $('api-status').addEventListener('click', open);
  $('open-settings').addEventListener('click', open);
  $('api-cancel').addEventListener('click', () => dialog.close());
  $('api-form').addEventListener('submit', () => {
    settings.apiBase = $('api-base').value.trim();
    settings.demo = $('demo-mode').checked;
    store.set('ggi.apiBase', settings.apiBase);
    store.set('ggi.demoMode', settings.demo ? '1' : '0');
    $('demo-banner').hidden = !settings.demo;
    checkHealth();
  });
  $('demo-off').addEventListener('click', () => {
    settings.demo = false;
    store.set('ggi.demoMode', '0');
    $('demo-banner').hidden = true;
    checkHealth();
  });
  $('demo-banner').hidden = !settings.demo;
}

/* ================================================================ 3D */

async function boot3d() {
  try {
    const { createStage } = await import('./stage.js');
    stage = createStage($('stage-canvas'), document.querySelector('.stage'));
    stage.mushroom.update(state.mushroom);
    stage.citibike.update(state.citibike);
    stage.setMode(state.mode);
  } catch (error) {
    // No WebGL, or the CDN is blocked. The form and predictions still work.
    console.warn('3D preview unavailable:', error);
    document.body.classList.add('no-3d');
  }
}

/* ================================================================ start */

buildPanel('mushroom', MUSHROOM_SECTIONS, $('fields-mushroom'));
buildPanel('citibike', CITIBIKE_SECTIONS, $('fields-citibike'));

for (const mode of ['mushroom', 'citibike']) {
  $(`panel-${mode}`).addEventListener('submit', (e) => { e.preventDefault(); predict(mode); });
}
$('random-mushroom').addEventListener('click', () => setAll('mushroom', randomMushroom()));
$('reset-mushroom').addEventListener('click', () => { setAll('mushroom', { ...MUSHROOM_EMPTY }); setHud('mushroom', 'idle'); });
$('reset-citibike').addEventListener('click', () => {
  setAll('citibike', CITIBIKE_DEFAULT());
  setHud('citibike', 'idle');
  if (stage) stage.citibike.reset();
});
$('weather-citibike').addEventListener('click', fetchWeather);

wireTabs();
wireTheme();
wireSettings();
setMode(location.hash.slice(1) || 'mushroom', { fromHash: true });
$('footer-models').textContent = 'Deployed: mushroom gradient boosting (decision line 13.9%), Citi Bike gradient boosting.';
checkHealth();
boot3d();
