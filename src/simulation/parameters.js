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

    // Cada fuerza es una CAPA de la lectura de LesAlpx: algo que entra y sale
    // de la mezcla mientras suena la pieza, no un slider decorativo.
    // Todas arrancan APAGADAS: el instrumento empieza en silencio físico.
    // Capa "Textura" (viento) -----------------------------------------------
    windEnabled: uniform(0.0),
    wind: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),

    // Capa "Núcleo" (radial: atracción/repulsión según el signo) ------------
    radialEnabled: uniform(0.0),
    attractor: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),
    radialStrength: uniform(2.2),
    softening: uniform(0.35),

    // Capa "Pulso" (vórtice) -------------------------------------------------
    vortexEnabled: uniform(0.0),
    vortexStrength: uniform(1.4),

    // Capa "Fricción" (drag) -------------------------------------------------
    dragEnabled: uniform(0.0),
    dragCoefficient: uniform(0.12),

    // Macro de PERFORMANCE: cuánto empujan las capas activas ahora mismo.
    // No es una capa propia - escala Textura/Núcleo/Pulso en conjunto, para
    // tener un único control continuo con significado en vivo.
    intensity: uniform(1.0)
  };
}
