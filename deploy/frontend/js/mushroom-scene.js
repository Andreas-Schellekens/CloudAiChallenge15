/*
  The mushroom scene: a small island with a mushroom built from the form.

  Visual language, which is also the point of the scene:
  - every field of the form changes something you can see;
  - a field you did NOT observe is drawn as a wireframe, because the model
    receives "missing" for it, and missing is a real input, not a blank;
  - "none" is drawn as absent: no ring, no gills, no stem.

  What is drawn is the input, literally. A stem height of 0 draws no stem; it
  does not compute has_stem. That feature is derived by the API alone, and the
  result card shows the API's value.

  Sizes use a log scale so a 57 cm cap and a 1 cm cap both fit on screen.
*/

import * as THREE from 'three';
import { approach, tween, ease, seeded, hashString, reducedMotion } from './motion.js';
import { MUSHROOM_COLOURS } from './palette.js';

const SEG = 56;              // segments around the cap
const PTS = 26;              // points along the cap profile
const GHOST = '#6269f5';     // Iris: wireframe colour for "not observed"
const VERDICT = { poisonous: '#e04848', edible: '#19b319' };

/* ------------------------------------------------------------ cap shapes */

/* Each cap shape is a profile from the centre of the top (t = 0) to the rim
   (t = 1), as [radius, height]. All shapes share the point count, so a shape
   change is a smooth morph between two vertex arrays. */
function profilePoint(shape, t) {
  const quarter = Math.PI / 2;
  switch (shape) {
    case 'bell': {
      const x = Math.sin(t * quarter);
      return [x * (0.78 + 0.22 * t ** 3), 0.95 * Math.pow(Math.cos(t * quarter), 0.75)];
    }
    case 'conical':   return [t, 1.05 * (1 - t)];
    case 'flat':      return [t, 0.16 * (1 - t ** 8)];
    case 'spherical': { const a = t * 1.95; return [Math.sin(a), 0.85 * (Math.cos(a) - Math.cos(1.95))]; }
    case 'sunken':    return [t, 0.3 * Math.pow(Math.sin(t * Math.PI), 0.85) + 0.05 * (1 - t)];
    default:          return [Math.sin(t * quarter), 0.55 * Math.cos(t * quarter)]; // convex, others, unknown
  }
}

function capPositions(shape) {
  const points = [];
  for (let j = 0; j < PTS; j++) {
    const [x, y] = profilePoint(shape, j / (PTS - 1));
    points.push(new THREE.Vector2(Math.max(x, 0.0001), y));
  }
  const geo = new THREE.LatheGeometry(points, SEG);
  const pos = geo.attributes.position.array.slice();
  geo.dispose();

  // "others" is an irregular cap: give the rim a wave.
  if (shape === 'others') {
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      const r = Math.hypot(x, z);
      const a = Math.atan2(z, x);
      const k = 1 + 0.09 * Math.sin(5 * a) * r;
      pos[i] = x * k;
      pos[i + 2] = z * k;
      pos[i + 1] = y + 0.07 * Math.sin(3 * a + 1) * r;
    }
  }
  return pos;
}

const CAP_TARGETS = {};
for (const s of ['bell', 'conical', 'convex', 'flat', 'others', 'spherical', 'sunken']) {
  CAP_TARGETS[s] = capPositions(s);
}
const rimOf = (shape) => profilePoint(shape, 1)[0];
const topOf = (shape) => Math.max(...Array.from({ length: PTS }, (_, j) => profilePoint(shape, j / (PTS - 1))[1]));

/* ------------------------------------------------------------ textures */

