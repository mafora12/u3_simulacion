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
  // «Cero partículas» no puede significar «buffer vacío»: un `instancedArray`
  // se reserva en la GPU con tamaño fijo al arrancar y no se puede redimensionar
  // en caliente. Lo que sí se puede es marcar qué slots están ocupados. Ese es
  // el truco de todo este archivo: el buffer siempre tiene `count` ranuras y lo
  // que crece al dibujar es cuántas están vivas.
  //
  // Cada pincelada ocupa un bloque exacto y contiguo de `stampSize` ranuras. Si
  // `count` es múltiplo de `stampSize`, el cursor nunca parte un bloque en dos
  // al dar la vuelta, y por eso el shader de spawn no necesita hacer módulo:
  // basta con sumar el cursor al índice local.
  if (count % stampSize !== 0) {
    throw new Error(`count (${count}) debe ser múltiplo de stampSize (${stampSize}).`);
  }
  const maxStamps = count / stampSize;

  // STATE -----------------------------------------------------------------
  // Posición y velocidad son el estado físico. `aliveBuffer` es nuevo: guarda
  // 1.0 si la ranura contiene una partícula y 0.0 si está vacía. Se consulta en
  // dos sitios, y en ambos hace falta: en el compute (para no integrar ranuras
  // vacías) y en el render (para no dibujarlas).
  const positionBuffer = instancedArray(count, 'vec3');
  const velocityBuffer = instancedArray(count, 'vec3');
  const aliveBuffer = instancedArray(count, 'float');

  // CLEAR -----------------------------------------------------------------
  // Estado inicial real del instrumento: ninguna partícula existe. Marcar
  // `alive = 0` bastaría para que desaparezcan, pero también se ponen a cero
  // posición y velocidad para que una ranura reutilizada más tarde no arrastre
  // basura del trazo anterior.
  const clearParticles = Fn(() => {
    positionBuffer.element(instanceIndex).assign(vec3(0.0));
    velocityBuffer.element(instanceIndex).assign(vec3(0.0));
    aliveBuffer.element(instanceIndex).assign(float(0.0));
  })().compute(count).setName('Clear Particles');

  // HALT ------------------------------------------------------------------
  // Pone las velocidades a cero SIN tocar posiciones ni el flag de vida: la
  // figura se queda exactamente donde está, pero deja de moverse.
  //
  // Hace falta porque quitar una fuerza no frena nada por sí solo: la primera
  // ley de Newton dice que lo que ya se movía sigue moviéndose. Al apagar la
  // gravedad, las partículas conservaban toda la velocidad de caída acumulada
  // y seguían bajando (y reapareciendo por arriba con el wrap periódico) para
  // siempre. Como gesto de instrumento eso es inservible: apagar la gravedad
  // tiene que significar "deja de caer", no "sigue cayendo sin acelerar".
  const haltParticles = Fn(() => {
    velocityBuffer.element(instanceIndex).assign(vec3(0.0));
  })().compute(count).setName('Halt Particles');

  // SPAWN / PINCEL --------------------------------------------------------
  // Un sello del pincel: nacen `stampSize` partículas repartidas a lo largo
  // del segmento trazado. Esto escribe la CONDICIÓN INICIAL, no una
  // trayectoria: la velocidad de nacimiento es `initialSpeed` (0 por defecto,
  // es decir, la figura se queda quieta hasta que actúa una fuerza).
  const spawnSegment = Fn(() => {
    // Este dispatch lanza solo `stampSize` hilos, no `count`: cada hilo escribe
    // una ranura del bloque que arranca en el cursor. Por eso dibujar es barato
    // aunque el sistema tenga 131072 partículas.
    const i = params.spawnCursor.add(instanceIndex);

    // La semilla mezcla el índice con un contador que la CPU cambia en cada
    // sello. Sin ese contador, dos sellos que cayeran en la misma ranura
    // producirían exactamente la misma dispersión y el trazo se vería repetido.
    const seed = i.add(params.spawnSeed);

    const r1 = hash(seed.add(uint(11)));
    const r2 = hash(seed.add(uint(23)));
    const r3 = hash(seed.add(uint(37)));
    const r4 = hash(seed.add(uint(53)));
    const r5 = hash(seed.add(uint(71)));
    const r6 = hash(seed.add(uint(89)));
    const r7 = hash(seed.add(uint(101)));

    // Reparto estratificado a lo largo del tramo: a cada hilo le toca una franja
    // (índice / total) y se mueve al azar dentro de ella (+ r1). Repartir solo
    // por índice dejaría un peine de puntos regulares; repartir solo al azar
    // dejaría claros y grumos. Estratificar da lo mejor de ambos.
    const t = instanceIndex.toFloat().add(r1).div(float(stampSize));
    const center = mix(params.brushFrom, params.brushTo, t);

    // Dispersión alrededor del eje del tramo, para que el trazo tenga grosor y
    // no sea una línea de un solo punto de ancho.
    const jitter = vec3(r2, r3, r4).sub(0.5).mul(2.0).mul(params.brushRadius);

    positionBuffer.element(i).assign(center.add(jitter));
    // Nacer con velocidad `initialSpeed`, que por defecto es 0: la figura queda
    // quieta y solo se moverá cuando una capa de fuerza actúe sobre ella.
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

    // Se reparte por el volumen periódico EXACTO: `(r − 0.5) × 2 × half` cubre
    // justo [−half, +half].
    //
    // El factor tiene que ser 2.0 y no menos. Con 1.8 la nube llenaba solo el
    // 90 % y quedaba una banda vacía; como todas las partículas caen a la misma
    // velocidad, la nube se traslada rígida y ese hueco no se rellena nunca:
    // daba la vuelta al contorno periódico una y otra vez, barriendo la pantalla
    // como una franja oscura. Un reparto que no llena el volumen periódico
    // completo es un artefacto permanente, no un detalle inicial.
    p.assign(vec3(r1, r2, r3).sub(0.5).mul(params.boundsHalf.mul(2.0)));
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

    // Toda la física queda dentro de este If: una ranura vacía no se integra,
    // porque no contiene una partícula todavía. Se compara con 0.5 en vez de con
    // 1.0 porque `alive` es un float y comparar floats por igualdad exacta es
    // frágil; el valor solo puede ser 0.0 o 1.0, así que el punto medio separa
    // los dos casos sin ambigüedad.
    If(alive.greaterThan(0.5), () => {
      const dt = params.dt.mul(params.timeScale);
      const force = vec3(0.0).toVar();

      // Geometría compartida por las dos fuerzas radiales (atracción y
      // repulsión): dirección unitaria hacia el atractor y distancia con
      // softening, para no dividir por casi cero al caer sobre el centro.
      const toAttractor = params.attractor.sub(p);
      const distance = max(toAttractor.length(), params.softening);
      const radialDirection = toAttractor.div(distance);

      // 1) ATRACCIÓN: hacia el atractor, con caída INVERSA A LA DISTANCIA (1/d).
      //
      // No es el inverso del cuadrado, y es una decisión deliberada de escala.
      // Las partículas ocupan todo el encuadre, así que las distancias de
      // trabajo llegan a 6 u 8 unidades. Con 1/d² la fuerza a d=3 valía 0.24 y
      // a d=5 apenas 0.09: prácticamente nula fuera de un radio de 2 unidades.
      // El resultado era que el atractor "no se veía" y que la gravedad (1.2,
      // constante en todo el espacio) la aplastaba por un factor de 5 a 14.
      // Con 1/d la fuerza mantiene alcance largo —2.0 a d=3, 1.2 a d=5— y el
      // gesto de conducir el atractor se lee en todo el encuadre.
      force.addAssign(
        radialDirection
          .mul(params.attractStrength)
          .div(distance)
          .mul(params.attractEnabled)
          .mul(params.intensity)
      );

      // 2) REPULSIÓN: misma dirección, signo contrario, y caída con el CUADRADO
      // de la distancia — es decir, SIEMPRE un exponente más que la atracción.
      // Ahí está la clave del diseño: al caer más deprisa, la repulsión domina
      // de cerca y la atracción de lejos, así que encendidas a la vez existe un
      // radio de equilibrio y las partículas forman una cáscara en vez de
      // anularse. Igualando k_a/d = k_r/d² sale d_eq = k_r / k_a, la misma
      // relación que con el par (2,3) anterior: subir la escala no rompió la
      // predicción, solo le dio alcance.
      force.addAssign(
        radialDirection
          .mul(params.repelStrength)
          .div(distance.pow(2))
          .mul(params.repelEnabled)
          .mul(params.intensity)
          .mul(-1.0)
      );

      // 3) FRICCIÓN (drag, F = -c v): resta energía al sistema. No se escala
      // por intensity - es un freno, no un empuje, y debe poder frenar el
      // sistema incluso cuando intensity es alta.
      force.addAssign(v.mul(params.dragCoefficient).mul(params.dragEnabled).mul(-1.0));

      // 4) GRAVEDAD: campo uniforme hacia -Y, igual en todo el espacio. A
      // diferencia de la atracción no depende de dónde esté el atractor ni de
      // la distancia.
      force.addAssign(
        vec3(0.0, -1.0, 0.0)
          .mul(params.gravityStrength)
          .mul(params.gravityEnabled)
          .mul(params.intensity)
      );

      // INTEGRATION -------------------------------------------------------
      // Unit mass: a = F. Semi-implicit Euler: update v, then p.
      v.addAssign(force.mul(dt));

      const speed = v.length();
      If(speed.greaterThan(params.maxSpeed), () => {
        v.assign(v.normalize().mul(params.maxSpeed));
      });

      p.addAssign(v.mul(dt));

      // CONTORNO PERIÓDICO --------------------------------------------------
      // La que sale por una cara reaparece por la opuesta: con la gravedad
      // activa, caen y vuelven a entrar por arriba.
      //
      // `boundsHalf` es la semiextensión POR EJE, no un cubo, y la calcula
      // main.js desde el frustum de la cámara. Que sea más grande que el
      // encuadre es lo que hace que no se vea ningún delimitador: el salto
      // ocurre fuera de cuadro, así que nunca se ve el corte.
      const extent = params.boundsHalf.mul(2.0);
      p.assign(mod(p.add(params.boundsHalf), extent).sub(params.boundsHalf));
    });
  })().compute(count).setName('Update Particles');

  // RENDER ---------------------------------------------------------------
  // Rendering does not recompute the physics. It consumes the GPU state.
  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  });

  // El mismo flag que usa el compute se lee aquí como atributo de instancia.
  // Una ranura vacía sale con escala 0 (el quad degenera y no rasteriza ni un
  // píxel) y además con opacidad 0. Con una de las dos bastaría; se hacen las
  // dos porque la de escala ahorra trabajo de rasterizado y la de opacidad deja
  // el resultado explícito en el color.
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
  // La GPU guarda el estado ACTUAL de las partículas, que las fuerzas van
  // deformando. Para poder volver al estado DIBUJADO hace falta recordar aparte
  // cómo era la figura, y eso vive en la CPU: una lista de los tramos trazados.
  //
  // Es la única memoria del dibujo, y ocupa nada (dos vectores por tramo). Con
  // ella, «restaurar figura» es simplemente volver a sellar la lista.
  const figure = [];
  let cursor = 0;   // próxima ranura libre del anillo
  let alive = 0;    // cuántas ranuras están ocupadas (espejo en CPU del aliveBuffer)
  let seed = 1;     // contador de semilla, distinto en cada sello

  // Escribe un tramo en la GPU. No toca `figure`: eso lo decide quien llama,
  // porque restaurar la figura re-escribe tramos que YA están en la lista y no
  // deben duplicarse en ella.
  function writeSegment(from, to) {
    params.brushFrom.value.copy(from);
    params.brushTo.value.copy(to);
    params.spawnCursor.value = cursor;
    // 7919 es primo; sumarlo hace que la semilla recorra muchos valores antes
    // de repetirse. `>>> 0` la mantiene dentro de un entero sin signo de 32
    // bits, que es el tipo del uniform.
    seed = (seed + 7919) >>> 0;
    params.spawnSeed.value = seed;
    renderer.compute(spawnSegment);

    // El cursor da la vuelta al llegar al final: el pincel es un anillo. Si
    // dibujas más de `maxStamps` tramos, los más viejos ceden su sitio.
    cursor = (cursor + stampSize) % count;
    alive = Math.min(alive + stampSize, count);
  }

  // Añade un tramo a la figura (dibujar en vivo). La lista se recorta por el
  // mismo extremo por el que el anillo sobrescribe, de modo que lo que recuerda
  // la CPU y lo que contiene la GPU siguen coincidiendo.
  function stamp(from, to = from) {
    if (figure.length >= maxStamps) figure.shift();
    figure.push({ from: from.clone(), to: to.clone() });
    writeSegment(from, to);
  }

  // Vuelve la figura a su estado dibujado, sin olvidarla. Limpia y vuelve a
  // sellar desde el principio, así que el resultado es idéntico al del momento
  // en que terminaste de dibujar (salvo la dispersión aleatoria del pincel).
  function restoreFigure() {
    renderer.compute(clearParticles);
    cursor = 0;
    alive = 0;
    for (const segment of figure) writeSegment(segment.from, segment.to);
  }

  // Estado inicial del instrumento: cero partículas y sin figura. La diferencia
  // con restoreFigure() es justo esa: aquí la lista se vacía y el dibujo se
  // pierde. Es lo que hace la tecla R.
  function reset() {
    renderer.compute(clearParticles);
    figure.length = 0;
    cursor = 0;
    alive = 0;
  }

  // Llena el sistema con la nube aleatoria del proyecto base. Sirve para
  // verificar una fuerza sobre un estado inicial reproducible, que una figura
  // hecha a mano nunca es. Descarta la figura porque ocupa todo el buffer.
  function seedCloud() {
    renderer.compute(seedCloudParticles);
    figure.length = 0;
    cursor = 0;
    alive = count;
  }

  // Frena el sistema en seco dejando la figura donde está. Lo usa main.js al
  // apagar la gravedad (o todas las fuerzas): sin esto, la velocidad ya
  // acumulada haría que las partículas siguieran cayendo indefinidamente.
  function halt() {
    renderer.compute(haltParticles);
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
    halt,
    stepSimulation,
    dispose,
    // `alive` y `figure` cambian con el tiempo, así que se exponen como
    // funciones y no como valores: una propiedad se leería una sola vez y se
    // quedaría congelada en el número que hubiera al construir el objeto.
    getAliveCount: () => alive,
    getFigureLength: () => figure.length
  };
}
