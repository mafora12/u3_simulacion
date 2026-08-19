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

    // 1 · ATRACCIÓN (hacia el atractor, ley del inverso del cuadrado) --------
    attractEnabled: uniform(0.0),
    attractStrength: uniform(2.2),

    // 2 · REPULSIÓN (alejándose del atractor) --------------------------------
    // Cae con el CUBO de la distancia, no con el cuadrado como la atracción.
    // Esa diferencia es deliberada: si ambas usaran el mismo exponente serían
    // la misma fuerza con el signo cambiado y, encendidas a la vez (tecla 5),
    // se anularían en una resta sosa. Con caídas distintas la repulsión manda
    // de cerca y la atracción de lejos, así que juntas tienen un punto de
    // equilibrio y las partículas se ordenan en una cáscara alrededor del
    // atractor en vez de colapsar o dispersarse.
    repelEnabled: uniform(0.0),
    repelStrength: uniform(2.0),

    // 3 · FRICCIÓN (drag, F = -c·v) ------------------------------------------
    dragEnabled: uniform(0.0),
    dragCoefficient: uniform(0.12),

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
