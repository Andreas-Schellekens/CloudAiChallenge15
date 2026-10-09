/*
  The 3D stage: renderer, camera, orbit controls and the switch between the two
  scenes. The scenes themselves live in mushroom-scene.js and bike-scene.js.

  Kept deliberately cheap, because this is a demo page, not a game:
  - it renders only while the canvas is on screen and the tab is visible;
  - the pixel ratio is capped at 2;
  - on touch screens dragging is off, so a finger scrolls the page instead of
    spinning the scene, and the scene turns slowly on its own;
  - under prefers-reduced-motion nothing moves by itself.

  app.js loads this file with a dynamic import. If WebGL or the CDN is not
  available the import fails, the page adds `no-3d` to <body> and every
  prediction still works: the 3D view is decoration on top of a working form.
*/

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MushroomScene } from './mushroom-scene.js';
import { BikeScene } from './bike-scene.js';
import { tween, runTweens, ease, reducedMotion } from './motion.js';

function isDarkTheme() {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'dark') return true;
  if (set === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function createStage(canvas, stageEl) {
  // Throws when WebGL is unavailable; app.js catches that and shows the fallback.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = false;        // the wheel scrolls the page, not the scene
  controls.enablePan = false;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.38;      // never look from under the ground
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.55;
  if (window.matchMedia('(pointer: coarse)').matches) controls.enabled = false;

  // Pause the slow turn while someone is dragging, and for a moment after.
  let resumeTimer = null;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
    const hint = document.getElementById('stage-hint');
    if (hint) hint.classList.add('gone');
  });
  controls.addEventListener('end', () => {
    if (reducedMotion) return;
    resumeTimer = setTimeout(() => { controls.autoRotate = true; }, 5000);
  });

  const scenes = {
    mushroom: new MushroomScene(),
    citibike: new BikeScene(),
  };
  for (const s of Object.values(scenes)) {
    scene.add(s.group);
    s.group.visible = false;
  }

  let mode = null;
  let dark = isDarkTheme();

  function applySky() {
    if (!mode) return;
    const [top, bottom] = scenes[mode].skyColors(dark);
    stageEl.style.setProperty('--sky-top', top);
    stageEl.style.setProperty('--sky-bottom', bottom);
  }

  /* Switching models: the old scene drops away, the camera glides to the new
     framing and the new scene springs up. It tells you the whole world changed,
     not just the form. */
  function setMode(next) {
    if (next === mode) return;
    const prev = mode;
    mode = next;
    const incoming = scenes[next];

    if (prev) {
      const outgoing = scenes[prev].group;
      tween(260, (p) => outgoing.scale.setScalar(Math.max(0.001, 1 - p)), {
        easing: ease.inBack,
        onDone: () => { outgoing.visible = false; },
      });
    }

    incoming.group.visible = true;
    incoming.group.scale.setScalar(0.001);
    tween(620, (p) => incoming.group.scale.setScalar(Math.max(0.001, p)), {
      easing: ease.outBack,
      delay: prev ? 180 : 0,
    });

    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    const toPos = new THREE.Vector3(...incoming.cameraPose.position);
    const toTarget = new THREE.Vector3(...incoming.cameraPose.target);
    if (!prev) {
      camera.position.copy(toPos);
      controls.target.copy(toTarget);
    } else {
      tween(800, (p) => {
        camera.position.lerpVectors(fromPos, toPos, p);
        controls.target.lerpVectors(fromTarget, toTarget, p);
      });
    }
    applySky();
  }

  function setDark(value) {
    dark = value;
    for (const s of Object.values(scenes)) s.setDark(value);
    applySky();
  }
  setDark(dark);

  // Size follows the element, not the window.
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens get a wider field of view so the whole scene still fits.
    camera.fov = camera.aspect < 0.9 ? 44 : 34;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Render only when there is something to see.
  let onScreen = true;
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }, { threshold: 0.01 })
    .observe(canvas);

  const clock = new THREE.Clock();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!onScreen || document.hidden) return;
    runTweens(now);
    const t = clock.elapsedTime;
    for (const s of Object.values(scenes)) if (s.group.visible) s.tick(dt, t);
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    mushroom: scenes.mushroom,
    citibike: scenes.citibike,
    setMode,
    setDark,
    refreshSky: applySky,
  };
}
