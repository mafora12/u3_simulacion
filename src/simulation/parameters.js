import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

// Uniforms are CPU-side values that TSL exposes to the GPU.
// Changing .value does not rebuild the compute shader.
export function createParameters() {
  return {
    dt: uniform(1 / 60),
    timeScale: uniform(1.0),
    initialSpeed: uniform(0.35),
    maxSpeed: uniform(5.0),
    boundsSize: uniform(10.0),
    particleSize: uniform(0.035),

    // Cada fuerza es una CAPA de la lectura de LesAlpx: algo que entra y sale
    // de la mezcla mientras suena la pieza, no un slider decorativo.
    // Capa "Textura" (viento) -----------------------------------------------
    windEnabled: uniform(0.0),
    wind: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),

    // Capa "Núcleo" (radial: atracción/repulsión según el signo) ------------
    radialEnabled: uniform(1.0),
    attractor: uniform(new THREE.Vector3(0.0, 0.0, 0.0)),
    radialStrength: uniform(2.2),
    softening: uniform(0.35),

    // Capa "Pulso" (vórtice) -------------------------------------------------
    vortexEnabled: uniform(1.0),
    vortexStrength: uniform(1.4),

    // Capa "Fricción" (drag) -------------------------------------------------
    dragEnabled: uniform(1.0),
    dragCoefficient: uniform(0.12),

    // Macro de PERFORMANCE: cuánto empujan las capas activas ahora mismo.
    // No es una capa propia - escala Textura/Núcleo/Pulso en conjunto, para
    // tener un único control continuo con significado en vivo.
    intensity: uniform(1.0)
  };
}
