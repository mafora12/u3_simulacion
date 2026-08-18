import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  color,
  float,
  hash,
  instanceIndex,
  instancedArray,
  max,
  mix,
  mod,
  step,
  uint,
  uv,
  vec3,
  vec4
} from 'three/tsl';

export function createSimulation({ renderer, scene, params, count = 131072, stampSize = 256 }) {
  // El buffer en GPU es de tamaño fijo, pero el sistema arranca en CERO
  // partículas: lo que crece al dibujar es cuántos slots están ocupados.
  // Cada pincelada ocupa un bloque exacto de `stampSize` slots, así que el
  // cursor nunca parte un bloque en dos y no hace falta envolverlo en la GPU.
  if (count % stampSize !== 0) {
    throw new Error(`count (${count}) debe ser múltiplo de stampSize (${stampSize}).`);
  }
  const maxStamps = count / stampSize;

  // STATE -----------------------------------------------------------------
  // Cada partícula tiene posición, velocidad y un flag de si está viva.
  const positionBuffer = instancedArray(count, 'vec3');
  const velocityBuffer = instancedArray(count, 'vec3');
  const aliveBuffer = instancedArray(count, 'float');

  // CLEAR -----------------------------------------------------------------
  // Estado inicial real del instrumento: ninguna partícula existe.
  const clearParticles = Fn(() => {
    positionBuffer.element(instanceIndex).assign(vec3(0.0));
    velocityBuffer.element(instanceIndex).assign(vec3(0.0));
    aliveBuffer.element(instanceIndex).assign(float(0.0));
  })().compute(count).setName('Clear Particles');

  // SPAWN / PINCEL --------------------------------------------------------
  // Un sello del pincel: nacen `stampSize` partículas repartidas a lo largo
  // del segmento trazado. Esto escribe la CONDICIÓN INICIAL, no una
  // trayectoria: la velocidad de nacimiento es `initialSpeed` (0 por defecto,
  // es decir, la figura se queda quieta hasta que actúa una fuerza).
  const spawnSegment = Fn(() => {
    const i = params.spawnCursor.add(instanceIndex);
    const seed = i.add(params.spawnSeed);

    const r1 = hash(seed.add(uint(11)));
    const r2 = hash(seed.add(uint(23)));
    const r3 = hash(seed.add(uint(37)));
    const r4 = hash(seed.add(uint(53)));
    const r5 = hash(seed.add(uint(71)));
    const r6 = hash(seed.add(uint(89)));
    const r7 = hash(seed.add(uint(101)));

    // Reparto estratificado sobre el tramo: una partícula por franja, con
    // desplazamiento aleatorio dentro de ella, para que no queden peines.
    const t = instanceIndex.toFloat().add(r1).div(float(stampSize));
    const center = mix(params.brushFrom, params.brushTo, t);

    // Dispersión dentro del radio del pincel, para que el trazo tenga grosor.
    const jitter = vec3(r2, r3, r4).sub(0.5).mul(2.0).mul(params.brushRadius);

    positionBuffer.element(i).assign(center.add(jitter));
    velocityBuffer.element(i).assign(vec3(r5, r6, r7).sub(0.5).mul(params.initialSpeed));
    aliveBuffer.element(i).assign(float(1.0));
  })().compute(stampSize).setName('Spawn Brush Segment');

  // NUBE DE PRUEBA --------------------------------------------------------
  // Estado inicial reproducible para verificar una fuerza en LAB sin depender
  // de una figura dibujada a mano (que nunca sale igual dos veces).
  const seedCloudParticles = Fn(() => {
    const i = instanceIndex;
    const p = positionBuffer.element(i);
    const v = velocityBuffer.element(i);

    const r1 = hash(i.add(uint(11)));
    const r2 = hash(i.add(uint(23)));
    const r3 = hash(i.add(uint(37)));
    const r4 = hash(i.add(uint(53)));
    const r5 = hash(i.add(uint(71)));
    const r6 = hash(i.add(uint(89)));

    p.assign(vec3(r1, r2, r3).sub(0.5).mul(params.boundsSize.mul(0.45)));
    v.assign(vec3(r4, r5, r6).sub(0.5).mul(params.initialSpeed));
    aliveBuffer.element(i).assign(float(1.0));
  })().compute(count).setName('Seed Test Cloud');

  // UPDATE / COMPUTE SHADER ----------------------------------------------
  // This is the conceptual heart of the project:
  // state -> forces -> acceleration -> velocity -> position.
  const updateParticles = Fn(() => {
    const p = positionBuffer.element(instanceIndex);
    const v = velocityBuffer.element(instanceIndex);
    const alive = aliveBuffer.element(instanceIndex);

    // Los slots vacíos no se integran: no existen todavía.
    If(alive.greaterThan(0.5), () => {
      const dt = params.dt.mul(params.timeScale);
      const force = vec3(0.0).toVar();

      // 1) CAPA "Textura" (viento): una capa que empuja el campo en una
      // dirección, como un pad o una capa sostenida entrando en la mezcla.
      force.addAssign(params.wind.mul(params.windEnabled).mul(params.intensity));

      // 2) CAPA "Núcleo" (radial, positivo = atracción, negativo = repulsión):
      // el elemento que ancla el campo, como una raíz de bajo.
      const toAttractor = params.attractor.sub(p);
      const distance = max(toAttractor.length(), params.softening);
      const radialDirection = toAttractor.div(distance);
      const radialForce = radialDirection
        .mul(params.radialStrength)
        .div(distance.pow(2))
        .mul(params.radialEnabled)
        .mul(params.intensity);
      force.addAssign(radialForce);

      // 3) CAPA "Pulso" (vórtice, tangente a la dirección radial en Z): el
      // arpegio/motorik que hace girar el campo alrededor del núcleo.
      const zAxis = vec3(0.0, 0.0, 1.0);
      const tangent = zAxis.cross(radialDirection);
      force.addAssign(tangent.mul(params.vortexStrength).mul(params.vortexEnabled).mul(params.intensity));

      // 4) CAPA "Fricción" (drag, F = -c v): ruido/distorsión que resta
      // energía al sistema. No se escala por intensity - es un freno, no un
      // empuje, y debe poder frenar el sistema incluso cuando intensity es alta.
      force.addAssign(v.mul(params.dragCoefficient).mul(params.dragEnabled).mul(-1.0));

      // INTEGRATION -------------------------------------------------------
      // Unit mass: a = F. Semi-implicit Euler: update v, then p.
      v.addAssign(force.mul(dt));

      const speed = v.length();
      If(speed.greaterThan(params.maxSpeed), () => {
        v.assign(v.normalize().mul(params.maxSpeed));
      });

      p.addAssign(v.mul(dt));

      // Periodic boundary conditions: particles leaving one side re-enter.
      const half = params.boundsSize.mul(0.5);
      p.assign(mod(p.add(half), params.boundsSize).sub(half));
    });
  })().compute(count).setName('Update Particles');

  // RENDER ---------------------------------------------------------------
  // Rendering does not recompute the physics. It consumes the GPU state.
  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  });

  // Un slot vacío se dibuja con escala 0: no ocupa ni un píxel.
  const aliveAttribute = aliveBuffer.toAttribute();

  material.positionNode = positionBuffer.toAttribute();
  material.scaleNode = params.particleSize.mul(aliveAttribute);

  material.colorNode = Fn(() => {
    const speed = velocityBuffer.toAttribute().length();
    const t = speed.div(params.maxSpeed).clamp(0.0, 1.0);
    const slow = color('#46a6ff');
    const fast = color('#ffb35a');
    return vec4(mix(slow, fast, t), 1.0);
  })();

  // Circular sprite mask, avoiding visible square planes.
  material.opacityNode = step(uv().xy.sub(0.5).length(), 0.5).mul(aliveAttribute);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // FIGURA DIBUJADA -------------------------------------------------------
  // La figura se guarda en CPU como la lista de sellos que la componen. Eso
  // permite volver al estado dibujado tantas veces como haga falta: predecir,
  // probar una capa, y volver a la misma condición inicial para comparar.
  const figure = [];
  let cursor = 0;
  let alive = 0;
  let seed = 1;

  function writeSegment(from, to) {
    params.brushFrom.value.copy(from);
    params.brushTo.value.copy(to);
    params.spawnCursor.value = cursor;
    seed = (seed + 7919) >>> 0;
    params.spawnSeed.value = seed;
    renderer.compute(spawnSegment);

    cursor = (cursor + stampSize) % count;
    alive = Math.min(alive + stampSize, count);
  }

  // Añade un tramo a la figura (dibujar en vivo). Cuando la figura llena el
  // buffer, el tramo más viejo cede su sitio: el pincel es un anillo.
  function stamp(from, to = from) {
    if (figure.length >= maxStamps) figure.shift();
    figure.push({ from: from.clone(), to: to.clone() });
    writeSegment(from, to);
  }

  // Vuelve la figura a su estado dibujado, sin borrarla.
  function restoreFigure() {
    renderer.compute(clearParticles);
    cursor = 0;
    alive = 0;
    for (const segment of figure) writeSegment(segment.from, segment.to);
  }

  // Estado inicial del instrumento: cero partículas y sin figura.
  function reset() {
    renderer.compute(clearParticles);
    figure.length = 0;
    cursor = 0;
    alive = 0;
  }

  function seedCloud() {
    renderer.compute(seedCloudParticles);
    figure.length = 0;
    cursor = 0;
    alive = count;
  }

  function stepSimulation() {
    renderer.compute(updateParticles);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    scene.remove(mesh);
  }

  return {
    count,
    maxStamps,
    positionBuffer,
    velocityBuffer,
    aliveBuffer,
    stamp,
    restoreFigure,
    reset,
    seedCloud,
    stepSimulation,
    dispose,
    getAliveCount: () => alive,
    getFigureLength: () => figure.length
  };
}
