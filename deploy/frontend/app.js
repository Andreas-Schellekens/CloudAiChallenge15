/*
  Going Green Inference - front end logic

  Design rule that explains most of this file: the page does not know how the
  models work. It collects raw inputs, posts them, and renders the response.

  Feature derivation (the mushroom stem rule, the Citi Bike calendar columns and
  the twelve-month level) happens only in the backend. If the page recomputed any
  of it, there would be two implementations of the deployment contract that could
  silently disagree after a retrain. So everything the page shows under
  "Derived by the API" is read straight out of the response body.

  Contract: see deploy/README.md. Model contracts: CLAUDE.md 5.5 and 6.14.
*/

'use strict';

// ---------------------------------------------------------------- configuration

var STORE_BASE = 'ggi.apiBase';
var STORE_DEMO = 'ggi.demoMode';
var STORE_THEME = 'ggi.theme';

// localStorage throws in some embedded contexts, so every access is guarded and
// the page must render correctly when nothing can be read back.
function readStore(key, fallback) {
  try {
    var v = window.localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
function writeStore(key, value) {
  try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
}

var state = {
  // Same origin by default: that is the case when the API serves this page, or
  // when Vercel rewrites /api to the backend.
  apiBase: readStore(STORE_BASE, ''),
  demo: readStore(STORE_DEMO, '0') === '1'
};

// ---------------------------------------------------------------- field definitions

// Valid values and training ranges come from CLAUDE.md section 5.1. "none" is a
// real observation (no gills, no ring, no stem surface); "not observed" is the
// absence of an observation. The model treats them differently, so the form must
// keep them apart.
var MUSHROOM_NUMBERS = [
  { name: 'cap_diameter', label: 'Cap diameter', unit: 'cm', min: 0.56, max: 57.4, step: 0.1 },
  { name: 'stem_height', label: 'Stem height', unit: 'cm', min: 0, max: 32.4, step: 0.1 },
  { name: 'stem_width', label: 'Stem width', unit: 'mm', min: 0, max: 102.5, step: 0.1 }
];

var MUSHROOM_CATEGORIES = [
  { name: 'cap_shape', label: 'Cap shape',
    values: ['bell', 'conical', 'convex', 'flat', 'others', 'spherical', 'sunken'] },
  { name: 'gill_color', label: 'Gill colour',
    values: ['black', 'brown', 'buff', 'gray', 'green', 'none', 'orange', 'pink',
             'purple', 'red', 'white', 'yellow'] },
  { name: 'spore_print_color', label: 'Spore print colour',
    values: ['black', 'brown', 'gray', 'green', 'pink', 'purple', 'white'] },
  { name: 'stem_surface', label: 'Stem surface',
    values: ['fibrous', 'grooves', 'none', 'scaly', 'shiny', 'silky', 'smooth', 'sticky'] },
  { name: 'ring_type', label: 'Ring type',
    values: ['evanescent', 'flaring', 'grooved', 'large', 'movable', 'none', 'pendant', 'zone'] },
  { name: 'habitat', label: 'Habitat',
    values: ['grasses', 'heaths', 'leaves', 'meadows', 'paths', 'urban', 'waste', 'woods'] },
  { name: 'season', label: 'Season',
    values: ['spring', 'summer', 'autumn', 'winter'] }
];

var CITIBIKE_FIELDS = [
  { name: 'date', label: 'Date', type: 'date', wide: true,
    hint: 'The API derives weekday, month, day of year, holiday and Christmas week from this.' },
  { name: 'tmax_c', label: 'Maximum temperature', unit: 'degrees C', step: 0.1 },
  { name: 'tmin_c', label: 'Minimum temperature', unit: 'degrees C', step: 0.1 },
  { name: 'precipitation_mm', label: 'Precipitation', unit: 'mm', min: 0, step: 0.1 },
  { name: 'snowfall_mm', label: 'Snowfall', unit: 'mm', min: 0, step: 0.1 },
  { name: 'snow_depth_mm', label: 'Snow on the ground', unit: 'mm', min: 0, step: 1 },
  { name: 'wind_ms', label: 'Wind speed', unit: 'm/s', min: 0, step: 0.1,
    hint: 'Optional: the model accepts this as missing.' }
];

// Examples: a plausible observation and a mild autumn day.
var EXAMPLES = {
  mushroom: {
    cap_diameter: 8.4, stem_height: 6.2, stem_width: 14.8,
    cap_shape: 'convex', gill_color: 'brown', spore_print_color: 'white',
    stem_surface: 'smooth', ring_type: 'none', habitat: 'woods', season: 'autumn'
  },
  citibike: {
    date: isoToday(), tmax_c: 18.5, tmin_c: 11.0,
    precipitation_mm: 0, snowfall_mm: 0, snow_depth_mm: 0, wind_ms: 3.2
  }
};

function isoToday() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }

// ---------------------------------------------------------------- icons

var ICON_SKULL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 2a8 8 0 0 0-5 14.2V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.8A8 8 0 0 0 12 2Z"></path>' +
  '<path d="M9 11h.01M15 11h.01M10 16h4"></path></svg>';

var ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M20 6 9 17l-5-5"></path></svg>';

// ---------------------------------------------------------------- form building

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function numberField(def) {
  var wrap = el('label', 'field' + (def.wide ? ' field--wide' : ''));
  var head = el('span', 'field-label', def.label + (def.unit ? ' (' + def.unit + ')' : ''));
  var input = document.createElement('input');
  input.type = def.type || 'number';
  input.name = def.name;
  input.id = 'f-' + def.name;
  if (def.step !== undefined) input.step = String(def.step);
  if (def.min !== undefined) input.min = String(def.min);
  if (def.max !== undefined) input.max = String(def.max);
  if (def.type !== 'date') input.placeholder = 'not observed';
  head.setAttribute('for', input.id);
  wrap.appendChild(head);
  wrap.appendChild(input);

  var hint = def.hint;
  if (!hint && def.min !== undefined && def.max !== undefined) {
    hint = 'Training range ' + def.min + ' to ' + def.max + '.';
  }
  if (hint) wrap.appendChild(el('span', 'field-hint', hint));
  return wrap;
}

function selectField(def) {
  var wrap = el('label', 'field');
  var head = el('span', 'field-label', def.label);
  var select = document.createElement('select');
  select.name = def.name;
  select.id = 'f-' + def.name;
  head.setAttribute('for', select.id);

  var blank = el('option', null, 'Not observed');
  blank.value = '';
  select.appendChild(blank);

  def.values.forEach(function (v) {
    var o = el('option', null, v === 'none' ? 'none (absent)' : v);
    o.value = v;
    select.appendChild(o);
  });

  wrap.appendChild(head);
  wrap.appendChild(select);
  return wrap;
}

function buildForms() {
  var m = document.getElementById('fields-mushroom');
  MUSHROOM_NUMBERS.forEach(function (d) { m.appendChild(numberField(d)); });
  MUSHROOM_CATEGORIES.forEach(function (d) { m.appendChild(selectField(d)); });

  var c = document.getElementById('fields-citibike');
  CITIBIKE_FIELDS.forEach(function (d) { c.appendChild(numberField(d)); });
}

/*
  Empty stays empty: null tells the API "not observed", which it maps to the
  "missing" category or to NaN. Sending 0 instead would be a real measurement.

  The badInput check is not cosmetic. A number input whose contents the browser
  cannot parse reports an empty value, so "18,5" typed where the browser wants a
  full stop would arrive as null and be silently read as "not observed" - a typo
  would quietly become missing data and change the prediction. Refuse instead.
*/
function collect(form) {
  var out = {};
  var rejected = [];

  Array.prototype.forEach.call(form.elements, function (field) {
    if (!field.name) return;
    if (field.validity && field.validity.badInput) {
      var label = form.querySelector('[for="' + field.id + '"]');
      rejected.push(label ? label.textContent : field.name);
      return;
    }
    var raw = field.value.trim();
    if (raw === '') { out[field.name] = null; return; }
    out[field.name] = field.type === 'number' ? Number(raw) : raw;
  });

  if (rejected.length) {
    var err = new Error(
      'These fields could not be read as a number: ' + rejected.join(', ') +
      '. Use a full stop as the decimal separator, or clear the field to mark it ' +
      'as not observed.');
    err.userInput = true;
    throw err;
  }
  return out;
}

function fill(form, values) {
  Object.keys(values).forEach(function (k) {
    var field = form.elements[k];
    if (field) field.value = String(values[k]);
  });
}

// ---------------------------------------------------------------- API access

function apiUrl(path) {
  var base = state.apiBase.replace(/\/+$/, '');
  return base + path;
}

function postJson(path, body) {
  return fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function (res) {
    return res.text().then(function (text) {
      var data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
      if (!res.ok) {
        var msg = (data && (data.detail || data.error)) || ('HTTP ' + res.status);
        throw new Error(msg);
      }
      if (!data) throw new Error('The API returned a response that is not JSON.');
      return data;
    });
  });
}

