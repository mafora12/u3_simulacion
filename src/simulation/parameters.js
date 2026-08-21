import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

// Uniforms are CPU-side values that TSL exposes to the GPU.
// Changing .value does not rebuild the compute shader.
export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    // Velocidad con la que NACE una partícula al dibujarla. Por defecto 0:
    // la figura que trazas se queda quieta hasta que actúa una fuerza.
    initialSpeed: uniform(0.0),
    maxSpeed: uniform(5.0),
    // Extensión de referencia del mundo. Ya NO define el contorno —de eso se
    // encarga `containRadius`—; solo fija cuánto se dispersa la nube de prueba.
    boundsSize: uniform(10.0),
    particleSize: uniform(0.035),

    // PINCEL: la figura dibujada es la CONDICIÓN INICIAL del sistema --------
    // No es una trayectoria. Define dónde nacen las partículas; lo que ocurre
    // después con ellas lo deciden las fuerzas, no el trazo.
    // Un sello del pincel cubre el SEGMENTO trazado entre dos posiciones del
    // puntero, no un punto suelto: así el trazo queda continuo aunque muevas
    // el puntero rápido, con un solo dispatch por tramo.
    brushFrom: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),
    brushTo: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),
    brushRadius: uniform(0.06),
    // Ranura del buffer donde escribe el próximo sello, y semilla para que dos
    // sellos en la misma ranura no repitan la misma dispersión.
    // El segundo argumento fija el tipo: sin él, `uniform(0)` sería un float y
    // no se podría sumar al índice de instancia, que es un entero sin signo.
    spawnCursor: uniform(0, 'uint'),
    spawnSeed: uniform(0, 'uint'),

    // LAS CUATRO FUERZAS DEL INSTRUMENTO ------------------------------------
    // Cada una es una CAPA: algo que entra y sale de la mezcla mientras suena
    // la pieza, no un slider decorativo. Todas arrancan APAGADAS: el
    // instrumento empieza en silencio físico.

    // Punto al que apuntan atracción y repulsión. Lo conduce el puntero.
    attractor: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),
    // Radio mínimo con el que se evalúan las fuerzas radiales. Sin él, una
    // partícula que cae justo sobre el atractor divide por casi cero y sale
    // disparada al infinito (la "singularidad radial").
    softening: uniform(0.35),

    // 1 · ATRACCIÓN (hacia el atractor, caída 1/d) ---------------------------
    // La magnitud está calibrada contra la gravedad (1.2), que es constante en
    // todo el espacio: a la distancia de trabajo típica (2 a 5 unidades) la
    // atracción vale entre 3.0 y 1.2, así que se impone o al menos compite. Con
    // los valores anteriores (2.2 con caída 1/d²) valía 0.55 a d=2 y 0.09 a
    // d=5, y la gravedad la borraba del todo.
    attractEnabled: uniform(0.0),
    attractStrength: uniform(6.0),

    // 2 · REPULSIÓN (alejándose del atractor, caída 1/d²) --------------------
    // Un exponente MÁS que la atracción, siempre. Esa diferencia es deliberada:
    // si ambas usaran el mismo exponente serían la misma fuerza con el signo
    // cambiado y, encendidas a la vez (tecla 5), se anularían en una resta
    // sosa. Al caer más deprisa, la repulsión manda de cerca y la atracción de
    // lejos, así que juntas tienen un radio de equilibrio d_eq = k_r / k_a y
    // las partículas se ordenan en una cáscara en vez de colapsar o dispersarse.
    //
    // El valor es alto (18) por una razón que aparece al medir: como la
    // repulsión cae más deprisa que la atracción —condición necesaria para que
    // la cáscara exista— a la distancia de trabajo (3 a 5 unidades) es
    // inevitablemente la más débil de las dos. Con 5.5 la gravedad la vencía y
    // «la fuerza 2 no hacía nada». Con 18 vale ≈1.5 a d=3.4, por encima de la
    // gravedad (1.2), y el radio de equilibrio queda en 18/6 = 3.0: una esfera
    // amplia y legible en el encuadre en vez de un nudo diminuto.
    repelEnabled: uniform(0.0),
    repelStrength: uniform(18.0),

    // 3 · FRICCIÓN (drag, F = -c·v) ------------------------------------------
    dragEnabled: uniform(0.0),
    dragCoefficient: uniform(0.12),

    // CONTENCIÓN (condición de contorno, no una capa expresiva) -------------
    // Radio a partir del cual un muelle suave empuja de vuelta al centro.
    // Dentro de él la fuerza es exactamente cero: las partículas se mueven
    // libres por el espacio, sin ninguna pared ni cara visible. Sustituye al
    // wrap periódico cúbico, que teletransportaba de una cara a la opuesta y
    // dibujaba un cubo en pantalla.
    // El radio está calibrado contra el ENCUADRE, no elegido a ojo: con la
    // cámara en z=11 y fov 50°, el plano z=0 se ve hasta ±5.13 en vertical. Un
    // radio de 4.5 deja margen para que ni siquiera el rebote más violento
    // saque las partículas de cuadro.
    containRadius: uniform(4.5),
    containStrength: uniform(28.0),
    // Amortiguación que solo actúa fuera del radio. Sin ella el muelle es
    // conservativo: devuelve toda la energía que absorbe, así que una partícula
    // que llega lanzada rebota igual de lejos y el borde "resuena". Con ella la
    // energía se disipa y el contorno se comporta como una bolsa blanda.
    containDamping: uniform(4.0),

    // 4 · GRAVEDAD (campo constante hacia -Y) --------------------------------
    // No apunta al atractor: es un campo uniforme, igual en todo el espacio.
    // Esa es justamente la diferencia con la atracción, y se nota al aislarla.
    gravityEnabled: uniform(0.0),
    gravityStrength: uniform(1.2),

    // Macro de PERFORMANCE: cuánto empujan las capas activas ahora mismo.
    // No es una capa propia - escala Textura/Núcleo/Pulso en conjunto, para
    // tener un único control continuo con significado en vivo.
    intensity: uniform(1.0)
  };
}
