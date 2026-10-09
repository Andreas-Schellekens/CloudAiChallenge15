/*
  The Citi Bike scene: a little island of New York with a riding loop.

  The weather you enter is drawn literally: temperature colours the sky and the
  sunlight, rain and snow fall at a rate that follows the millimetres, snow on
  the ground whitens the grass, wind bends the trees and slants the rain.

  The number of riders is NOT computed here. Before a forecast the loop holds
  the riders of a normal day; after a forecast it holds that many times the
  model's ratio (trips divided by the twelve-month level), straight from the
  API response. So the loop is the same quantity as the "x% of a normal day"
  meter in the result card, drawn as people on bikes.
*/

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { approach, tween, ease, seeded, reducedMotion } from './motion.js';

const NORMAL_RIDERS = 24;     // riders on screen for a ratio of 1.0
const MAX_RIDERS = 72;
const LANES = [3.82, 4.18];   // inner lane rides clockwise, outer anticlockwise
const SCAN = '#6878ff';

/* ------------------------------------------------------------ weather colours */

const TEMPS = [-10, 0, 12, 22, 32];
const SKY_TOP = ['#a7bdd6', '#b4cde6', '#8ecbff', '#7fc6ff', '#ffb46e'];
const SKY_BOTTOM = ['#e9eef4', '#edf3f9', '#eaf6ff', '#fff5dc', '#ffe6c0'];
const SUN = ['#d8e4ff', '#e8efff', '#fff6e6', '#fff0d2', '#ffd49a'];

function byTemperature(stops, temp) {
  const t = Math.min(Math.max(temp, TEMPS[0]), TEMPS[TEMPS.length - 1]);
  let i = 0;
  while (i < TEMPS.length - 2 && t > TEMPS[i + 1]) i++;
  const k = (t - TEMPS[i]) / (TEMPS[i + 1] - TEMPS[i]);
  return new THREE.Color(stops[i]).lerp(new THREE.Color(stops[i + 1]), k);
}

const hex = (c) => '#' + c.getHexString();

/* ================================================================== scene */

export class BikeScene {
  constructor() {
    this.group = new THREE.Group();
    this.cameraPose = { position: [10.6, 8.3, 12.6], target: [0, 0.35, 0] };
    this.dark = false;
    this.weather = { tmax_c: 20, precipitation_mm: 0, snowfall_mm: 0, snow_depth_mm: 0, wind_ms: null };

    this._lights();
    this._island();
    this._city();
    this._trees();
    this._riders();
    this._precipitation();
    this._effects();

    this.target = NORMAL_RIDERS;
    this.update(this.weather);
  }

  /* -------------------------------------------------------- building */