function checkHealth() {
  var pill = document.getElementById('api-status');
  var label = document.getElementById('api-status-text');

  if (state.demo) {
    pill.dataset.state = 'demo';
    label.textContent = 'Demo mode';
    return;
  }
  pill.dataset.state = '';
  label.textContent = 'Checking backend';

  fetch(apiUrl('/api/health'), { method: 'GET' })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
    .then(function (info) {
      pill.dataset.state = 'online';
      label.textContent = 'Backend online';
      if (info && info.models) {
        document.getElementById('footer-models').textContent =
          'Serving: ' + [].concat(info.models).join(' / ') + '.';
      }
    })
    .catch(function () {
      pill.dataset.state = 'offline';
      label.textContent = state.apiBase ? 'Backend unreachable' : 'No backend set';
    });
}

// ---------------------------------------------------------------- demo mode

/*
  Placeholder arithmetic for showing the interface without a backend. It is not
  the model and does not pretend to be: the banner stays on screen and every
  result is labelled. Two crude monotone responses, nothing fitted.
*/
function demoMushroom(input) {
  var score = -0.4;
  if (input.stem_width !== null && input.stem_width !== undefined) score += (input.stem_width - 12) * 0.05;
  if (input.cap_diameter !== null && input.cap_diameter !== undefined) score += (input.cap_diameter - 7) * 0.04;
  if (input.stem_surface === 'none') score += 1.2;
  if (input.ring_type === 'none') score += 0.3;
  if (input.spore_print_color === 'white') score += 0.25;
  var p = 1 / (1 + Math.exp(-score));
  var stemless = input.stem_surface === 'none' ||
    input.stem_height === 0 || input.stem_width === 0;
  return {
    probability_poisonous: p,
    threshold: 0.139,
    verdict: p >= 0.139 ? 'poisonous' : 'edible',
    has_stem: stemless ? 0 : 1,
    model: 'demo placeholder (not a model)',
    demo: true
  };
}

