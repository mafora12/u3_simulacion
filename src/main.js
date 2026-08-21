import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './styles.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';
import { createOscilloscope } from './ui/oscilloscope.js';

// LÍMITE DE PARTÍCULAS ----------------------------------------------------
// Es un límite duro, no una sugerencia: el buffer de la GPU se reserva con
// este tamaño exacto y el pincel escribe en un ANILLO, así que al llegar al
// tope los tramos más antiguos ceden su sitio a los nuevos. Nunca hay más de
// PARTICLE_COUNT vivas, por mucho que sigas dibujando.
//
// Antes eran 131072 (2^17). El número existía pero era tan alto que en la
// práctica no se percibía ningún límite: se podía dibujar indefinidamente y la
// figura seguía acumulando. Con 65536 el tope se alcanza en 256 tramos, que es
// una figura larga pero acotada, y el contador del HUD lo hace explícito.
//
// Debe ser múltiplo de STAMP_SIZE para que el anillo nunca parta un tramo en
// dos (ver la comprobación en createSimulation).
const PARTICLE_COUNT = 65536; // 2^16 = 256 tramos de 256 partículas.

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

// CONDICIONES PARA QUE UNA CAPA SUENE ------------------------------------
// Encender el interruptor de una capa NO basta para que empuje. El shader
// multiplica tres cosas, y si cualquiera vale cero la fuerza es cero:
//
//     fuerza = magnitud_de_la_capa × interruptor × intensity      (y dt = dt × timeScale)
//
// En LAB eso nunca se nota porque cada tecla pasa por `allLayersOff()`, que
// devuelve `intensity` a 1, y por `applyPreset()`, que fija la magnitud de la
// capa aislada. En PERFORMANCE no había nada equivalente: la tecla solo movía
// el interruptor, así que con `intensity` o la magnitud en cero la capa
// quedaba muda. Ver el bug documentado junto a `engageLayer`.
//
// Estos son los valores de reposo con los que se devuelve la voz a una capa
// que entra en silencio. Coinciden con los de `parameters.js`.
const DEFAULT_ATTRACT_STRENGTH = 6.0;
const DEFAULT_REPEL_STRENGTH = 18.0;
const DEFAULT_DRAG_COEFFICIENT = 0.12;
const DEFAULT_GRAVITY_STRENGTH = 1.2;
const DEFAULT_INTENSITY = 1;
const DEFAULT_TIME_SCALE = 1;

// Qué uniform lleva la magnitud de cada capa, y con qué valor revive si está
// en cero. La tabla existe para que añadir una capa no obligue a tocar la
// lógica de encendido: basta con describirla aquí.
const LAYER_MAGNITUDES = Object.freeze({
  attractEnabled: { uniform: 'attractStrength', fallback: DEFAULT_ATTRACT_STRENGTH },
  repelEnabled: { uniform: 'repelStrength', fallback: DEFAULT_REPEL_STRENGTH },
  dragEnabled: { uniform: 'dragCoefficient', fallback: DEFAULT_DRAG_COEFFICIENT },
  gravityEnabled: { uniform: 'gravityStrength', fallback: DEFAULT_GRAVITY_STRENGTH }
});

