/*
  Citi Bike: the "Next 30 days" view.

  It shows GET /api/citibike/period: the expected trips for every day of a
  period under normal weather, read from the forecast table of
  05d_model_timeseries.ipynb. As everywhere on this page, nothing is computed
  here: the totals, the busiest day and the error figures all come from the API,
  so the page cannot disagree with the model.

  The chart is a hand-written SVG, because one line, one band and a few markers
  do not need a chart library:
    - the line is the expected number of trips;
    - the light band is the 10th to 90th percentile over the weather of eleven
      past years. It shows how much weather alone moves a day, and it is NOT a
      prediction interval (the API and the caption say so);
    - weekends are shaded and federal holidays marked, because those are the
      calendar effects that explain most of the dips.
  Hover, touch or the arrow keys show one day; the same numbers are in a table.
*/

const SVG = 'http://www.w3.org/2000/svg';
const DAYS = 30;

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const asDate = (iso) => new Date(`${iso}T12:00:00`);   // midday: no time-zone slip
const shortDate = (iso) => asDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const longDate = (iso) => asDate(iso).toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
});
const addDays = (iso, n) => {
  const d = asDate(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/* A round gridline step (1, 1.5, 2, 2.5, 3, 4, 5, 6 or 7.5 times a power of ten) so that four
   steps cover the data: the axis then reads 0, 50k, 100k, ... */
function niceStep(value) {
  const raw = value / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10]) if (m * power >= raw) return m * power;
  return 10 * power;
}

/* ================================================================ chart */