function demoCitibike(input) {
  var level = 120000;
  var t = input.tmax_c === null || input.tmax_c === undefined ? 15 : input.tmax_c;
  var rain = input.precipitation_mm || 0;
  var ratio = 0.45 + 0.055 * t - 0.0013 * t * t;
  ratio *= Math.exp(-0.025 * rain);
  ratio = Math.max(0.1, Math.min(1.5, ratio));
  var d = input.date ? new Date(input.date + 'T12:00:00') : new Date();
  var weekday = (d.getDay() + 6) % 7;
  return {
    trips: Math.round(level * ratio),
    level_12m: level,
    ratio: ratio,
    calendar: {
      weekday: weekday,
      month: d.getMonth() + 1,
      day_of_year: Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000),
      holiday: false,
      christmas_week: false
    },
    model: 'demo placeholder (not a model)',
    demo: true
  };
}

// ---------------------------------------------------------------- rendering helpers

var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
              'August', 'September', 'October', 'November', 'December'];

function setMeter(rootId, fraction, fill, track) {
  var root = document.getElementById(rootId);
  root.style.setProperty('--fill', fill);
  root.style.setProperty('--track', track);
  var pct = Math.max(0, Math.min(1, fraction)) * 100;
  root.querySelector('.meter-fill').style.width = pct.toFixed(1) + '%';
}

/*
  The arc gauge.

  The semicircle in the markup is a single path of known length, so the value is
  drawn by dashing it: the visible part is fraction * length. The threshold tick
  is placed by converting the same fraction to an angle, which keeps the value
  and the decision point on one path and makes "how far past the line is it"
  readable at a glance.
*/
var ARC = { cx: 100, cy: 100, r: 80 };

function arcPoint(fraction, radius) {
  // The arc runs from 180 degrees (left) to 0 degrees (right).
  var angle = Math.PI * (1 - Math.max(0, Math.min(1, fraction)));
  return {
    x: ARC.cx + radius * Math.cos(angle),
    y: ARC.cy - radius * Math.sin(angle)
  };
}

