import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';
import { createOscilloscope } from './ui/oscilloscope.js';

const PARTICLE_COUNT = 131072; // 2^17. Increase only after measuring performance.
const STAMP_SIZE = 256;        // partículas por tramo del pincel
const MIN_SEGMENT = 0.015;     // no sellar si el puntero apenas se movió
const MAX_SEGMENT = 0.5;       // tramo máximo, para no perder densidad al trazar rápido

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
  const canvas = renderer.domElement;

  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.target.set(0, 0, 0);

  const params = createParameters();
  const simulation = createSimulation({
    renderer,
    scene,
    params,
    count: PARTICLE_COUNT,
    stampSize: STAMP_SIZE
  });

  // LAB HELPERS -----------------------------------------------------------
  const attractorHelper = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })
  );
  scene.add(attractorHelper);
  const axes = new THREE.AxesHelper(1.5);
  scene.add(axes);

  const hud = document.createElement('div');
  hud.className = 'hud';
  document.body.append(hud);

  // PUNTERO -> POSICIÓN EN EL MUNDO ---------------------------------------
  // El plano de trabajo siempre mira a la cámara: lo que trazas en pantalla
  // aparece tal cual, aunque hayas orbitado la vista antes de dibujar.
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const workPlane = new THREE.Plane();
  const planeNormal = new THREE.Vector3();
  const ORIGIN = new THREE.Vector3(0, 0, 0);
  const hit = new THREE.Vector3();

  function pointerToWorld(event, out) {
    pointerNdc.x = (event.clientX / innerWidth) * 2 - 1;
    pointerNdc.y = -(event.clientY / innerHeight) * 2 + 1;
    camera.getWorldDirection(planeNormal);
    workPlane.setFromNormalAndCoplanarPoint(planeNormal, ORIGIN);
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.ray.intersectPlane(workPlane, out) ? out : null;
  }

  let paused = false;
  let mode = 'LAB';
  let drawMode = false;
  let drawing = false;
  let panel;
  let savedRadialStrength = params.radialStrength.value;

  const lastStamp = new THREE.Vector3();
  const segmentStart = new THREE.Vector3();
  const segmentEnd = new THREE.Vector3();
  let hasLastStamp = false;

  function updateHud() {
    const draw = drawMode
      ? '<strong>DIBUJO</strong>: arrastra para trazar · D: salir'
      : 'D: dibujar figura';
    hud.innerHTML = mode === 'LAB'
      ? `<strong>LAB</strong> · ${draw} · 1–4: aislar capa · 0: restaurar figura · R: reset (cero partículas) · P: performance`
      : `<strong>PERFORMANCE</strong> · ${draw} · 1–4: capas dentro/fuera · 5: todas · 0: restaurar figura · espacio: invertir núcleo · rueda: intensidad`;
  }

  // MODO DIBUJO ------------------------------------------------------------
  // Mientras dibujas, la órbita queda bloqueada: el puntero es el pincel y no
  // la cámara. Al salir del modo dibujo vuelves a poder girar la vista.
  const setDrawMode = (active) => {
    drawMode = active;
    drawing = false;
    hasLastStamp = false;
    orbit.enabled = !drawMode && mode === 'LAB';
    attractorHelper.visible = mode === 'LAB' && !drawMode;
    canvas.style.cursor = drawMode ? 'crosshair' : '';
    panel?.setDrawMode(drawMode);
    updateHud();
  };

  const setMode = (next) => {
    mode = next;
    const lab = mode === 'LAB';
    panel?.setVisible(lab);
    axes.visible = lab;
    attractorHelper.visible = lab && !drawMode;
    orbit.enabled = lab && !drawMode;
    updateHud();
  };

  // Traza continua: cada sello cubre el tramo recorrido desde el sello
  // anterior, así un movimiento rápido del puntero no deja huecos. Un tramo
  // muy largo se parte para que la densidad de partículas no caiga.
  function strokeTo(target) {
    if (!hasLastStamp) {
      simulation.stamp(target);
      lastStamp.copy(target);
      hasLastStamp = true;
      return;
    }
    const distance = target.distanceTo(lastStamp);
    if (distance < MIN_SEGMENT) return;

    const steps = Math.min(Math.ceil(distance / MAX_SEGMENT), 16);
    segmentStart.copy(lastStamp);
    for (let s = 1; s <= steps; s++) {
      segmentEnd.lerpVectors(lastStamp, target, s / steps);
      simulation.stamp(segmentStart, segmentEnd);
      segmentStart.copy(segmentEnd);
    }
    lastStamp.copy(target);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!drawMode) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawing = true;
    hasLastStamp = false;
    if (pointerToWorld(event, hit)) strokeTo(hit);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drawMode || !drawing) return;
    if (pointerToWorld(event, hit)) strokeTo(hit);
  });

  const endStroke = (event) => {
    if (!drawing) return;
    drawing = false;
    hasLastStamp = false;
    if (event && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    panel?.refresh();
    updateHud();
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  // Fuera del modo dibujo el puntero conduce dónde se ancla la capa Núcleo.
  addEventListener('pointermove', (event) => {
    if (drawMode) return;
    if (pointerToWorld(event, hit)) {
      params.attractor.value.copy(hit);
      attractorHelper.position.copy(hit);
    }
  });

  // Identidad de capa: mismo número en LAB (prueba aislada, sobre la figura
  // restaurada) y en PERFORMANCE (encendido/apagado en vivo) para la misma capa.
  const LAYER_KEYS = {
    Digit1: { id: 'pulso', enabled: 'vortexEnabled' },
    Digit2: { id: 'nucleo', enabled: 'radialEnabled' },
    Digit3: { id: 'textura', enabled: 'windEnabled' },
    Digit4: { id: 'friccion', enabled: 'dragEnabled' }
  };

  const allLayersOff = () => {
    params.windEnabled.value = 0;
    params.radialEnabled.value = 0;
    params.vortexEnabled.value = 0;
    params.dragEnabled.value = 0;
    params.wind.value.set(0, 0, 0);
    params.initialSpeed.value = 0;
    params.intensity.value = 1;
  };

  // Pruebas de LAB: aíslan una capa y devuelven la figura a su estado
  // dibujado, para poder predecir y verificar el efecto de esa capa sobre la
  // MISMA condición inicial todas las veces.
  const applyPreset = (id) => {
    allLayersOff();

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
    simulation.restoreFigure();
    panel?.refresh();
  };

  // Estado inicial del instrumento: cero partículas y ninguna fuerza activa.
  const resetAll = () => {
    allLayersOff();
    simulation.reset();
    panel?.refresh();
    updateHud();
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

  panel = createLabPanel({
    params,
    onReset: resetAll,
    onRestore: () => simulation.restoreFigure(),
    onSeedCloud: () => { simulation.seedCloud(); panel?.refresh(); },
    onDrawToggle: () => setDrawMode(!drawMode),
    onPreset: applyPreset,
    onModeChange: () => setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB'),
    onPauseChange: () => paused = !paused
  });

  setMode('LAB');
  setDrawMode(false);

  // OSCILOSCOPIO -----------------------------------------------------------
  // Grafica la velocidad promedio real de las partículas, leída de vuelta
  // desde el compute shader. No lee audio - es un indicador del propio
  // sistema, útil tanto para verificar en LAB como para tocar con feedback.
  const scope = createOscilloscope();
  let samplingVelocity = false;

  async function sampleAverageSpeed() {
    if (samplingVelocity) return;
    const aliveCount = simulation.getAliveCount();
    if (aliveCount === 0) {
      scope.push(0);
      return;
    }
    samplingVelocity = true;
    try {
      const raw = await renderer.getArrayBufferAsync(simulation.velocityBuffer.value);
      const floats = new Float32Array(raw);
      // OJO: en WGSL un vec3 se alinea a 16 bytes, así que el buffer avanza de
      // 4 en 4 floats por partícula, no de 3 en 3. Leerlo con paso 3 desalinea
      // las componentes y da un promedio falso.
      const stride = floats.length / simulation.count;
      let sum = 0;
      // Las partículas vivas ocupan siempre los primeros slots del anillo.
      for (let i = 0; i < aliveCount; i++) {
        const vx = floats[i * stride];
        const vy = floats[i * stride + 1];
        const vz = floats[i * stride + 2];
        sum += Math.sqrt(vx * vx + vy * vy + vz * vz);
      }
      scope.push(sum / aliveCount);
    } finally {
      samplingVelocity = false;
    }
  }
  setInterval(sampleAverageSpeed, 150);

  // LIVE INSTRUMENT MAPPING FOR LesAlpx ------------------------------------
  // Pocos controles con significado: D dibuja la condición inicial, los
  // números conducen las capas de fuerza, 0 devuelve la figura a su estado
  // dibujado y R vuelve al estado inicial de cero partículas.
  addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'KeyD') setDrawMode(!drawMode);
    if (event.code === 'KeyP') setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB');
    if (event.code === 'KeyR') resetAll();
    if (event.code === 'Digit0') simulation.restoreFigure();

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

  resetAll();

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