function drawChart(container, res) {
  const days = res.days;
  const width = Math.max(280, container.clientWidth);
  const height = 220;
  const pad = { top: 12, right: 10, bottom: 26, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // The y axis starts at zero: the bars of a normal day and a holiday should
  // look as different as they are, not exaggerated by a cut axis.
  const tick = niceStep(Math.max(...days.map((d) => Math.max(d.high_trips, d.predicted_trips))) * 1.05);
  const top = tick * 4;
  const step = plotW / days.length;                      // one slot per day
  const x = (i) => pad.left + step * (i + 0.5);          // centre of slot i
  const y = (v) => pad.top + plotH * (1 - v / top);

  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`, width, height, role: 'img',
    'aria-label': `Expected Citi Bike trips per day from ${res.start} to ${res.end}. `
      + 'The same numbers are in the table below.',
  });

  // Weekends: a shaded slot behind everything else.
  days.forEach((d, i) => {
    if (d.weekend) {
      root.append(svg('rect', {
        class: 'pc-weekend', x: pad.left + step * i, y: pad.top, width: step, height: plotH,
      }));
    }
  });

  // Gridlines and y labels at quarters of the axis, in thousands.
  for (let k = 0; k <= 4; k++) {
    const v = tick * k;
    root.append(svg('line', { class: 'pc-grid', x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v) }));
    const label = svg('text', { class: 'pc-axis', x: pad.left - 6, y: y(v) + 4, 'text-anchor': 'end' });
    label.textContent = v === 0 ? '0' : `${+(v / 1000).toFixed(1)}k`;
    root.append(label);
  }

  // x labels: the first day and then once a week, so they never collide.
  days.forEach((d, i) => {
    if (i % 7 !== 0) return;
    const label = svg('text', { class: 'pc-axis', x: x(i), y: height - 8, 'text-anchor': i === 0 ? 'start' : 'middle' });
    if (i === 0) label.setAttribute('x', pad.left);
    label.textContent = shortDate(d.date);
    root.append(label);
  });

  // Federal holidays: a dashed line through the plot and a small diamond on top.
  days.forEach((d, i) => {
    if (!d.holiday) return;
    root.append(svg('line', { class: 'pc-holiday', x1: x(i), x2: x(i), y1: pad.top, y2: pad.top + plotH }));
    const s = 4;
    root.append(svg('path', {
      class: 'pc-holiday-mark',
      d: `M${x(i)} ${pad.top - s} l${s} ${s} l${-s} ${s} l${-s} ${-s} z`,
    }));
  });

  // The weather band (low to high), then the expected line on top of it.
  const upper = days.map((d, i) => `${x(i)},${y(d.high_trips)}`);
  const lower = days.map((d, i) => `${x(i)},${y(d.low_trips)}`).reverse();
  root.append(svg('polygon', { class: 'pc-band', points: [...upper, ...lower].join(' ') }));
  root.append(svg('path', {
    class: 'pc-line',
    d: days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.predicted_trips).toFixed(1)}`).join(' '),
  }));

  // Hover layer: a crosshair and a dot, moved to the nearest day.
  const cross = svg('line', { class: 'pc-cross', y1: pad.top, y2: pad.top + plotH, visibility: 'hidden' });
  const dot = svg('circle', { class: 'pc-dot', r: 4.5, visibility: 'hidden' });
  root.append(cross, dot);

  const tip = document.createElement('div');
  tip.className = 'pc-tip';
  tip.hidden = true;

  container.replaceChildren(root, tip);

  // Keyboard: the chart is focusable and the arrow keys walk through the days.
  root.setAttribute('tabindex', '0');
  let active = -1;

  function show(i) {
    active = Math.max(0, Math.min(days.length - 1, i));
    const d = days[active];
    cross.setAttribute('x1', x(active)); cross.setAttribute('x2', x(active));
    dot.setAttribute('cx', x(active)); dot.setAttribute('cy', y(d.predicted_trips));
    cross.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');

    const flags = [d.weekend && 'Weekend', d.holiday && 'Federal holiday', d.christmas_week && 'Christmas week']
      .filter(Boolean).join(', ');
    tip.replaceChildren();
    const line = (cls, text) => { const p = document.createElement('p'); p.className = cls; p.textContent = text; tip.append(p); };
    line('pc-tip-date', longDate(d.date));
    line('pc-tip-value', `${fmt(d.predicted_trips)} trips expected`);
    line('pc-tip-muted', `Weather spread ${fmt(d.low_trips)} to ${fmt(d.high_trips)}`);
    line('pc-tip-muted', `Typical weather ${Math.round(d.tmax_c)} / ${Math.round(d.tmin_c)} °C, `
      + `${d.precipitation_mm.toFixed(1)} mm rain${d.snow_depth_mm >= 1 ? `, ${Math.round(d.snow_depth_mm)} mm snow on the ground` : ''}`);
    if (flags) line('pc-tip-flag', flags);
    tip.hidden = false;

    // Keep the tooltip inside the chart: flip it to the left on the right half.
    const px = (x(active) / width) * container.clientWidth;
    const left = px > container.clientWidth / 2;
    tip.style.left = left ? '' : `${px + 12}px`;
    tip.style.right = left ? `${container.clientWidth - px + 12}px` : '';
  }
  function hide() {
    active = -1;
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  }
  const indexAt = (event) => {
    const box = root.getBoundingClientRect();
    const sx = ((event.clientX - box.left) / box.width) * width;
    return Math.floor((sx - pad.left) / step);
  };

  root.addEventListener('pointermove', (e) => show(indexAt(e)));
  root.addEventListener('pointerdown', (e) => show(indexAt(e)));
  root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  root.addEventListener('blur', hide);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { show(active < 0 ? 0 : active + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { show(active < 0 ? days.length - 1 : active - 1); e.preventDefault(); }
    else if (e.key === 'Escape') hide();
  });
}

/* ================================================================ table */