  _lights() {
    this.hemi = new THREE.HemisphereLight('#e6f1ff', '#55703a', 1.35);
    this.sun = new THREE.DirectionalLight('#fff6e6', 2.8);
    this.sun.position.set(6, 10, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -8;
    c.right = c.top = 8;
    c.near = 1;
    c.far = 30;
    this.sun.shadow.bias = -0.0008;
    this.group.add(this.hemi, this.sun);
  }

  _island() {
    this.grass = new THREE.Color('#5f8f45');
    this.snow = new THREE.Color('#f3f6fa');
    this.groundMat = new THREE.MeshStandardMaterial({ color: this.grass, roughness: 1 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(6.1, 6.25, 0.4, 96), this.groundMat);
    top.position.y = -0.2;
    top.receiveShadow = true;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(6.25, 5.4, 0.9, 96),
      new THREE.MeshStandardMaterial({ color: '#4c4f57', roughness: 1 }),
    );
    base.position.y = -0.85;
    this.group.add(top, base);

    // The riding loop.
    const road = new THREE.Mesh(
      new THREE.RingGeometry(3.55, 4.45, 128),
      new THREE.MeshStandardMaterial({ color: '#3a3e45', roughness: 0.95 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.006;
    road.receiveShadow = true;
    this.group.add(road);

    const dash = new THREE.BoxGeometry(0.22, 0.01, 0.035);
    const dashes = new THREE.InstancedMesh(dash, new THREE.MeshBasicMaterial({ color: '#e9e3c8' }), 40);
    const d = new THREE.Object3D();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      d.position.set(Math.cos(a) * 4, 0.012, Math.sin(a) * 4);
      d.rotation.set(0, -a + Math.PI / 2, 0);
      d.updateMatrix();
      dashes.setMatrixAt(i, d.matrix);
    }
    this.group.add(dashes);

    // A pond in the park.
    const pond = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 0.04, 48),
      new THREE.MeshStandardMaterial({ color: '#5aa6d4', roughness: 0.15, metalness: 0.1 }),
    );
    pond.position.y = 0.0;
    this.group.add(pond);
  }

  _city() {
    const random = seeded(2013);   // the year Citi Bike started
    const n = 22;
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.buildings = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.85 }), n);
    this.buildings.castShadow = true;
    this.buildings.receiveShadow = true;

    // Windows face the park: a grid of glass panes that reflects the sky by day
    // and lights up at night. The same texture drives both, so the lit panes
    // are exactly the glass ones.
    const grid = document.createElement('canvas');
    grid.width = 64;
    grid.height = 128;
    const g = grid.getContext('2d');
    g.fillStyle = '#4a5260';
    g.fillRect(0, 0, 64, 128);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 3; col++) {
        g.fillStyle = (row * 3 + col) % 5 === 2 ? '#8ea3b8' : '#d3e2f1';
        g.fillRect(5 + col * 20, 5 + row * 15.5, 15, 10);
      }
    }
    const gridTex = new THREE.CanvasTexture(grid);
    gridTex.colorSpace = THREE.SRGBColorSpace;
    this.windowMat = new THREE.MeshStandardMaterial({
      map: gridTex, emissiveMap: gridTex, emissive: '#ffcf7a', emissiveIntensity: 0,
      roughness: 0.25, metalness: 0.1,
    });
    this.windows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.windowMat, n);

    const d = new THREE.Object3D();
    const c = new THREE.Color();
    const greys = ['#c9ced5', '#b0b7c0', '#9ba4ae', '#d7d2c7', '#b9ab9b', '#8f97a1'];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + random() * 0.08;
      const r = 5.25 + random() * 0.35;
      const h = 0.6 + Math.pow(random(), 1.6) * 2.4;
      const w = 0.5 + random() * 0.35;
      const depth = 0.5 + random() * 0.25;
      d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      d.rotation.set(0, -a, 0);
      d.scale.set(depth, h, w);
      d.updateMatrix();
      this.buildings.setMatrixAt(i, d.matrix);
      this.buildings.setColorAt(i, c.set(greys[Math.floor(random() * greys.length)]));

      const ir = r - depth / 2 - 0.012;
      d.position.set(Math.cos(a) * ir, h * 0.5, Math.sin(a) * ir);
      d.scale.set(0.02, h * 0.62, w * 0.7);
      d.updateMatrix();
      this.windows.setMatrixAt(i, d.matrix);
    }
    this.group.add(this.buildings, this.windows);
  }

  _trees() {
    const random = seeded(42);
    const n = 11;
    const trunk = new THREE.CylinderGeometry(0.07, 0.09, 0.5, 7); trunk.translate(0, 0.25, 0);
    const crown = new THREE.IcosahedronGeometry(0.42, 1); crown.translate(0, 0.42, 0);
    this.trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 1 }), n);
    this.crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), n);
    this.trunks.castShadow = this.crowns.castShadow = true;
    this.treeSpots = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + random() * 0.4;
      const r = 1.6 + random() * 1.3;
      this.treeSpots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.8 + random() * 0.6, ph: random() * 6 });
      this.crowns.setColorAt(i, c.set(['#3f7a3b', '#4f8a43', '#356b33'][i % 3]));
    }
    this.group.add(this.trunks, this.crowns);
    this._placeTrees(0);
  }

  _placeTrees(t) {
    const d = new THREE.Object3D();
    const sway = (this.weather.wind_ms ?? 0) * 0.018;
    this.treeSpots.forEach((p, i) => {
      d.position.set(p.x, 0, p.z);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(p.s);
      d.updateMatrix();
      this.trunks.setMatrixAt(i, d.matrix);
      d.position.y = 0.4 * p.s;
      d.rotation.set(Math.sin(t * 1.7 + p.ph) * sway * 0.5, 0, sway + Math.sin(t * 2.1 + p.ph) * sway * 0.6);
      d.updateMatrix();
      this.crowns.setMatrixAt(i, d.matrix);
    });
    this.trunks.instanceMatrix.needsUpdate = true;
    this.crowns.instanceMatrix.needsUpdate = true;
  }

  _riders() {
    // A Citi Bike (with its front basket) and a rider, as two merged meshes,
    // instanced: 72 riders cost two draw calls.
    const part = (geo, x, y, z, rz = 0) => { geo.rotateZ(rz); geo.translate(x, y, z); return geo; };
    const bike = mergeGeometries([
      part(new THREE.TorusGeometry(0.11, 0.022, 6, 14), 0.17, 0.13, 0),
      part(new THREE.TorusGeometry(0.11, 0.022, 6, 14), -0.17, 0.13, 0),
      part(new THREE.BoxGeometry(0.36, 0.03, 0.03), 0, 0.2, 0),
      part(new THREE.BoxGeometry(0.03, 0.15, 0.03), -0.06, 0.27, 0),
      part(new THREE.BoxGeometry(0.03, 0.15, 0.03), 0.13, 0.27, 0),
      part(new THREE.BoxGeometry(0.03, 0.03, 0.17), 0.13, 0.345, 0),
      part(new THREE.BoxGeometry(0.09, 0.06, 0.12), 0.21, 0.3, 0),
    ]);
    const rider = mergeGeometries([
      part(new THREE.CylinderGeometry(0.045, 0.06, 0.2, 8), -0.02, 0.44, 0, -0.35),
      part(new THREE.SphereGeometry(0.055, 10, 8), 0.04, 0.585, 0),
      part(new THREE.BoxGeometry(0.035, 0.17, 0.035), 0.0, 0.29, 0.03),
      part(new THREE.BoxGeometry(0.035, 0.17, 0.035), 0.0, 0.29, -0.03),
    ]);

    // Citi Bike blue is the real colour of the bikes; the riders wear anything.
    this.bikes = new THREE.InstancedMesh(bike, new THREE.MeshStandardMaterial({ color: '#1d63c9', roughness: 0.45 }), MAX_RIDERS);
    this.people = new THREE.InstancedMesh(rider, new THREE.MeshStandardMaterial({ roughness: 0.7 }), MAX_RIDERS);
    this.bikes.castShadow = this.people.castShadow = true;

    const random = seeded(7);
    const jackets = ['#e2553d', '#f2b134', '#2d9d78', '#f4f1e8', '#3b3f8f', '#d96aa1', '#262a31', '#7fb3e0'];
    const c = new THREE.Color();
    this.riders = [];
    for (let i = 0; i < MAX_RIDERS; i++) {
      const lane = i % 2;
      const dir = lane === 0 ? -1 : 1;
      const r = LANES[lane] + (random() - 0.5) * 0.08;
      this.riders.push({
        r, dir,
        angle: (i * 2.399963) % (Math.PI * 2),          // golden angle: spread evenly
        speed: (1.05 + random() * 0.45) / r,             // radians per second
        vis: i < NORMAL_RIDERS ? 1 : 0,
        bob: random() * 6,
      });
      this.people.setColorAt(i, c.set(jackets[Math.floor(random() * jackets.length)]));
    }
    this.group.add(this.bikes, this.people);
  }

  _precipitation() {
    const rainMax = 600;
    this.rain = { max: rainMax, count: 0, pos: new Float32Array(rainMax * 6) };
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rain.pos, 3));
    rainGeo.setDrawRange(0, 0);
    this.rainLines = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({
      color: '#a9c3e3', transparent: true, opacity: 0.6,
    }));
    for (let i = 0; i < rainMax; i++) this._dropRain(i, true);

    const snowMax = 460;
    this.snowfall = { max: snowMax, count: 0, pos: new Float32Array(snowMax * 3), ph: Float32Array.from({ length: snowMax }, () => Math.random() * 6) };
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(this.snowfall.pos, 3));
    snowGeo.setDrawRange(0, 0);
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const g = dot.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    this.snowPoints = new THREE.Points(snowGeo, new THREE.PointsMaterial({
      size: 0.09, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false, color: '#ffffff',
    }));
    for (let i = 0; i < snowMax; i++) this._dropSnow(i, true);
    this.group.add(this.rainLines, this.snowPoints);
  }

  _dropRain(i, anywhere) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = anywhere ? Math.random() * 7 : 7;
    const p = this.rain.pos;
    p.set([x, y, z, x, y - 0.28, z], i * 6);
  }

  _dropSnow(i, anywhere) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 6;
    this.snowfall.pos.set([Math.cos(a) * r, anywhere ? Math.random() * 7 : 7, Math.sin(a) * r], i * 3);
  }

  _effects() {
    // While the API answers, a light runs around the loop.
    const arc = new THREE.TorusGeometry(4, 0.06, 8, 48, Math.PI / 3);
    arc.rotateX(Math.PI / 2);
    this.scanMat = new THREE.MeshBasicMaterial({ color: SCAN, transparent: true, opacity: 0.9, toneMapped: false });
    this.scanArc = new THREE.Mesh(arc, this.scanMat);
    this.scanArc.position.y = 0.05;
    this.scanArc.visible = false;

    // When it lands, the whole loop flashes once.
    const ring = new THREE.TorusGeometry(4, 0.05, 8, 128);
    ring.rotateX(Math.PI / 2);
    this.pulseMat = new THREE.MeshBasicMaterial({ color: SCAN, transparent: true, opacity: 0, toneMapped: false });
    this.pulse = new THREE.Mesh(ring, this.pulseMat);
    this.pulse.position.y = 0.05;
    this.pulse.visible = false;
    this.group.add(this.scanArc, this.pulse);
    this.scanning = false;
  }

  /* -------------------------------------------------------- input -> scene */

  update(weather) {
    this.weather = { ...this.weather, ...weather };
    const w = this.weather;
    const temp = w.tmax_c ?? 15;
    this.gloom = Math.min(1, Math.max((w.precipitation_mm ?? 0) / 12, (w.snowfall_mm ?? 0) / 40));

    this.rain.count = reducedMotion ? 0
      : Math.round(this.rain.max * Math.min(1, Math.sqrt((w.precipitation_mm ?? 0) / 30)));
    this.snowfall.count = reducedMotion ? 0
      : Math.round(this.snowfall.max * Math.min(1, Math.sqrt((w.snowfall_mm ?? 0) / 150)));
    this.rainLines.geometry.setDrawRange(0, this.rain.count * 2);
    this.snowPoints.geometry.setDrawRange(0, this.snowfall.count);

    this.snowCover = Math.min(1, Math.sqrt((w.snow_depth_mm ?? 0) / 200));
    this.groundTarget = this.grass.clone().lerp(this.snow, this.snowCover);

    this.sunTarget = byTemperature(SUN, temp).lerp(new THREE.Color('#c8ced6'), this.gloom * 0.6);
    this.sunITarget = 2.9 * (1 - 0.55 * this.gloom);
    this.hemiITarget = 1.35;
    if (this.dark) {
      this.sunTarget.lerp(new THREE.Color('#8fa6ff'), 0.55);
      this.sunITarget *= 0.42;
      this.hemiITarget *= 0.5;
    }
  }

  setDark(dark) {
    this.dark = dark;
    this.windowMat.emissiveIntensity = dark ? 1.4 : 0;
    this.update({});
  }

  skyColors(dark) {
    const temp = this.weather.tmax_c ?? 15;
    const gloom = this.gloom ?? 0;
    let top = byTemperature(SKY_TOP, temp);
    let bottom = byTemperature(SKY_BOTTOM, temp);
    top.lerp(new THREE.Color('#8d97a3'), gloom * 0.75);
    bottom.lerp(new THREE.Color('#c4cad1'), gloom * 0.75);
    if (dark) {
      const warmth = Math.min(1, Math.max(0, (temp - 15) / 20));
      top = new THREE.Color('#0b1326').lerp(new THREE.Color('#25182f'), warmth).lerp(new THREE.Color('#151a22'), gloom);
      bottom = new THREE.Color('#1b2a44').lerp(new THREE.Color('#3a2638'), warmth).lerp(new THREE.Color('#232a35'), gloom);
    }
    return [hex(top), hex(bottom)];
  }

  /* -------------------------------------------------------- forecast */

  startScan() {
    this.scanning = true;
    this.scanArc.visible = true;
    this.scanMat.opacity = 0.9;
  }

  /* `ratio` is trips / twelve-month level from the API, or null on failure. */
  stopScan(ratio) {
    this.scanning = false;
    this.scanArc.visible = false;
    if (ratio == null) return;
    this.target = Math.max(2, Math.min(MAX_RIDERS, Math.round(NORMAL_RIDERS * ratio)));

    this.pulse.visible = true;
    this.pulse.scale.setScalar(1);
    tween(900, (p) => {
      this.pulse.scale.setScalar(1 + p * 0.5);
      this.pulseMat.opacity = 0.85 * (1 - p);
    }, { easing: ease.outCubic, onDone: () => { this.pulse.visible = false; } });
  }

  reset() {
    this.target = NORMAL_RIDERS;
  }

  /* -------------------------------------------------------- every frame */

  tick(dt, t) {
    const k = reducedMotion ? 1 : 1 - Math.exp(-3.5 * dt);
    this.groundMat.color.lerp(this.groundTarget, k);
    this.sun.color.lerp(this.sunTarget, k);
    this.sun.intensity += (this.sunITarget - this.sun.intensity) * k;
    this.hemi.intensity += (this.hemiITarget - this.hemi.intensity) * k;

    this._placeTrees(reducedMotion ? 0 : t);

    // Riders: move along the loop; new riders drop in, leaving riders shrink away.
    const d = new THREE.Object3D();
    let last = 0;
    this.riders.forEach((r, i) => {
      r.vis = approach(r.vis, i < this.target ? 1 : 0, dt, 6);
      if (!reducedMotion) r.angle += r.speed * r.dir * dt;
      const s = r.vis < 0.01 ? 0.0001 : r.vis;
      if (r.vis > 0.01) last = i + 1;
      const x = Math.cos(r.angle) * r.r;
      const z = Math.sin(r.angle) * r.r;
      const vx = -Math.sin(r.angle) * r.dir;
      const vz = Math.cos(r.angle) * r.dir;
      const drop = (1 - r.vis) * 1.6;
      const bob = reducedMotion ? 0 : Math.abs(Math.sin(t * 6 + r.bob)) * 0.012;
      d.position.set(x, drop + bob, z);
      d.rotation.set(0, Math.atan2(-vz, vx), 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      this.bikes.setMatrixAt(i, d.matrix);
      this.people.setMatrixAt(i, d.matrix);
    });
    this.bikes.count = this.people.count = Math.max(last, 1);
    this.bikes.instanceMatrix.needsUpdate = true;
    this.people.instanceMatrix.needsUpdate = true;

    // Rain and snow, pushed sideways by the wind.
    const wind = this.weather.wind_ms ?? 0;
    const rp = this.rain.pos;
    for (let i = 0; i < this.rain.count; i++) {
      const o = i * 6;
      const dy = 9 * dt;
      const dx = wind * 0.22 * dt;
      rp[o] += dx; rp[o + 1] -= dy;
      rp[o + 3] = rp[o] - wind * 0.012; rp[o + 4] = rp[o + 1] - 0.28;
      if (rp[o + 1] < 0) this._dropRain(i, false);
    }
    if (this.rain.count) this.rainLines.geometry.attributes.position.needsUpdate = true;

    const sp = this.snowfall.pos;
    for (let i = 0; i < this.snowfall.count; i++) {
      const o = i * 3;
      sp[o + 1] -= 0.7 * dt;
      sp[o] += (Math.sin(t + this.snowfall.ph[i]) * 0.25 + wind * 0.08) * dt;
      sp[o + 2] += Math.cos(t * 0.8 + this.snowfall.ph[i]) * 0.2 * dt;
      if (sp[o + 1] < 0) this._dropSnow(i, false);
    }
    if (this.snowfall.count) this.snowPoints.geometry.attributes.position.needsUpdate = true;

    if (this.scanning) this.scanArc.rotation.y = -t * 3.2;
  }
}