function setGauge(fillId, trackId, fraction, fill, track) {
  var fillPath = document.getElementById(fillId);
  var trackPath = document.getElementById(trackId);
  var length = fillPath.getTotalLength();

  trackPath.style.setProperty('--track', track);
  fillPath.style.setProperty('--fill', fill);
  fillPath.style.strokeDasharray = length;
  // Start fully hidden so the sweep animates from zero on every prediction.
  fillPath.style.strokeDashoffset = length;
  // Force a reflow, otherwise the browser collapses both writes into one frame
  // and the transition never runs.
  void fillPath.getBoundingClientRect();
  fillPath.style.strokeDashoffset = length * (1 - Math.max(0, Math.min(1, fraction)));
}

function setGaugeTick(tickId, haloId, fraction) {
  var inner = arcPoint(fraction, ARC.r - 11);
  var outer = arcPoint(fraction, ARC.r + 11);
  [tickId, haloId].forEach(function (id) {
    var line = document.getElementById(id);
    line.setAttribute('x1', inner.x.toFixed(2));
    line.setAttribute('y1', inner.y.toFixed(2));
    line.setAttribute('x2', outer.x.toFixed(2));
    line.setAttribute('y2', outer.y.toFixed(2));
  });
}

/* Count the hero figure up to its value. Pure decoration, so it is skipped
   when the viewer asks for reduced motion. */