const isSilent = (value) => value === 0;

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
  // El botón IZQUIERDO queda libre para el instrumento —dibujar la figura y
  // arrastrar el punto de fuerza—, que es lo que se conduce durante la pieza.
  // La órbita pasa al derecho: se usa para encuadrar antes de tocar, no
  // mientras se toca. Compartir el izquierdo era justo lo que impedía guiar el
  // atractor: al arrastrarlo, la cámara giraba y el plano de trabajo se movía
  // debajo del gesto.
  orbit.mouseButtons = {
    LEFT: null,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE
  };
  // OrbitControls ya suprime el menú contextual, pero solo mientras está
  // habilitado — y en PERFORMANCE está apagado. Sin esto, un clic derecho en
  // mitad de la interpretación abriría el menú del navegador encima de la obra.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  const params = createParameters();
  const simulation = createSimulation({
    renderer,
    scene,
    params,
    count: PARTICLE_COUNT,
    stampSize: STAMP_SIZE
  });

  // LAB HELPERS -----------------------------------------------------------
  // El marcador del atractor no es solo un adorno de LAB: es la ÚNICA pista
  // visual de hacia dónde tiran la atracción y la repulsión. Antes se ocultaba
  // en PERFORMANCE, y sin él el gesto de conducir el campo con el puntero era
  // invisible: se veía a las partículas moverse, pero no hacia qué. Ahora
  // también aparece en PERFORMANCE mientras alguna de las dos fuerzas radiales
  // esté activa, y cambia de color para decir cuál de las dos manda.
  const ATTRACTOR_COLORS = {
    attract: new THREE.Color('#7fd4ff'),  // frío: recoge
    repel: new THREE.Color('#ff9a5a'),    // cálido: expulsa
    idle: new THREE.Color('#ffffff')
  };
  const attractorHelper = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshBasicMaterial({ color: ATTRACTOR_COLORS.idle })
  );
  scene.add(attractorHelper);
  const axes = new THREE.AxesHelper(1.5);
  scene.add(axes);

  // El HUD tiene dos partes separadas a propósito. La leyenda de teclas solo
  // cambia cuando cambia un modo, y se reescribe con innerHTML. El contador de
  // partículas cambia constantemente mientras dibujas, así que vive en su
  // propio nodo y se actualiza con textContent: reescribir todo el innerHTML
  // en cada frame para mover un número sería tirar trabajo a la basura.
  const hud = document.createElement('div');
  hud.className = 'hud';
  const hudKeys = document.createElement('div');
  const hudMeter = document.createElement('div');
  hudMeter.className = 'hud-meter';
  hud.append(hudKeys, hudMeter);
  document.body.append(hud);

  let shownAlive = -1;
  function updateParticleMeter() {
    const alive = simulation.getAliveCount();
    if (alive === shownAlive) return;   // nada que redibujar
    shownAlive = alive;
    const pct = Math.round((alive / PARTICLE_COUNT) * 100);
    hudMeter.textContent =
      `partículas ${alive.toLocaleString('es')} / ${PARTICLE_COUNT.toLocaleString('es')} (${pct}%)`;
  }

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
  // `guidingAttractor`: el botón izquierdo está pulsado y arrastrando el punto
  // de fuerza. Se declara aquí, junto al resto del estado de interacción,
  // porque el bucle de render lo consulta para mostrar el marcador.
  let guidingAttractor = false;
  let panel;
  // ¿Está el campo radial invertido ahora mismo por tener el espacio pulsado?
  // Hace falta recordarlo para deshacer el intercambio exactamente una vez al
  // soltar, y no volver a invertir si llega un keyup suelto.
  let radialSwapped = false;

  // Vectores reutilizables del trazo. Se declaran una sola vez porque los
  // eventos de puntero llegan decenas de veces por segundo y crear objetos en
  // ese camino genera basura innecesaria.
  const lastStamp = new THREE.Vector3();   // final del último tramo emitido
  const segmentStart = new THREE.Vector3();
  const segmentEnd = new THREE.Vector3();
  let hasLastStamp = false;                // ¿hay ya un punto previo con el que formar tramo?

  // En PERFORMANCE el panel está oculto, así que el HUD es la ÚNICA ventana al
  // estado del instrumento. Sin esta línea, una capa encendida pero muda (por
  // `intensity` en cero, el bug de las teclas 1–5) es indistinguible de una
  // capa apagada: el intérprete pulsa, no pasa nada, y no tiene forma de saber
  // por qué. Mostrar interruptores e `intensity` hace visible la causa.
  const layerStatusLine = () => {
    const chips = Object.entries(LAYER_KEYS)
      .map(([code, layer]) => {
        const digit = code.replace('Digit', '');
        const on = params[layer.enabled].value > 0;
        return `${digit} ${layer.label} ${on ? '●' : '○'}`;
      })
      .join(' · ');
    return `${chips} · intensidad ${params.intensity.value.toFixed(2)}`;
  };

  function updateHud() {
    const draw = drawMode
      ? '<strong>DIBUJO</strong>: arrastra para trazar · D: salir'
      : 'D: dibujar figura · <strong>arrastra</strong> para llevar el punto de fuerza';
    hudKeys.innerHTML = mode === 'LAB'
      ? `<strong>LAB</strong> · ${draw} · 1–4: aislar fuerza · 0: restaurar figura · R: reset (cero partículas) · P: performance · botón derecho: orbitar`
      : `<strong>PERFORMANCE</strong> · ${draw} · 1–4: fuerzas dentro/fuera · 5: todas · 0: restaurar figura · espacio: invertir radial · rueda: intensidad
         <br>${layerStatusLine()}`;
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
    // `grab` anuncia que fuera del modo dibujo el botón izquierdo agarra y
    // arrastra el punto de fuerza. Sin esa pista, el gesto no se descubre.
    canvas.style.cursor = drawMode ? 'crosshair' : 'grab';
    panel?.setDrawMode(drawMode);
    updateHud();
  };

  const setMode = (next) => {
    mode = next;
    const lab = mode === 'LAB';
    panel?.setVisible(lab);
    axes.visible = lab;
    // La condición se repite aquí y en setDrawMode porque cualquiera de los dos
    // interruptores puede cambiar y ambos mandan sobre lo mismo: la órbita solo
    // está viva en LAB y fuera del modo dibujo.
    orbit.enabled = lab && !drawMode;
    updateHud();
  };

  // El marcador del atractor depende de cuatro cosas que cambian por caminos
  // distintos (modo, modo dibujo y los dos interruptores radiales). En vez de
  // repetir la regla en cada uno de esos sitios —que es como se desincronizan—
  // se resuelve en un único lugar, una vez por frame, desde el bucle de render.
  function updateAttractorHelper() {
    const attracting = params.attractEnabled.value > 0;
    const repelling = params.repelEnabled.value > 0;
    // Mientras dibujas el puntero es pincel, no atractor: ahí siempre se oculta.
    // Y mientras lo arrastras siempre se ve, aunque no haya fuerza radial
    // encendida: no se puede colocar a ciegas un punto que no se ve.
    attractorHelper.visible =
      !drawMode && (mode === 'LAB' || attracting || repelling || guidingAttractor);

    // Si las dos están activas manda la que domina a la distancia del propio
    // marcador... que es cero, así que de cerca siempre gana la repulsión.
    let tint = ATTRACTOR_COLORS.idle;
    if (repelling) tint = ATTRACTOR_COLORS.repel;
    else if (attracting) tint = ATTRACTOR_COLORS.attract;
    attractorHelper.material.color.copy(tint);
  }

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

  // CONDUCIR EL PUNTO DE FUERZA -------------------------------------------
  // Antes el atractor iba pegado al puntero en todo momento, sin pulsar nada, y
  // eso hacía imposible conducirlo por dos motivos:
  //
  //   · No se podía APARCAR. Cualquier movimiento de la mano —ir a pulsar una
  //     tecla, apartarse de la pantalla— arrastraba el punto de fuerza con él.
  //   · En LAB, arrastrar para llevarlo giraba además la cámara, porque el
  //     botón izquierdo era el de órbita. Y como el plano de trabajo se calcula
  //     con la dirección de la cámara, al girar la vista el punto se recalculaba
  //     contra una referencia en movimiento: se iba solo mientras lo movías.
  //
  // Ahora el atractor es un OBJETO que se agarra y se suelta: se arrastra con el
  // botón izquierdo y se queda donde lo dejes. La órbita se movió al botón
  // derecho (ver `orbit.mouseButtons`), así que los dos gestos ya no compiten.

  // El punto solo tiene sentido dentro de la zona donde las partículas pueden
  // estar. El encuadre es más ancho que esa zona (los bordes de pantalla caen
  // en x ≈ ±7.7), así que sin acotarlo se podía arrastrar el atractor a un sitio
  // al que la contención no deja llegar a ninguna partícula: tiraba de ellas
  // hacia fuera y se quedaban amontonadas contra el borde, sin alcanzarlo nunca.
  // Se acota al radio de contención, que es exactamente hasta dónde llega el
  // mundo habitable.
  const attractorLimit = params.containRadius.value;
  const clampToBounds = (v) => {
    if (v.length() > attractorLimit) v.setLength(attractorLimit);
    return v;
  };

  const moveAttractorTo = (event) => {
    if (!pointerToWorld(event, hit)) return;
    clampToBounds(hit);
    params.attractor.value.copy(hit);
    attractorHelper.position.copy(hit);
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (drawMode || event.button !== 0) return;
    event.preventDefault();
    // La captura mantiene el gesto vivo aunque el puntero salga del canvas o
    // pase por encima del panel, igual que en el pincel.
    canvas.setPointerCapture(event.pointerId);
    guidingAttractor = true;
    canvas.style.cursor = 'grabbing';
    moveAttractorTo(event);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!guidingAttractor) return;
    moveAttractorTo(event);
  });

  const endGuide = (event) => {
    if (!guidingAttractor) return;
    guidingAttractor = false;
    canvas.style.cursor = drawMode ? 'crosshair' : 'grab';
    if (event && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener('pointerup', endGuide);
  canvas.addEventListener('pointercancel', endGuide);

  // Identidad de capa: mismo número en LAB (prueba aislada, sobre la figura
  // restaurada) y en PERFORMANCE (encendido/apagado en vivo) para la misma capa.
  const LAYER_KEYS = {
    Digit1: { id: 'atraccion', enabled: 'attractEnabled', label: 'Atracción' },
    Digit2: { id: 'repulsion', enabled: 'repelEnabled', label: 'Repulsión' },
    Digit3: { id: 'friccion', enabled: 'dragEnabled', label: 'Fricción' },
    Digit4: { id: 'gravedad', enabled: 'gravityEnabled', label: 'Gravedad' }
  };

  // Deja el sistema en silencio físico: ninguna fuerza y nacimiento en reposo.
  // Es el punto de partida común de todas las pruebas y del reset.
  const allLayersOff = () => {
    for (const layer of Object.values(LAYER_KEYS)) params[layer.enabled].value = 0;
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
    } else if (id === 'atraccion') {
      params.attractEnabled.value = 1;
      params.attractStrength.value = 8.0;
    } else if (id === 'repulsion') {
      params.repelEnabled.value = 1;
      params.repelStrength.value = 22.0;
    } else if (id === 'friccion') {
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = 0.5;
      // La fricción es un freno: sobre una figura en reposo no se vería nada.
      // Nacen en movimiento justamente para poder observar cómo las frena.
      params.initialSpeed.value = 1.0;
    } else if (id === 'gravedad') {
      params.gravityEnabled.value = 1;
      params.gravityStrength.value = DEFAULT_GRAVITY_STRENGTH;
    } else if (id === 'todas') {
      // Atracción y repulsión juntas se equilibran en un radio (ver el comentario
      // del shader): la figura se ordena en una cáscara alrededor del atractor.
      // La gravedad la arrastra hacia abajo y la fricción impide que la mezcla
      // se dispare, de modo que el conjunto se estabiliza en vez de explotar.
      params.attractEnabled.value = 1;
      params.attractStrength.value = DEFAULT_ATTRACT_STRENGTH;
      params.repelEnabled.value = 1;
      params.repelStrength.value = DEFAULT_REPEL_STRENGTH;
      params.dragEnabled.value = 1;
      params.dragCoefficient.value = DEFAULT_DRAG_COEFFICIENT;
      params.gravityEnabled.value = 1;
      params.gravityStrength.value = 0.6;
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

  // BUG (teclas 1–5 mudas en PERFORMANCE): pulsar una tecla de capa marcaba su
  // interruptor pero no movía ni una partícula. La causa no era el interruptor
  // sino los DOS multiplicadores globales que el shader aplica encima de él:
  //
  //   · `intensity` — la rueda del ratón lo conduce en vivo y llega hasta 0.
  //     Con 0, atracción, repulsión y gravedad empujan con fuerza cero. Es el
  //     caso más fácil de provocar sin darse cuenta: la rueda está anunciada en
  //     el HUD de PERFORMANCE y el panel (que mostraría el valor) está oculto ahí.
  //   · `timeScale` — multiplica dt. Con 0 el sistema entero queda congelado,
  //     por muchas capas encendidas que haya.
  //
  // Y encima de eso, la magnitud propia de la capa también puede estar en cero
  // si se baja su slider a 0 en LAB.
  //
  // En LAB nada de esto se nota porque cada tecla pasa por `allLayersOff()`,
  // que devuelve `intensity` a 1, y por `applyPreset()`, que fija la magnitud
  // de la capa. Ese es exactamente el motivo de que "las teclas funcionen en el
  // editor pero no en performance": no era el modo, era que solo LAB
  // restablecía las condiciones para que una capa se oiga.
  //
  // `engageLayer` las restablece las tres al ENCENDER, y solo cuando están en
  // el valor degenerado (cero): si el intérprete dejó `intensity` en 0.3 o
  // subió `attractStrength` a 6, se respeta su elección. Así una tecla suena
  // siempre, sin importar qué se haya pulsado o girado antes.
  const engageLayer = (enabledKey) => {
    params[enabledKey].value = 1;

    const magnitude = LAYER_MAGNITUDES[enabledKey];
    const uniform = params[magnitude.uniform];
    if (isSilent(uniform.value)) uniform.value = magnitude.fallback;

    if (params.intensity.value === 0) params.intensity.value = DEFAULT_INTENSITY;
    if (params.timeScale.value === 0) params.timeScale.value = DEFAULT_TIME_SCALE;
  };

  // Apagar una fuerza no frena nada por sí solo: lo que ya se movía sigue
  // moviéndose (primera ley de Newton). Con la gravedad eso se notaba como un
  // fallo: quitarla dejaba las partículas cayendo para siempre con la velocidad
  // ya acumulada, reapareciendo por arriba una y otra vez por el wrap
  // periódico. Como gesto de instrumento, apagar la gravedad tiene que
  // significar "deja de caer", así que al soltarla se frena el sistema en seco.
  //
  // Se hace solo con la gravedad y con el apagado general (tecla 5). Quitar
  // atracción, repulsión o fricción sigue dejando que el sistema siga su curso
  // por inercia, que es la prueba de Inercia documentada y una herramienta
  // expresiva: soltar la atracción y ver salir la figura disparada.
  const HALTS_ON_RELEASE = 'gravityEnabled';

  // PERFORMANCE: entra/sale una capa de la mezcla sin resetear el sistema -
  // el comportamiento debe seguir emergiendo de las condiciones actuales,
  // no de un corte a un estado inicial.
  const toggleLayer = (enabledKey) => {
    const wasOn = params[enabledKey].value > 0;
    if (wasOn) {
      params[enabledKey].value = 0;
      if (enabledKey === HALTS_ON_RELEASE) simulation.halt();
    } else {
      engageLayer(enabledKey);
    }
    panel?.refresh();
    updateHud();
  };

  const toggleAllLayers = () => {
    const keys = Object.values(LAYER_KEYS).map((l) => l.enabled);
    const allOn = keys.every((k) => params[k].value > 0);
    for (const k of keys) {
      if (allOn) params[k].value = 0;
      else engageLayer(k);
    }
    // Apagarlo todo debe dejar el sistema quieto de verdad, no a la deriva.
    if (allOn) simulation.halt();
    panel?.refresh();
    updateHud();
  };

  // Intercambia atracción y repulsión: el gesto de la barra espaciadora.
  // Si ninguna de las dos estaba encendida no habría nada que intercambiar y el
  // gesto quedaría mudo, así que en ese caso entra la repulsión — un empujón
  // hacia fuera es la lectura más natural de "invertir la nada".
  const swapRadialLayers = () => {
    const attracting = params.attractEnabled.value > 0;
    const repelling = params.repelEnabled.value > 0;

    if (!attracting && !repelling) {
      engageLayer('repelEnabled');
    } else {
      params.attractEnabled.value = 0;
      params.repelEnabled.value = 0;
      if (attracting) engageLayer('repelEnabled');
      if (repelling) engageLayer('attractEnabled');
    }
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

    // Espacio invierte el campo radial mientras se mantiene pulsado: lo que
    // atraía repele y al revés. Antes esto cambiaba el signo de una única
    // fuerza radial; ahora que atracción y repulsión son dos capas distintas,
    // invertir es intercambiarlas.
    if (event.code === 'Space') {
      event.preventDefault();
      swapRadialLayers();
      radialSwapped = true;
      updateHud();
    }
  });

  addEventListener('keyup', (event) => {
    if (event.code === 'Space' && radialSwapped) {
      swapRadialLayers();
      radialSwapped = false;
      updateHud();
    }
  });

  // Rueda: macro de intensidad en vivo, cuánto empujan las capas activas.
  // El HUD se refresca aquí porque este es el control que puede dejar todas las
  // capas mudas (intensidad 0) sin tocar ningún interruptor: si el número no se
  // actualizara en pantalla, el silencio volvería a ser inexplicable.
  addEventListener('wheel', (event) => {
    const next = params.intensity.value - Math.sign(event.deltaY) * 0.05;
    params.intensity.value = Math.min(2, Math.max(0, next));
    panel?.refresh();
    updateHud();
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
    updateAttractorHelper();
    updateParticleMeter();
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