function fillTable(table, res) {
  const head = document.createElement('thead');
  head.innerHTML = '<tr><th scope="col">Day</th><th scope="col">Expected</th>'
    + '<th scope="col">Weather spread</th><th scope="col">Note</th></tr>';
  const body = document.createElement('tbody');
  for (const d of res.days) {
    const row = document.createElement('tr');
    const note = [d.holiday && 'holiday', d.christmas_week && 'Christmas week', d.weekend && 'weekend']
      .filter(Boolean).join(', ');
    for (const text of [longDate(d.date), fmt(d.predicted_trips), `${fmt(d.low_trips)} to ${fmt(d.high_trips)}`, note]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    body.append(row);
  }
  table.replaceChildren(head, body);
}

/* ================================================================ view */

export function initPeriod({ getJson, isDemo, onWaking, onOnline }) {
  const view = $('citibike-period');
  const dayView = $('citibike-day');
  const input = $('period-start');
  const status = $('period-status');
  const result = $('period-result');
  const chart = $('period-chart');
  let last = null;        // the last response, redrawn when the panel resizes
  let request = 0;        // only the newest request may update the view
  let loaded = false;

  function setStatus(text, kind = '') {
    status.textContent = text;
    status.dataset.kind = kind;
  }

  function render(res) {
    last = res;
    $('period-total').textContent = fmt(res.total_trips);
    $('period-mean').textContent = fmt(res.mean_trips_per_day);
    for (const [id, day] of [['period-busiest', res.busiest_day], ['period-quietest', res.quietest_day]]) {
      const small = document.createElement('small');
      small.textContent = longDate(day.date);
      $(id).replaceChildren(fmt(day.trips), small);
    }

    const x = Math.round(res.typical_daily_error_pct);
    const y = Math.round(res.period_total_error_pct);
    $('period-caption').textContent = 'Expected demand under normal weather for each date (no weather '
      + `forecast). A single day is typically within about ${x}% (30-day total within about ${y}%), `
      + 'measured on 2024. Snowstorms cannot be foreseen: a blizzard day can bring a fraction of '
      + 'the number shown.';
    const note = $('period-note');
    note.hidden = !res.note;
    note.textContent = res.note || '';

    drawChart(chart, res);
    fillTable($('period-table'), res);
    result.hidden = false;
  }

  async function load(start) {
    if (isDemo()) {
      result.hidden = true;
      setStatus('The 30-day forecast needs the backend: it is a table the model wrote, and demo mode '
        + 'has no placeholder for it. Turn off demo mode in the API settings to see it.', 'error');
      return;
    }
    const mine = ++request;
    setStatus('Loading the forecast.', 'loading');
    const query = new URLSearchParams({ days: String(DAYS) });
    if (start) query.set('start', start);
    try {
      const res = await getJson(`/api/citibike/period?${query}`, (n) => {
        if (mine !== request) return;
        setStatus(`The backend is waking up after a quiet spell. Retrying (${n} of 7).`, 'loading');
        if (n === 1) onWaking();
      });
      if (mine !== request) return;
      // The valid start dates come from the API, so the picker never offers a
      // period the table cannot fill.
      input.min = res.first_day_available;
      input.max = addDays(res.last_day_available, -(DAYS - 1));
      input.value = res.start;
      setStatus('');
      onOnline();
      render(res);
      loaded = true;
    } catch (error) {
      if (mine !== request) return;
      setStatus(`No forecast this time. ${error.message}`, 'error');
    }
  }

  // Switching views: the day form and its result card make way for the period.
  for (const radio of document.querySelectorAll('input[name="citibike-view"]')) {
    radio.addEventListener('change', () => {
      const period = radio.value === 'period' && radio.checked;
      view.hidden = !period;
      dayView.hidden = period;
      document.body.dataset.citibikeView = period ? 'period' : 'day';
      if (period && !loaded) load(null);
    });
  }

  input.addEventListener('change', () => { if (input.value) load(input.value); });

  // Redraw at the new width when the panel changes size (window resize, rotation).
  if ('ResizeObserver' in window) {
    let width = 0;
    new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (last && !result.hidden && w !== width) { width = w; drawChart(chart, last); }
    }).observe(chart);
  }
}