function countUp(node, value, format) {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { node.innerHTML = format(value); return; }

  var start = performance.now();
  var duration = 700;
  function frame(now) {
    var t = Math.min(1, (now - start) / duration);
    var eased = 1 - Math.pow(1 - t, 3);
    node.innerHTML = format(value * eased);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function placeMark(markId, labelId, fraction) {
  var pct = (Math.max(0, Math.min(1, fraction)) * 100).toFixed(1) + '%';
  document.getElementById(markId).style.left = pct;
  document.getElementById(labelId).style.left = pct;
}

function kvRow(list, label, value) {
  list.appendChild(el('dt', null, label));
  var dd = el('dd');
  if (value && value.flag) {
    dd.appendChild(el('span', 'flag', value.flag));
  } else {
    dd.textContent = value;
  }
  list.appendChild(dd);
}

function showError(resultId, message, isUserInput) {
  var card = document.getElementById(resultId);
  var box = card.querySelector('.result-error');
  box.innerHTML = '';
  box.appendChild(el('strong', null,
    isUserInput ? 'Check the form. ' : 'Could not get a prediction. '));
  box.appendChild(document.createTextNode(message));
  if (!isUserInput && !state.apiBase && !state.demo) {
    box.appendChild(document.createTextNode(' No backend address is set yet - '));
    var b = el('button', 'link-btn', 'set one now');
    b.type = 'button';
    b.addEventListener('click', openDialog);
    box.appendChild(b);
    box.appendChild(document.createTextNode(', or switch on demo mode to preview the interface.'));
  }
  card.dataset.state = 'error';
}

// ---------------------------------------------------------------- mushroom render

function renderMushroom(res) {
  var card = document.getElementById('result-mushroom');
  var p = Number(res.probability_poisonous);
  var threshold = Number(res.threshold);
  var poisonous = p >= threshold;

  var chip = document.getElementById('mushroom-verdict');
  chip.dataset.level = poisonous ? 'critical' : 'good';
  chip.querySelector('.verdict-ico').innerHTML = poisonous ? ICON_SKULL : ICON_CHECK;
  chip.querySelector('.verdict-text').textContent =
    poisonous ? 'Flagged as poisonous' : 'Not flagged';

  countUp(document.getElementById('mushroom-prob'), p * 100, function (v) {
    return v.toFixed(1) + '<small>%</small>';
  });

  // Severity follows the verdict exactly, so the colour can never contradict the
  // word next to it. Track is a lighter step of the same hue.
  var hue = poisonous ? 'var(--critical)' : 'var(--good)';
  setGauge('mushroom-arc-fill', 'mushroom-arc-track', p, hue,
    'color-mix(in oklab, ' + hue + ' 22%, var(--surface-2))');
  setGaugeTick('mushroom-tick', 'mushroom-tick-halo', threshold);
  document.getElementById('mushroom-threshold-note').textContent =
    'threshold ' + (threshold * 100).toFixed(1) + '%';

  var kv = document.getElementById('mushroom-derived');
  kv.innerHTML = '';
  kvRow(kv, 'Decision rule', 'poisonous when probability >= ' + (threshold * 100).toFixed(1) + '%');
  if (res.has_stem !== undefined && res.has_stem !== null) {
    kvRow(kv, 'has_stem (derived by the API)',
      { flag: res.has_stem === 1 ? 'has a stem' : 'stemless' });
  }

  // The API reports values it has not seen before rather than silently
  // accepting them; surfacing that is the difference between a demo and a tool.
  var notes = document.getElementById('mushroom-notes');
  notes.innerHTML = '';
  if (res.notes && res.notes.length) {
    var box = el('div', 'notes');
    box.appendChild(el('strong', null, 'Worth knowing about this input'));
    var list = el('ul');
    res.notes.forEach(function (note) { list.appendChild(el('li', null, note)); });
    box.appendChild(list);
    notes.appendChild(box);
  }

  document.getElementById('mushroom-provenance').textContent = res.demo
    ? 'Demo placeholder, not a model prediction.'
    : 'Model: ' + (res.model || 'unknown') +
      (res.notebook ? ' (' + res.notebook + ')' : '') +
      '. The threshold is the highest one that still caught 90% of the poisonous ' +
      'mushrooms in the validation set, so false alarms are expected and intended.';

  card.dataset.state = 'done';
}

// ---------------------------------------------------------------- citi bike render

function renderCitibike(res) {
  var card = document.getElementById('result-citibike');
  var trips = Number(res.trips);
  var level = Number(res.level_12m);
  var ratio = res.ratio !== undefined && res.ratio !== null
    ? Number(res.ratio)
    : (level ? trips / level : 0);

  countUp(document.getElementById('citibike-trips'), trips, function (v) {
    return Math.round(v).toLocaleString('en-US') + '<small>trips</small>';
  });

  // Magnitude against a baseline: sequential blue, scale 0 to 150%, marker at
  // the baseline so "busier than normal" needs no arithmetic.
  var SCALE_MAX = 1.5;
  setMeter('citibike-meter', ratio / SCALE_MAX, 'var(--seq-400)',
    'color-mix(in oklab, var(--seq-400) 20%, var(--surface-2))');
  placeMark('citibike-baseline-mark', 'citibike-baseline-label', 1 / SCALE_MAX);

  var pctOfNormal = (ratio * 100).toFixed(0);
  document.getElementById('citibike-baseline-label').textContent = 'normal day';

  var kv = document.getElementById('citibike-derived');
  kv.innerHTML = '';
  kvRow(kv, 'Compared with a normal day', pctOfNormal + '% of the twelve-month average');
  if (level) kvRow(kv, 'Twelve-month baseline', Math.round(level).toLocaleString('en-US') + ' trips per day');

  var cal = res.calendar || {};
  if (cal.weekday !== undefined && cal.weekday !== null) {
    kvRow(kv, 'Weekday (derived)', WEEKDAYS[cal.weekday] || String(cal.weekday));
  }
  if (cal.month !== undefined && cal.month !== null) {
    kvRow(kv, 'Month (derived)', MONTHS[cal.month - 1] || String(cal.month));
  }
  if (cal.day_of_year !== undefined && cal.day_of_year !== null) {
    kvRow(kv, 'Day of year (derived)', String(cal.day_of_year));
  }
  if (cal.holiday) kvRow(kv, 'Calendar flag', { flag: 'US federal holiday' });
  if (cal.christmas_week) kvRow(kv, 'Calendar flag', { flag: 'Christmas week' });

  document.getElementById('citibike-provenance').textContent = res.demo
    ? 'Demo placeholder, not a model prediction.'
    : 'Model: ' + (res.model || 'unknown') +
      '. Predicted as a ratio against the twelve-month level, then converted to ' +
      'trips. Validation error was about 9.6% on average; the model ran high on ' +
      'recent months, so treat single days as indicative.';

  card.dataset.state = 'done';
}

// ---------------------------------------------------------------- submit wiring

function wireForm(formId, resultId, path, demoFn, renderFn) {
  var form = document.getElementById(formId);
  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var payload;
    try {
      payload = collect(form);
    } catch (err) {
      showError(resultId, err.message, err.userInput);
      return;
    }

    var button = form.querySelector('button[type="submit"]');
    var original = button.textContent;

    if (state.demo) {
      renderFn(demoFn(payload));
      return;
    }

    button.disabled = true;
    button.textContent = 'Working';
    postJson(path, payload)
      .then(renderFn)
      .catch(function (err) { showError(resultId, err.message); })
      .then(function () {
        button.disabled = false;
        button.textContent = original;
      });
  });
}

