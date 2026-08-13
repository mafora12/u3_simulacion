import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';
import { createOscilloscope } from './ui/oscilloscope.js';

const PARTICLE_COUNT = 131072; // 2^17. Increase only after measuring performance.

async function main() {
  const mount = document.querySelector('#app');

  if (!WebGPU.isAvailable()) {
    mount.appendChild(WebGPU.getErrorMessage());
    throw new Error('Este proyecto requiere WebGPU para ejecutar compute shaders.');
  }

  // THREE.JS MENTAL MODEL: scene + camera + renderer ---------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050607');

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
  camera.position.set(0, 0, 11);

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  mount.appendChild(renderer.domElement);
  await renderer.init();

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 0, 0);

  const params = createParameters();
  const simulation = createSimulation({ renderer, scene, params, count: PARTICLE_COUNT });

  // LAB HELPERS -----------------------------------------------------------
  const attractorHelper = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })
  );
  scene.add(attractorHelper);
  const axes = new THREE.AxesHelper(1.5);
  scene.add(axes);

  // POINTER -> WORLD POSITION --------------------------------------------
  // El puntero conduce dónde se ancla la capa Núcleo, en vivo.
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

  addEventListener('pointermove', (event) => {
    pointerNdc.x = (event.clientX / innerWidth) * 2 - 1;
    pointerNdc.y = -(event.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    if (raycaster.ray.intersectPlane(interactionPlane, hit)) {
      params.attractor.value.copy(hit);
      attractorHelper.position.copy(hit);
    }
  });

  let paused = false;
  let mode = 'LAB';
  let panel;
  let savedRadialStrength = params.radialStrength.value;

  // Identidad de capa: mismo número en LAB (prueba aislada, con reset) y en
  // PERFORMANCE (encendido/apagado en vivo, sin reset) para la misma capa.
  const LAYER_KEYS = {
    Digit1: { id: 'pulso', enabled: 'vortexEnabled' },
    Digit2: { id: 'nucleo', enabled: 'radialEnabled' },
    Digit3: { id: 'textura', enabled: 'windEnabled' },
    Digit4: { id: 'friccion', enabled: 'dragEnabled' }
  };

  // Pruebas de LAB: aíslan una capa y resetean, para poder predecir y
  // verificar su efecto por separado antes de tocarla en vivo.
  const applyPreset = (id) => {
    params.windEnabled.value = 0;
    params.radialEnabled.value = 0;
    params.vortexEnabled.value = 0;
    params.dragEnabled.value = 0;
    params.wind.value.set(0, 0, 0);
    params.initialSpeed.value = 0;
    params.intensity.value = 1;

    if (id === 'inercia') {
      params.initialSpeed.value = 0.8;
    } else if (id === 'pulso') {
      params.vortexEnabled.value = 1;
      params.vortexStrength.value = 2.5;
    } else if (id === 'nucleo') {
      params.radialEnabled.value = 1;
      params.radialStrength.value = 3.0;
    } else if (id === 'textura') {
      params.windEnabled.value = 1;
      params.wind.value.set(1.5, 0, 0);
    } else if (id === 'friccion') {
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.5;
      params.initialSpeed.value = 1.0;
    } else if (id === 'todas') {
      params.vortexEnabled.value = 1;
      params.vortexStrength.value = 1.4;
      params.radialEnabled.value = 1;
      params.radialStrength.value = 2.0;
      params.windEnabled.value = 1;
      params.wind.value.set(0.8, 0, 0);
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.12;
    }
    simulation.reset();
    panel?.refresh();
  };

  // PERFORMANCE: entra/sale una capa de la mezcla sin resetear el sistema -
  // el comportamiento debe seguir emergiendo de las condiciones actuales,
  // no de un corte a un estado inicial.
  const toggleLayer = (enabledKey) => {
    params[enabledKey].value = params[enabledKey].value > 0 ? 0 : 1;
    panel?.refresh();
  };

  const toggleAllLayers = () => {
    const keys = Object.values(LAYER_KEYS).map((l) => l.enabled);
    const allOn = keys.every((k) => params[k].value > 0);
    for (const k of keys) params[k].value = allOn ? 0 : 1;
    panel?.refresh();
  };

  const setMode = (next) => {
    mode = next;
    const lab = mode === 'LAB';
    panel.setVisible(lab);
    axes.visible = lab;
    attractorHelper.visible = lab;
    orbit.enabled = lab;
    hud.innerHTML = lab
      ? '<strong>LAB</strong> · P: performance · R: reset · 0–5: pruebas de capa'
      : '<strong>PERFORMANCE</strong> · P: lab · 1–4: capas dentro/fuera · 5: todas · espacio: invertir núcleo · rueda: intensidad · puntero: posición del núcleo';
  };

  panel = createLabPanel({
    params,
    onReset: () => simulation.reset(),
    onPreset: applyPreset,
    onModeChange: () => setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB'),
    onPauseChange: () => paused = !paused
  });

  const hud = document.createElement('div');
  hud.className = 'hud';
  document.body.append(hud);
  setMode('LAB');

  // OSCILOSCOPIO -----------------------------------------------------------
  // Grafica la velocidad promedio real de las partículas, leída de vuelta
  // desde el compute shader. No lee audio - es un indicador del propio
  // sistema, útil tanto para verificar en LAB como para tocar con feedback.
  const scope = createOscilloscope();
  let samplingVelocity = false;

  async function sampleAverageSpeed() {
    if (samplingVelocity) return;
    samplingVelocity = true;
    try {
      const raw = await renderer.getArrayBufferAsync(simulation.velocityBuffer.value);
      const floats = new Float32Array(raw);
      const n = floats.length / 3;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const vx = floats[i * 3];
        const vy = floats[i * 3 + 1];
        const vz = floats[i * 3 + 2];
        sum += Math.sqrt(vx * vx + vy * vy + vz * vz);
      }
      scope.push(sum / n);
    } finally {
      samplingVelocity = false;
    }
  }
  setInterval(sampleAverageSpeed, 150);

  // LIVE INSTRUMENT MAPPING FOR LesAlpx ------------------------------------
  // Pocos controles con significado: en LAB, los números aíslan y resetean
  // una capa para verificarla; en PERFORMANCE, los mismos números la meten
  // o sacan de la mezcla en vivo, sin resetear el sistema.
  addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'KeyP') setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB');
    if (event.code === 'KeyR') simulation.reset();
    if (event.code === 'Digit0' && mode === 'LAB') applyPreset('inercia');

    const layer = LAYER_KEYS[event.code];
    if (layer) {
      if (mode === 'LAB') applyPreset(layer.id);
      else toggleLayer(layer.enabled);
    }

    if (event.code === 'Digit5') {
      if (mode === 'LAB') applyPreset('todas');
      else toggleAllLayers();
    }

    if (event.code === 'Space') {
      event.preventDefault();
      savedRadialStrength = params.radialStrength.value || 2.0;
      params.radialEnabled.value = 1;
      params.radialStrength.value = -savedRadialStrength;
    }
  });

  addEventListener('keyup', (event) => {
    if (event.code === 'Space') params.radialStrength.value = savedRadialStrength;
  });

  // Rueda: macro de intensidad en vivo, cuánto empujan las capas activas.
  addEventListener('wheel', (event) => {
    const next = params.intensity.value - Math.sign(event.deltaY) * 0.05;
    params.intensity.value = Math.min(2, Math.max(0, next));
    panel?.refresh();
  }, { passive: true });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  simulation.reset();

  // FRAME LOOP ------------------------------------------------------------
  renderer.setAnimationLoop(() => {
    if (!paused) simulation.stepSimulation();
    orbit.update();
    renderer.render(scene, camera);
    scope.draw(params.maxSpeed.value);
  });
}

main().catch((error) => {
  console.error(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:16px;white-space:pre-wrap;color:#fff;z-index:50';
  pre.textContent = String(error?.stack || error);
  document.body.append(pre);
});
