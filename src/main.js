import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';
import { createOscilloscope } from './ui/oscilloscope.js';

const PARTICLE_COUNT = 131072; // 2^17. Increase only after measuring performance.

// PINCEL: constantes del trazo -------------------------------------------
// El pincel no coloca partículas de una en una: cada movimiento del puntero
// emite un TRAMO (un segmento recto entre la posición anterior y la actual) y
// las partículas se reparten a lo largo de él. Esto tiene dos ventajas: el
// trazo no deja huecos aunque muevas el puntero rápido, y cada tramo cuesta
// un solo dispatch de compute en vez de uno por punto interpolado.
const STAMP_SIZE = 256;        // partículas que nacen por tramo
const MIN_SEGMENT = 0.015;     // umbral: por debajo de esto el puntero "no se movió"
const MAX_SEGMENT = 0.5;       // largo máximo de un tramo, en unidades de mundo.
                               // Un trazo más largo se parte en varios tramos para
                               // que la densidad de partículas no caiga al trazar rápido.

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
  // El puntero vive en 2D (píxeles de pantalla) y la simulación en 3D, así que
  // hay que proyectar: se lanza un rayo desde la cámara a través del puntero y
  // se corta contra un plano de trabajo.
  //
  // Ese plano se recalcula en cada consulta para que su normal sea la dirección
  // de la cámara, es decir, para que SIEMPRE mire de frente al observador. Si en
  // vez de eso se usara un plano fijo (por ejemplo Z=0), al orbitar la vista el
  // trazo saldría deformado por la perspectiva, y visto de canto sería
  // imposible dibujar. Con el plano orientado a cámara, lo que trazas en
  // pantalla es lo que aparece, hayas orbitado o no.
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const workPlane = new THREE.Plane();
  const planeNormal = new THREE.Vector3();
  const ORIGIN = new THREE.Vector3(0, 0, 0);
  const hit = new THREE.Vector3();

  // Devuelve la posición de mundo bajo el puntero, o null si no hay corte.
  // Escribe en `out` para no crear un Vector3 nuevo en cada evento de puntero.
  function pointerToWorld(event, out) {
    // Coordenadas normalizadas de dispositivo: pantalla -> [-1, 1], con Y hacia arriba.
    pointerNdc.x = (event.clientX / innerWidth) * 2 - 1;
    pointerNdc.y = -(event.clientY / innerHeight) * 2 + 1;
    camera.getWorldDirection(planeNormal);
    workPlane.setFromNormalAndCoplanarPoint(planeNormal, ORIGIN);
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.ray.intersectPlane(workPlane, out) ? out : null;
  }

  let paused = false;
  let mode = 'LAB';
  // `drawMode`: el puntero es un pincel y la órbita está bloqueada.
  // `drawing`: además, el botón está pulsado ahora mismo (trazo en curso).
  // Son estados distintos: puedes estar en modo dibujo sin estar trazando.
  let drawMode = false;
  let drawing = false;
  let panel;
  let savedRadialStrength = params.radialStrength.value;

  // Vectores reutilizables del trazo. Se declaran una sola vez porque los
  // eventos de puntero llegan decenas de veces por segundo y crear objetos en
  // ese camino genera basura innecesaria.
  const lastStamp = new THREE.Vector3();   // final del último tramo emitido
  const segmentStart = new THREE.Vector3();
  const segmentEnd = new THREE.Vector3();
  let hasLastStamp = false;                // ¿hay ya un punto previo con el que formar tramo?

  function updateHud() {
    const draw = drawMode
      ? '<strong>DIBUJO</strong>: arrastra para trazar · D: salir'
      : 'D: dibujar figura';
    hud.innerHTML = mode === 'LAB'
      ? `<strong>LAB</strong> · ${draw} · 1–4: aislar capa · 0: restaurar figura · R: reset (cero partículas) · P: performance`
      : `<strong>PERFORMANCE</strong> · ${draw} · 1–4: capas dentro/fuera · 5: todas · 0: restaurar figura · espacio: invertir núcleo · rueda: intensidad`;
  }

  // MODO DIBUJO ------------------------------------------------------------
  // El puntero no puede servir para dos cosas a la vez. Sin un interruptor
  // explícito, arrastrar giraría la cámara y trazaría al mismo tiempo, y la
  // figura saldría deformada porque el plano de trabajo se mueve mientras
  // dibujas. Por eso el modo dibujo es un estado con tecla propia (D) que
  // desactiva OrbitControls: mientras dibujas el puntero es pincel; al salir,
  // vuelve a ser cámara y atractor.
  const setDrawMode = (active) => {
    drawMode = active;
    // Cortar cualquier trazo a medias al cambiar de modo, para no unir por
    // error el final de un trazo con el principio del siguiente.
    drawing = false;
    hasLastStamp = false;
    orbit.enabled = !drawMode && mode === 'LAB';
    // El helper del atractor se oculta al dibujar: ahí el puntero no lo controla.
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
    // Las dos condiciones se repiten aquí y en setDrawMode porque cualquiera de
    // los dos interruptores puede cambiar y ambos mandan sobre lo mismo: la
    // órbita solo está viva en LAB y fuera del modo dibujo.
    attractorHelper.visible = lab && !drawMode;
    orbit.enabled = lab && !drawMode;
    updateHud();
  };

  // Continúa el trazo hasta `target`, emitiendo uno o varios tramos.
  function strokeTo(target) {
    // Primer punto del trazo: no hay tramo todavía, así que se emite un sello
    // puntual (origen y destino coinciden) que actúa como punto de partida.
    if (!hasLastStamp) {
      simulation.stamp(target);
      lastStamp.copy(target);
      hasLastStamp = true;
      return;
    }

    // Si el puntero apenas se movió, no se emite nada: evita amontonar miles de
    // partículas en el mismo sitio cuando la mano tiembla o el puntero se para.
    const distance = target.distanceTo(lastStamp);
    if (distance < MIN_SEGMENT) return;

    // Un salto grande (puntero rápido, o el navegador agrupando eventos) se
    // parte en varios tramos de MAX_SEGMENT como mucho. Sin esto, las mismas
    // STAMP_SIZE partículas tendrían que cubrir una distancia enorme y el trazo
    // se vería punteado. El tope de 16 evita que un salto extremo dispare
    // decenas de dispatches en un solo evento.
    const steps = Math.min(Math.ceil(distance / MAX_SEGMENT), 16);
    segmentStart.copy(lastStamp);
    for (let s = 1; s <= steps; s++) {
      segmentEnd.lerpVectors(lastStamp, target, s / steps);
      simulation.stamp(segmentStart, segmentEnd);
      segmentStart.copy(segmentEnd);
    }
    lastStamp.copy(target);
  }

  // Los eventos del pincel van en el canvas, no en window: así el panel de
  // control queda por encima y hacer clic en un slider no dibuja detrás.
  canvas.addEventListener('pointerdown', (event) => {
    if (!drawMode) return;
    event.preventDefault();
    // La captura mantiene el trazo vivo aunque el puntero salga del canvas:
    // sin ella, arrastrar fuera de la ventana cortaría la figura a media línea.
    canvas.setPointerCapture(event.pointerId);
    drawing = true;
    hasLastStamp = false;
    if (pointerToWorld(event, hit)) strokeTo(hit);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drawMode || !drawing) return;
    if (pointerToWorld(event, hit)) strokeTo(hit);
  });

  // Fin del trazo. `pointercancel` importa tanto como `pointerup`: el navegador
  // lo dispara si el sistema se queda el gesto (por ejemplo un scroll táctil),
  // y sin manejarlo el trazo quedaría abierto para siempre.
  const endStroke = (event) => {
    if (!drawing) return;
    drawing = false;
    hasLastStamp = false;
    if (event && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    updateHud();
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  // Fuera del modo dibujo el puntero recupera su función original: conducir
  // dónde se ancla la capa Núcleo. Este listener va en window (no en el canvas)
  // porque el atractor debe seguir al puntero también sobre el panel.
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

  // Deja el sistema en silencio físico: ninguna fuerza y nacimiento en reposo.
  // Es el punto de partida común de todas las pruebas y del reset.
  const allLayersOff = () => {
    params.windEnabled.value = 0;
    params.radialEnabled.value = 0;
    params.vortexEnabled.value = 0;
    params.dragEnabled.value = 0;
    params.wind.value.set(0, 0, 0);
    params.initialSpeed.value = 0;
    params.intensity.value = 1;
  };

  // Pruebas de LAB: aíslan una capa y devuelven la figura a su estado dibujado.
  //
  // CAMBIO IMPORTANTE respecto al proyecto base: antes cada prueba llamaba a
  // `reset()`, que re-sembraba una nube aleatoria. Eso ahora borraría tu figura.
  // En su lugar se llama a `restoreFigure()`, que reconstruye exactamente el
  // trazo que dibujaste. Así las seis pruebas parten de la MISMA condición
  // inicial y sus resultados son comparables entre sí: si la figura se comporta
  // distinto, es por la capa, no por haber empezado de otro sitio.
  const applyPreset = (id) => {
    allLayersOff();

    // Ojo con el orden: `initialSpeed` se lee al NACER cada partícula, así que
    // debe quedar fijado antes del restoreFigure() del final.
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
      // La fricción es un freno: sobre una figura en reposo no se vería nada.
      // Nacen en movimiento justamente para poder observar cómo las frena.
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
  //
  // Este es el "reset" que pide el encargo, y es más fuerte que el del proyecto
  // base: aquel re-sembraba una nube aleatoria, este deja el lienzo vacío y
  // además OLVIDA la figura. Para volver a la figura sin perderla está la tecla
  // 0 (restoreFigure), que es otra operación distinta.
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

  // Estado inicial de la interfaz. `setDrawMode(false)` no es redundante con el
  // valor inicial de la variable: es lo que sincroniza el cursor, el botón del
  // panel y el HUD con ese valor.
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
    // Sin partículas no hay nada que promediar, y dividir por cero daría NaN,
    // que rompería el trazado del osciloscopio.
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
    // `repeat` descarta la repetición automática al mantener pulsada una tecla:
    // sin esto, dejar la D apretada haría parpadear el modo dibujo.
    if (event.repeat) return;
    if (event.code === 'KeyD') setDrawMode(!drawMode);
    if (event.code === 'KeyP') setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB');
    if (event.code === 'KeyR') resetAll();
    // 0 funciona en los dos modos: en LAB para repetir una prueba desde la misma
    // condición inicial, en PERFORMANCE como gesto en vivo (recomponer la figura).
    if (event.code === 'Digit0') simulation.restoreFigure();

    // Las cuatro teclas de fuerza que pide el encargo. El mismo número señala
    // siempre la misma capa; lo que cambia es qué significa pulsarlo:
    //   LAB          -> aislar esa capa y restaurar la figura (verificar).
    //   PERFORMANCE  -> meterla o sacarla de la mezcla sin cortar el sistema.
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