function canvasTexture(size, draw, { repeat = [1, 1], colour = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  if (colour) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const rnd = seeded(7);
const TEX = {
  gills: canvasTexture(512, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      g.strokeStyle = `rgba(0,0,0,${0.18 + 0.12 * (i % 3 === 0)})`;
      g.lineWidth = i % 3 === 0 ? 2.2 : 1.2;
      g.beginPath();
      g.moveTo(Math.cos(a) * s * 0.07, Math.sin(a) * s * 0.07);
      g.lineTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath();
    g.arc(0, 0, s * 0.07, 0, Math.PI * 2);
    g.fill();
  }, { colour: true }),
  fibres: canvasTexture(256, (g, s) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},.18)`;
      g.fillRect(rnd() * s, 0, 1 + rnd() * 2, s);
    }
  }, { repeat: [3, 1] }),
  grooves: canvasTexture(256, (g, s) => {
    for (let x = 0; x < s; x++) {
      const v = Math.round(128 + 110 * Math.sin((x / s) * Math.PI * 2 * 10));
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, s);
    }
  }),
  scales: canvasTexture(256, (g, s) => {
    g.fillStyle = '#7a7a7a';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const v = 90 + Math.round(rnd() * 140);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.ellipse(rnd() * s, rnd() * s, 8 + rnd() * 12, 5 + rnd() * 7, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, { repeat: [2, 2] }),
  soft: canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#bbbbbb');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }),
  dot: canvasTexture(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }, { colour: true }),
};

/* ------------------------------------------------------------ habitats and seasons */

const GROUND = {
  woods: '#4d6335', grasses: '#6a8d38', leaves: '#7a5a39', meadows: '#77a246',
  paths: '#6c8a43', urban: '#8d9096', waste: '#75705f', heaths: '#6b683f', missing: '#a2a49d',
};

const SEASONS = {
  spring:  { sun: '#fff1d6', sunI: 2.6, sky: '#e3f3ff', grd: '#58753a', hemiI: 1.35,
             skyDay: ['#bfe2ff', '#f3fbff'], skyNight: ['#0e1a2b', '#1f3550'],
             particles: { kind: 'rise', count: 60, colours: ['#fff1a0', '#ffffff'], size: 0.06, speed: 0.18 } },
  summer:  { sun: '#ffe09f', sunI: 3.3, sky: '#d6eeff', grd: '#5d7a32', hemiI: 1.45,
             skyDay: ['#8dcfff', '#fff3d4'], skyNight: ['#0d1830', '#2a2a4a'],
             particles: { kind: 'hover', count: 26, colours: ['#fff5bd'], size: 0.05, speed: 0.12 } },
  autumn:  { sun: '#ffbe7e', sunI: 2.4, sky: '#ffe6cc', grd: '#6e5a32', hemiI: 1.25,
             skyDay: ['#f5c79a', '#fff0dd'], skyNight: ['#1b1424', '#3a2433'],
             particles: { kind: 'fall', count: 80, colours: ['#d9682b', '#e9a33a', '#b8452a', '#f0c46a'], size: 0.13, speed: 0.5 } },
  winter:  { sun: '#dce9ff', sunI: 2.0, sky: '#e8f0ff', grd: '#7d8796', hemiI: 1.4,
             skyDay: ['#c5d6ea', '#f5f8fc'], skyNight: ['#0b1424', '#1d2b40'],
             particles: { kind: 'fall', count: 230, colours: ['#ffffff'], size: 0.075, speed: 0.42 } },
  missing: { sun: '#ffffff', sunI: 2.5, sky: '#eef2f6', grd: '#6f7468', hemiI: 1.3,
             skyDay: ['#dfe5ec', '#f5f7f9'], skyNight: ['#11151c', '#232a35'],
             particles: null },
};

/* ------------------------------------------------------------ size mapping */

const logScale = (v, max) => Math.log1p(v) / Math.log1p(max);
const capRadius  = (d) => (d == null ? 1.15 : 0.7 + 1.0 * logScale(d, 57.4));
const stemHeight = (h) => (h == null ? 1.1 : 0.1 + 1.9 * logScale(h, 32.4));
const stemRadius = (w) => (w == null ? 0.2 : 0.05 + 0.32 * logScale(w, 102.5));

/* ================================================================== scene */

/* Horizontal axis at right angles to the camera's viewing direction: turning
   about it tips the mushroom towards or away from the viewer. */
const PEEK_AXIS = new THREE.Vector3(9.1, 0, -7.4).normalize();

export class MushroomScene {
  constructor() {
    this.group = new THREE.Group();
    this.cameraPose = { position: [7.4, 4.7, 9.1], target: [0, 1.05, 0] };
    this.dark = false;
    this.obs = {};
    this.time = 0;

    this._lights();
    this._island();
    this._props();
    this._mushroom();
    this._particles();
    this._effects();

    // Values that glide towards their targets every frame.
    this.cur = { capR: 1.15, capY: 1.1, stemH: 1.1, stemW: 0.2, stemS: 1, rim: 1, top: 0.55 };
    this.tgt = { ...this.cur };
    this.capShape = 'convex';
    this.capMoving = false;
    this.update({});
  }

  /* -------------------------------------------------------- building */

  _lights() {
    this.hemi = new THREE.HemisphereLight('#eef2f6', '#6f7468', 1.3);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.5);
    this.sun.position.set(4, 8, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -6;
    c.right = c.top = 6;
    c.near = 1;
    c.far = 20;
    this.sun.shadow.bias = -0.0008;
    this.group.add(this.hemi, this.sun);
    this.sunColour = new THREE.Color('#ffffff');
    this.skyColour = new THREE.Color('#eef2f6');
    this.grdColour = new THREE.Color('#6f7468');
  }

  _island() {
    this.groundMat = new THREE.MeshStandardMaterial({ color: GROUND.missing, roughness: 1 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.95, 0.35, 80), this.groundMat);
    top.position.y = -0.175;
    top.receiveShadow = true;
    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(4.95, 4.2, 0.7, 80),
      new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 1 }),
    );
    soil.position.y = -0.7;
    this.group.add(top, soil);
    this.groundColour = new THREE.Color(GROUND.missing);
  }

  _props() {
    // Four instanced meshes cover every habitat. Shapes are reused with a
    // colour and a scale per instance, which keeps it to four draw calls.
    const material = () => new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const cone = new THREE.ConeGeometry(1, 1, 7); cone.translate(0, 0.5, 0);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 9); cyl.translate(0, 0.5, 0);
    const blob = new THREE.IcosahedronGeometry(1, 1);
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);

    this.propMeshes = {
      cone: new THREE.InstancedMesh(cone, material(), 260),
      cyl:  new THREE.InstancedMesh(cyl, material(), 40),
      blob: new THREE.InstancedMesh(blob, material(), 160),
      box:  new THREE.InstancedMesh(box, material(), 50),
    };
    this.props = new THREE.Group();
    const white = new THREE.Color('#ffffff');
    for (const mesh of Object.values(this.propMeshes)) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Create the per-instance colour buffer now, so the shader is compiled
      // with instance colours from the first frame on.
      mesh.setColorAt(0, white);
      mesh.count = 0;
      this.props.add(mesh);
    }
    this.group.add(this.props);
  }

  _mushroom() {
    this.shroom = new THREE.Group();
    this.group.add(this.shroom);

    this.ghostMat = new THREE.MeshBasicMaterial({
      color: GHOST, wireframe: true, transparent: true, opacity: 0.55, depthWrite: false,
    });

    // Cap: a lathe whose vertices morph between shapes. Vertex colours give it
    // a darker crown and a paler rim.
    const geo = new THREE.LatheGeometry(
      Array.from({ length: PTS }, (_, j) => new THREE.Vector2(...profilePoint('convex', j / (PTS - 1)))),
      SEG,
    );
    geo.attributes.position.array.set(CAP_TARGETS.convex);
    const colours = new Float32Array(geo.attributes.position.count * 3);
    const crown = new THREE.Color('#a8794d');
    const rim = new THREE.Color('#ead6b6');
    const tmp = new THREE.Color();
    for (let i = 0; i <= SEG; i++) {
      for (let j = 0; j < PTS; j++) {
        tmp.copy(crown).lerp(rim, Math.pow(j / (PTS - 1), 0.8));
        tmp.toArray(colours, (i * PTS + j) * 3);
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.computeVertexNormals();
    this.capTarget = CAP_TARGETS.convex;
    this.capMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.55, side: THREE.DoubleSide,
      emissive: new THREE.Color('#000000'),
    });
    this.cap = new THREE.Mesh(geo, this.capMat);
    this.cap.castShadow = true;
    this.shroom.add(this.cap);

    // Gills: a disc under the cap, painted with radial lines.
    this.gillMats = {};
    for (const [name, hex] of Object.entries(MUSHROOM_COLOURS)) {
      // The underside faces away from the sun, so a little self-light in the
      // gill colour keeps the colour readable when the mushroom tips back.
      this.gillMats[name] = new THREE.MeshStandardMaterial({
        color: hex, map: TEX.gills, roughness: 0.8,
        emissive: hex, emissiveMap: TEX.gills, emissiveIntensity: 0.55,
      });
    }
    this.gillMats.none = new THREE.MeshStandardMaterial({ color: '#e6d2b2', roughness: 0.7 });
    const gillGeo = new THREE.CircleGeometry(1, SEG);
    gillGeo.rotateX(Math.PI / 2);   // face down
    this.gills = new THREE.Mesh(gillGeo, this.gillMats.none);
    this.shroom.add(this.gills);

    // Stem: one material per surface, created once, so switching surfaces
    // never recompiles a shader mid-interaction.
    const stemGeo = new THREE.CylinderGeometry(0.8, 1, 1, 40, 10, true);
    stemGeo.translate(0, 0.5, 0);
    const base = { color: '#efe5d4', side: THREE.DoubleSide };
    this.stemMats = {
      smooth:  new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.5 }),
      shiny:   new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.12, clearcoat: 0.7 }),
      silky:   new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.4, sheen: 1, sheenRoughness: 0.3, sheenColor: '#ffffff' }),
      sticky:  new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, color: '#e9dcc4' }),
      fibrous: new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.75, bumpMap: TEX.fibres, bumpScale: 2 }),
      grooves: new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.6, bumpMap: TEX.grooves, bumpScale: 4 }),
      scaly:   new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.85, bumpMap: TEX.scales, bumpScale: 4, color: '#e2d3ba' }),
    };
    this.stem = new THREE.Mesh(stemGeo, this.stemMats.smooth);
    this.stem.castShadow = true;
    this.shroom.add(this.stem);

    // Ring on the stem: each ring type is its own small mesh, made on demand.
    this.ringMat = new THREE.MeshStandardMaterial({ color: '#f1e8d8', roughness: 0.6, side: THREE.DoubleSide });
    this.ringFaint = new THREE.MeshStandardMaterial({ color: '#f1e8d8', roughness: 0.6, transparent: true, opacity: 0.38 });
    this.ringFaceted = new THREE.MeshStandardMaterial({ color: '#e7dcc8', roughness: 0.7, flatShading: true });
    this.rings = {};
    this.ringHolder = new THREE.Group();
    this.shroom.add(this.ringHolder);

    // Spore print: the stain the spores leave on the ground under the cap.
    this.printMat = new THREE.MeshLambertMaterial({
      color: '#ffffff', alphaMap: TEX.soft, transparent: true, opacity: 0.85, depthWrite: false,
    });
    const printGeo = new THREE.CircleGeometry(1, 48);
    printGeo.rotateX(-Math.PI / 2);
    this.print = new THREE.Mesh(printGeo, this.printMat);
    this.print.position.y = 0.006;
    this.print.renderOrder = 1;
    this.group.add(this.print);

    // A few spores drifting down from the gills, in the spore colour.
    const n = 30;
    this.spores = { n, pos: new Float32Array(n * 3), seed: Float32Array.from({ length: n }, () => Math.random()) };
    const sporeGeo = new THREE.BufferGeometry();
    sporeGeo.setAttribute('position', new THREE.BufferAttribute(this.spores.pos, 3));
    this.sporeMat = new THREE.PointsMaterial({
      size: 0.045, map: TEX.dot, transparent: true, depthWrite: false, color: '#ffffff',
    });
    this.sporePoints = new THREE.Points(sporeGeo, this.sporeMat);
    this.group.add(this.sporePoints);
  }

  _particles() {
    const max = 260;
    this.weather = {
      max, kind: null, speed: 0, count: 0,
      pos: new Float32Array(max * 3),
      col: new Float32Array(max * 3),
      phase: Float32Array.from({ length: max }, () => Math.random() * Math.PI * 2),
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.weather.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.weather.col, 3));
    geo.setDrawRange(0, 0);
    this.weatherMat = new THREE.PointsMaterial({
      size: 0.1, map: TEX.dot, vertexColors: true, transparent: true, depthWrite: false,
    });
    this.weatherPoints = new THREE.Points(geo, this.weatherMat);
    this.group.add(this.weatherPoints);
  }

  _effects() {
    // Scan ring: sweeps up and down the mushroom while the API answers.
    this.scanMat = new THREE.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: 0.9, toneMapped: false });
    const ringGeo = new THREE.TorusGeometry(1, 0.035, 8, 80);
    ringGeo.rotateX(Math.PI / 2);
    this.scanRing = new THREE.Mesh(ringGeo, this.scanMat);
    this.scanRing.visible = false;
    this.group.add(this.scanRing);
    this.scanning = false;

    // Burst: sparks from the cap when the answer lands.
    const n = 70;
    this.burst = {
      n, life: 0,
      pos: new Float32Array(n * 3),
      vel: new Float32Array(n * 3),
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.burst.pos, 3));
    this.burstMat = new THREE.PointsMaterial({
      size: 0.11, map: TEX.dot, transparent: true, depthWrite: false, opacity: 0, toneMapped: false,
    });
    this.burstPoints = new THREE.Points(geo, this.burstMat);
    this.burstPoints.visible = false;
    this.group.add(this.burstPoints);
  }

  /* -------------------------------------------------------- input -> scene */

  update(obs) {
    const prev = this.obs;
    this.obs = { ...obs };

    // Cap shape and size.
    const shape = obs.cap_shape || 'convex';
    if (shape !== this.capShape) {
      this.capShape = shape;
      this.capTarget = CAP_TARGETS[shape];
      this.capMoving = true;
    }
    this.cap.material = obs.cap_shape ? this.capMat : this.ghostMat;
    this.tgt.capR = capRadius(obs.cap_diameter);
    this.tgt.rim = rimOf(shape);
    this.tgt.top = topOf(shape);

    // Stem: drawn from the numbers as typed. Zero height or width, or a
    // surface of "none", means there is no stem to draw.
    const noStem = obs.stem_surface === 'none' || obs.stem_height === 0 || obs.stem_width === 0;
    this.tgt.stemH = stemHeight(obs.stem_height);
    this.tgt.stemW = stemRadius(obs.stem_width);
    this.tgt.stemS = noStem ? 0 : 1;
    this.tgt.capY = noStem ? 0.03 : this.tgt.stemH;
    this.stem.material = obs.stem_surface && obs.stem_surface !== 'none'
      ? this.stemMats[obs.stem_surface] : this.ghostMat;

    // Gills. They sit under the cap, out of the camera's view, so a new gill
    // colour makes the mushroom tip back for a moment to show them.
    this.gills.material = obs.gill_color == null ? this.ghostMat : this.gillMats[obs.gill_color];
    if (Object.keys(prev).length && obs.gill_color !== prev.gill_color && obs.gill_color != null) {
      this.peekHold = 1.6;
    }

    // Ring.
    this._setRing(noStem ? 'none' : (obs.ring_type ?? 'missing'));

    // Spore print and drifting spores.
    const spore = obs.spore_print_color;
    this.print.visible = spore != null;
    this.sporePoints.visible = spore != null && !reducedMotion;
    if (spore != null) {
      this.printMat.color.set(MUSHROOM_COLOURS[spore]);
      this.sporeMat.color.set(MUSHROOM_COLOURS[spore]);
    }

    // Only solid, observed parts cast a shadow.
    this.cap.castShadow = this.cap.material !== this.ghostMat;
    this.stem.castShadow = this.stem.material !== this.ghostMat;

    // Habitat and season rebuild only when they change.
    if (prev.habitat !== obs.habitat || !this._builtHabitat) this._setHabitat(obs.habitat ?? 'missing');
    if (prev.season !== obs.season || !this._builtSeason) this._setSeason(obs.season ?? 'missing');
    this.groundTarget = new THREE.Color(GROUND[obs.habitat ?? 'missing'] ?? GROUND.missing);
    if (obs.season === 'winter') this.groundTarget.lerp(new THREE.Color('#eef2f6'), 0.55);
  }

  _setRing(type) {
    if (this.ringType === type) return;
    this.ringType = type;
    this.ringHolder.clear();
    if (type === 'none') return;

    if (!this.rings[type]) {
      let geo;
      let mat = this.ringMat;
      switch (type) {
        case 'large':      geo = new THREE.TorusGeometry(1.3, 0.28, 10, 40); geo.rotateX(Math.PI / 2); break;
        case 'pendant':    geo = new THREE.CylinderGeometry(1.05, 1.9, 1.1, 40, 1, true); geo.translate(0, -0.55, 0); break;
        case 'flaring':    geo = new THREE.CylinderGeometry(1.9, 1.05, 0.9, 40, 1, true); geo.translate(0, 0.45, 0); break;
        case 'movable':    geo = new THREE.TorusGeometry(1.15, 0.17, 8, 32); geo.rotateX(Math.PI / 2); break;
        case 'zone':       geo = new THREE.TorusGeometry(1.03, 0.08, 6, 40); geo.rotateX(Math.PI / 2); break;
        case 'evanescent': geo = new THREE.TorusGeometry(1.2, 0.18, 8, 36); geo.rotateX(Math.PI / 2); mat = this.ringFaint; break;
        case 'grooved':    geo = new THREE.TorusGeometry(1.25, 0.25, 4, 18); geo.rotateX(Math.PI / 2); mat = this.ringFaceted; break;
        default:           geo = new THREE.TorusGeometry(1.25, 0.22, 8, 32); geo.rotateX(Math.PI / 2); mat = this.ghostMat;
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mat !== this.ghostMat;
      this.rings[type] = mesh;
    }
    const ring = this.rings[type];
    this.ringHolder.add(ring);
    // A ring that appears pops on; it is a small reward for filling in a field.
    if (!reducedMotion) {
      ring.scale.setScalar(0.01);
      tween(420, (p) => ring.scale.setScalar(Math.max(0.01, p)), { easing: ease.outBack });
    }
  }

  _setHabitat(habitat) {
    this._builtHabitat = true;
    this.groundTarget = new THREE.Color(GROUND[habitat] ?? GROUND.missing);
    const random = seeded(hashString(habitat));
    const items = [];

    // A ring of space is kept clear around the mushroom so it stays the hero.
    const spot = () => {
      const a = random() * Math.PI * 2;
      const r = 1.9 + random() * 2.5;
      return [Math.cos(a) * r, Math.sin(a) * r];
    };
    const pick = (list) => list[Math.floor(random() * list.length)];
    const add = (kind, x, z, sx, sy, sz, colour, y = 0, rot = random() * Math.PI) => items.push({ kind, x, y, z, sx, sy, sz, colour, rot });
    const blades = (n, colours) => {
      for (let i = 0; i < n; i++) {
        const [x, z] = spot();
        add('cone', x, z, 0.035, 0.22 + random() * 0.3, 0.035, pick(colours));
      }
    };
    const trees = (n) => {
      for (let i = 0; i < n; i++) {
        const a = random() * Math.PI * 2;
        const r = 3.6 + random() * 0.9;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = 0.9 + random() * 0.6;
        add('cyl', x, z, 0.08, 0.4, 0.08, '#5a4030');
        add('cone', x, z, 0.36 + random() * 0.12, h, 0.36 + random() * 0.12, pick(['#2f5a32', '#3d6b3a', '#284d2c']), 0.32);
      }
    };

    switch (habitat) {
      case 'woods':
        trees(6);
        for (let i = 0; i < 30; i++) { const [x, z] = spot(); add('blob', x, z, 0.16, 0.03, 0.11, pick(['#8a5a2f', '#c07b35', '#6d4a2a'])); }
        break;
      case 'grasses':
        blades(220, ['#5f8a2f', '#77a03c', '#4f7a2a', '#8ab04a']);
        break;
      case 'leaves':
        for (let i = 0; i < 110; i++) { const [x, z] = spot(); add('blob', x, z, 0.14 + random() * 0.08, 0.025, 0.1, pick(['#c45a26', '#e39a3a', '#9c3d22', '#d9b24a', '#7a4a26'])); }
        break;
      case 'meadows':
        blades(170, ['#6ea338', '#88b84a', '#5b9230']);
        for (let i = 0; i < 34; i++) { const [x, z] = spot(); add('blob', x, z, 0.075, 0.075, 0.075, pick(['#f2f2f2', '#f5c94a', '#e98bb0', '#b48ce0']), 0.32 + random() * 0.12); }
        break;
      case 'paths':
        for (let i = 0; i < 13; i++) {
          const a = -1.4 + i * 0.24;
          add('cyl', Math.cos(a) * 2.7, Math.sin(a) * 2.7, 0.3 + random() * 0.08, 0.06, 0.26 + random() * 0.08, pick(['#a7a49b', '#8e8b83', '#b8b4aa']));
        }
        blades(60, ['#5f8a2f', '#77a03c']);
        break;
      case 'urban':
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          add('box', Math.cos(a) * 4.3, Math.sin(a) * 4.3, 0.9, 0.16, 0.22, '#b3b6bb', 0, -a);
        }
        for (let i = 0; i < 4; i++) { const a = 0.6 + i * 1.6; add('cyl', Math.cos(a) * 3.2, Math.sin(a) * 3.2, 0.09, 0.65, 0.09, '#3b3f46'); }
        add('box', 2.6, -2.2, 0.8, 0.45, 0.8, '#7f858e');
        add('box', -2.9, 1.6, 0.7, 0.4, 0.7, '#7f858e');
        blades(16, ['#6a8d38']);
        break;
      case 'waste':
        for (let i = 0; i < 22; i++) { const [x, z] = spot(); add('box', x, z, 0.12 + random() * 0.18, 0.06 + random() * 0.14, 0.1 + random() * 0.15, pick(['#d6453a', '#3d6fd6', '#e8e4da', '#5a5550', '#d8b23a'])); }
        for (let i = 0; i < 10; i++) { const [x, z] = spot(); add('cyl', x, z, 0.05, 0.16, 0.05, pick(['#c9ccd1', '#c24a3e', '#3a8a4a'])); }
        for (let i = 0; i < 6; i++) { const [x, z] = spot(); add('blob', x, z, 0.28, 0.16, 0.24, '#2d2f33'); }
        break;
      case 'heaths':
        for (let i = 0; i < 55; i++) { const [x, z] = spot(); const s = 0.18 + random() * 0.2; add('blob', x, z, s, s * 0.65, s, pick(['#8e5f8f', '#a77aa8', '#6f7d3d', '#7d5b80']), s * 0.45); }
        blades(40, ['#7a7a3a', '#8a8a44']);
        break;
      default:
        break; // missing: a bare island
    }

    // Write the instances.
    const dummy = new THREE.Object3D();
    const colour = new THREE.Color();
    const counts = { cone: 0, cyl: 0, blob: 0, box: 0 };
    for (const it of items) {
      const mesh = this.propMeshes[it.kind];
      const i = counts[it.kind]++;
      if (i >= mesh.instanceMatrix.count) continue;
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(0, it.rot, 0);
      dummy.scale.set(it.sx, it.sy, it.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, colour.set(it.colour));
    }
    for (const [kind, mesh] of Object.entries(this.propMeshes)) {
      mesh.count = Math.min(counts[kind], mesh.instanceMatrix.count);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // The new habitat grows out of the ground.
    this.props.scale.y = reducedMotion ? 1 : 0.01;
    tween(520, (p) => { this.props.scale.y = Math.max(0.01, p); }, { easing: ease.outBack });
  }

  _setSeason(season) {
    this._builtSeason = true;
    this.season = SEASONS[season] ? season : 'missing';
    this._applyLighting();

    const def = SEASONS[this.season].particles;
    const w = this.weather;
    w.kind = def ? def.kind : null;
    w.count = def && !reducedMotion ? def.count : 0;
    w.speed = def ? def.speed : 0;
    this.weatherMat.size = def ? def.size : 0.1;
    const c = new THREE.Color();
    for (let i = 0; i < w.count; i++) {
      this._respawnParticle(i, true);
      c.set(def.colours[i % def.colours.length]);
      c.toArray(w.col, i * 3);
    }
    this.weatherPoints.geometry.setDrawRange(0, w.count);
    this.weatherPoints.geometry.attributes.color.needsUpdate = true;
  }

  _respawnParticle(i, anywhere) {
    const w = this.weather;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 4.6;
    let y;
    if (w.kind === 'fall') y = anywhere ? Math.random() * 5.5 : 5.5;
    else if (w.kind === 'rise') y = anywhere ? Math.random() * 4 : 0.05;
    else y = 0.3 + Math.random() * 2.5;
    w.pos[i * 3] = Math.cos(a) * r;
    w.pos[i * 3 + 1] = y;
    w.pos[i * 3 + 2] = Math.sin(a) * r;
  }

  _applyLighting() {
    const s = SEASONS[this.season || 'missing'];
    const night = new THREE.Color('#8fa6ff');
    this.sunTarget = new THREE.Color(s.sun);
    this.skyTarget = new THREE.Color(s.sky);
    this.grdTarget = new THREE.Color(s.grd);
    this.sunITarget = s.sunI;
    this.hemiITarget = s.hemiI;
    if (this.dark) {
      this.sunTarget.lerp(night, 0.55);
      this.skyTarget.lerp(new THREE.Color('#3a4a7a'), 0.6);
      this.sunITarget *= 0.5;
      this.hemiITarget *= 0.5;
    }
  }

  setDark(dark) {
    this.dark = dark;
    this._applyLighting();
  }

  skyColors(dark) {
    const s = SEASONS[this.season || 'missing'];
    return dark ? s.skyNight : s.skyDay;
  }

  /* -------------------------------------------------------- scan and reveal */

  startScan() {
    this.scanning = true;
    this.scanRing.visible = true;
    this.scanRing.material.opacity = 0.9;
    this.scanMat.color.set(GHOST);
    this.capMat.emissive.set('#000000');
  }

  /* `verdict` is "poisonous", "edible", or null when the request failed. */
  stopScan(verdict) {
    this.scanning = false;
    if (!verdict) { this.scanRing.visible = false; return; }

    const colour = VERDICT[verdict];
    const ring = this.scanRing;
    const startScale = ring.scale.x;
    this.scanMat.color.set(colour);
    ring.position.y = this.cur.capY + 0.05;
    // Shockwave: the ring snaps to the cap, then flies outward and fades.
    tween(650, (p) => {
      ring.scale.setScalar(startScale * (1 + p * 0.9));
      this.scanMat.opacity = 0.9 * (1 - p) * (1 - p);
    }, { onDone: () => { ring.visible = false; } });

    // Sparks in the verdict colour.
    const b = this.burst;
    const y0 = this.cur.capY + this.cur.top * this.cur.capR * 0.9 * 0.6;
    for (let i = 0; i < b.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.9;
      const sp = 1.2 + Math.random() * 1.8;
      b.pos[i * 3] = Math.cos(a) * 0.3;
      b.pos[i * 3 + 1] = y0;
      b.pos[i * 3 + 2] = Math.sin(a) * 0.3;
      b.vel[i * 3] = Math.cos(a) * sp;
      b.vel[i * 3 + 1] = up * 2.4;
      b.vel[i * 3 + 2] = Math.sin(a) * sp;
    }
    if (!reducedMotion) {
      b.life = 1;
      this.burstMat.color.set(colour);
      this.burstPoints.visible = true;
    }

    // The cap itself glows once in the verdict colour.
    this.capMat.emissive.set(colour);
    tween(1000, (p) => { this.capMat.emissiveIntensity = 0.85 * (1 - p); },
      { onDone: () => this.capMat.emissive.set('#000000') });
  }

  /* -------------------------------------------------------- every frame */

  tick(dt, t) {
    const cur = this.cur, tgt = this.tgt;
    for (const key of Object.keys(cur)) cur[key] = approach(cur[key], tgt[key], dt, 11);

    // Lighting and ground glide to the season and habitat.
    const k = reducedMotion ? 1 : 1 - Math.exp(-4 * dt);
    if (this.sunTarget) {
      this.sun.color.lerp(this.sunTarget, k);
      this.hemi.color.lerp(this.skyTarget, k);
      this.hemi.groundColor.lerp(this.grdTarget, k);
      this.sun.intensity += (this.sunITarget - this.sun.intensity) * k;
      this.hemi.intensity += (this.hemiITarget - this.hemi.intensity) * k;
    }
    if (this.groundTarget) this.groundMat.color.lerp(this.groundTarget, k);

    // Cap morph.
    if (this.capMoving) {
      const arr = this.cap.geometry.attributes.position.array;
      const target = this.capTarget;
      const m = reducedMotion ? 1 : 1 - Math.exp(-10 * dt);
      let moved = 0;
      for (let i = 0; i < arr.length; i++) {
        const d = target[i] - arr[i];
        arr[i] += d * m;
        moved = Math.max(moved, Math.abs(d));
      }
      this.cap.geometry.attributes.position.needsUpdate = true;
      this.cap.geometry.computeVertexNormals();
      if (moved < 1e-4) this.capMoving = false;
    }

    // Gill peek: tip the top away from the camera so the underside faces it,
    // hold, then spring back upright.
    this.peekHold = Math.max(0, (this.peekHold ?? 0) - dt);
    this.peekCur = approach(this.peekCur ?? 0, this.peekHold > 0 ? 1 : 0, dt, 7);
    this.shroom.quaternion.setFromAxisAngle(PEEK_AXIS, -0.8 * this.peekCur);

    // Place the parts.
    const capScaleY = cur.capR * 0.9;
    this.cap.scale.set(cur.capR, capScaleY, cur.capR);
    this.cap.position.y = cur.capY;
    this.gills.scale.setScalar(cur.capR * cur.rim * 0.985);
    this.gills.position.y = cur.capY - 0.004;

    this.stem.visible = cur.stemS > 0.02;
    this.stem.scale.set(cur.stemW, Math.max(cur.stemH * cur.stemS, 0.001), cur.stemW);

    const ringY = this.ringType === 'movable' ? 0.45 : 0.72;
    this.ringHolder.visible = this.stem.visible;
    this.ringHolder.position.y = cur.stemH * cur.stemS * ringY;
    this.ringHolder.scale.setScalar(Math.max(cur.stemW, 0.1));

    this.print.scale.setScalar(cur.capR * 1.25);

    // Drifting spores.
    if (this.sporePoints.visible) {
      const s = this.spores;
      const rimR = cur.capR * cur.rim * 0.8;
      for (let i = 0; i < s.n; i++) {
        const life = (t * 0.18 + s.seed[i]) % 1;
        const a = s.seed[i] * 40 + t * 0.2;
        const r = rimR * (0.35 + 0.6 * ((s.seed[i] * 7.3) % 1));
        s.pos[i * 3] = Math.cos(a) * r;
        s.pos[i * 3 + 1] = Math.max(0.02, cur.capY * (1 - life));
        s.pos[i * 3 + 2] = Math.sin(a) * r;
      }
      this.sporePoints.geometry.attributes.position.needsUpdate = true;
    }

    // Season particles.
    const w = this.weather;
    if (w.count) {
      for (let i = 0; i < w.count; i++) {
        const p = i * 3;
        const ph = w.phase[i];
        if (w.kind === 'fall') {
          w.pos[p + 1] -= w.speed * dt * (0.7 + 0.6 * ((ph * 3.1) % 1));
          w.pos[p] += Math.sin(t * 1.3 + ph) * 0.25 * dt;
          w.pos[p + 2] += Math.cos(t * 1.1 + ph) * 0.2 * dt;
          if (w.pos[p + 1] < 0.02) this._respawnParticle(i, false);
        } else if (w.kind === 'rise') {
          w.pos[p + 1] += w.speed * dt;
          w.pos[p] += Math.sin(t + ph) * 0.15 * dt;
          if (w.pos[p + 1] > 4.5) this._respawnParticle(i, false);
        } else {
          w.pos[p] += Math.sin(t * 0.7 + ph) * 0.2 * dt;
          w.pos[p + 1] += Math.cos(t * 0.9 + ph) * 0.15 * dt;
        }
      }
      this.weatherPoints.geometry.attributes.position.needsUpdate = true;
    }

    // Scan ring.
    if (this.scanning) {
      const top = cur.capY + cur.top * capScaleY + 0.15;
      this.scanRing.position.y = 0.05 + (Math.sin(t * 4.2) * 0.5 + 0.5) * top;
      this.scanRing.scale.setScalar(Math.max(cur.capR * cur.rim * 1.22, cur.stemW * 2.6, 0.9));
    }

    // Burst sparks: fly, fall, fade.
    const b = this.burst;
    if (b.life > 0) {
      b.life = Math.max(0, b.life - dt * 1.1);
      for (let i = 0; i < b.n; i++) {
        b.vel[i * 3 + 1] -= 5.5 * dt;
        b.pos[i * 3] += b.vel[i * 3] * dt;
        b.pos[i * 3 + 1] = Math.max(0.03, b.pos[i * 3 + 1] + b.vel[i * 3 + 1] * dt);
        b.pos[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
      }
      this.burstPoints.geometry.attributes.position.needsUpdate = true;
      this.burstMat.opacity = b.life;
      if (b.life === 0) this.burstPoints.visible = false;
    }
  }
}