// ---------------------------------------------------------------- tabs, theme, dialog

function wireTabs() {
  var tabs = [
    { tab: 'tab-mushroom', panel: 'panel-mushroom', name: 'mushroom' },
    { tab: 'tab-citibike', panel: 'panel-citibike', name: 'citibike' }
  ];
  tabs.forEach(function (entry) {
    document.getElementById(entry.tab).addEventListener('click', function () {
      tabs.forEach(function (other) {
        var selected = other === entry;
        document.getElementById(other.tab).setAttribute('aria-selected', String(selected));
        document.getElementById(other.panel).hidden = !selected;
      });
      // Drives the accent colour and the background wash (see styles.css).
      document.body.dataset.panel = entry.name;
    });
  });
}

/*
  Fill the weather fields from the station the model was trained on.

  This is the same NOAA series 02_data_preparation used, so the numbers are on
  the same scale as the training data. It is observed weather with a few days of
  publication lag, so recent and future dates will not be found - the API says so
  and the fields stay as they were.
*/
function wireWeather() {
  var button = document.getElementById('fetch-weather');
  if (!button) return;

  button.addEventListener('click', function () {
    var form = document.getElementById('form-citibike');
    var date = form.elements['date'].value;
    if (!date) {
      showError('result-citibike', 'Pick a date first.', true);
      return;
    }
    if (state.demo) {
      showError('result-citibike',
        'Real weather needs the backend. Turn off demo mode first.', true);
      return;
    }

    var original = button.textContent;
    button.disabled = true;
    button.textContent = 'Fetching';

    fetch(apiUrl('/api/weather?date=' + encodeURIComponent(date)))
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.detail || ('HTTP ' + res.status));
          return body;
        });
      })
      .then(function (weather) {
        ['tmax_c', 'tmin_c', 'precipitation_mm', 'snowfall_mm', 'snow_depth_mm', 'wind_ms']
          .forEach(function (name) {
            var field = form.elements[name];
            if (field) field.value = weather[name] === null ? '' : String(weather[name]);
          });
      })
      .catch(function (err) { showError('result-citibike', err.message, true); })
      .then(function () {
        button.disabled = false;
        button.textContent = original;
      });
  });
}

function wireTheme() {
  var stored = readStore(STORE_THEME, 'auto');
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.setAttribute('data-theme', stored);
  }
  document.getElementById('theme-toggle').addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme');
    var isDark = current === 'dark' ||
      (current !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    writeStore(STORE_THEME, next);
  });
}

function openDialog() {
  document.getElementById('api-base').value = state.apiBase;
  document.getElementById('demo-mode').checked = state.demo;
  document.getElementById('api-dialog').showModal();
}

function wireDialog() {
  var dialog = document.getElementById('api-dialog');
  document.getElementById('api-status').addEventListener('click', openDialog);
  document.getElementById('api-cancel').addEventListener('click', function () { dialog.close(); });

  document.getElementById('api-form').addEventListener('submit', function () {
    state.apiBase = document.getElementById('api-base').value.trim();
    state.demo = document.getElementById('demo-mode').checked;
    writeStore(STORE_BASE, state.apiBase);
    writeStore(STORE_DEMO, state.demo ? '1' : '0');
    applyDemoBanner();
    checkHealth();
  });

  document.getElementById('demo-off').addEventListener('click', function () {
    state.demo = false;
    writeStore(STORE_DEMO, '0');
    applyDemoBanner();
    checkHealth();
  });
}

function applyDemoBanner() {
  document.getElementById('demo-banner').hidden = !state.demo;
}

function wireExamples() {
  Array.prototype.forEach.call(document.querySelectorAll('[data-example]'), function (button) {
    button.addEventListener('click', function () {
      var which = button.dataset.example;
      fill(document.getElementById('form-' + which), EXAMPLES[which]);
    });
  });
}

// ---------------------------------------------------------------- start

buildForms();
wireTabs();
wireTheme();
wireDialog();
wireExamples();
wireWeather();
applyDemoBanner();

wireForm('form-mushroom', 'result-mushroom', '/api/mushroom', demoMushroom, renderMushroom);
wireForm('form-citibike', 'result-citibike', '/api/citibike', demoCitibike, renderCitibike);

document.getElementById('footer-models').textContent =
  'Deployed models: mushroom gradient boosting (threshold 0.139) and Citi Bike ' +
  'gradient boosting. Both are served by the API, not by this page.';

checkHealth();
