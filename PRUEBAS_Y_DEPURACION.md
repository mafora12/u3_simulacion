# Validación y depuración

## Regla principal

No uses «se ve bien» como evidencia de corrección. Una prueba debe declarar una propiedad observable antes de ejecutar el sistema.

## Matriz mínima

Dibuja una figura reconocible (un círculo sirve bien) y úsala como condición inicial de
todas las pruebas. La tecla `0` la devuelve a su estado dibujado, así que cada prueba
parte exactamente del mismo punto y las comparaciones son honestas. Si necesitas un
estado reproducible que no dependa del pulso de tu mano, usa «Sembrar nube de prueba».

| Prueba | Fuerzas activas | Condición inicial | Predicción |
|---|---|---|---|
| Reposo | ninguna | figura dibujada, velocidad = 0 | nada se mueve: sin fuerza no hay cambio |
| Inercia | ninguna | figura dibujada, velocidad ≠ 0 | movimiento sin aceleración deliberada |
| +X | viento | figura dibujada, velocidad = 0 | `v.x` crece positiva |
| Atracción | radial + | figura dibujada, velocidad = 0 | aceleración hacia atractor |
| Repulsión | radial - | figura dibujada, velocidad = 0 | aceleración alejándose |
| Vórtice | radial suave + tangencial | figura dibujada, velocidad = 0 | aparece giro, no solo caída radial |

La prueba de **Reposo** es la que separa este instrumento de una animación: si la figura
se moviera sin ninguna capa activa, algo estaría empujando las posiciones por fuera del
modelo de fuerzas.

## Errores típicos generados por IA

### Actualizar partículas en JavaScript

Síntoma: `for (...) position[i] ...` por frame. Esto elimina el propósito del compute masivo.

### Confundir render shader con compute

Síntoma: el material altera visualmente vértices, pero el estado físico real no cambia. Pregunta: ¿La posición futura queda escrita en storage?

### Singularidad radial

Síntoma: las partículas explotan al acercarse al atractor. Revisa división por distancia y `softening`.

### dt demasiado grande

Síntoma: sistema errático al cambiar de equipo o velocidad. Mantén inicialmente paso fijo y luego experimenta conscientemente.

### Confundir dibujo con coreografía

Síntoma: el trazo mueve partículas ya existentes, o se guardan las posiciones del trazo
para reproducirlas frame a frame. Eso es animar a mano, no simular. El dibujo sólo puede
escribir la condición inicial (dónde nace cada partícula); a partir de ahí, quien decide
el movimiento es el bloque de fuerzas. Prueba de control: con todas las capas apagadas,
la figura debe quedarse absolutamente inmóvil.

### Leer un buffer de vec3 con paso 3

Síntoma: la lectura de vuelta desde la GPU (`getArrayBufferAsync`) da valores absurdos o
un promedio que no corresponde con lo que se ve. En WGSL un `vec3` se alinea a 16 bytes,
así que el buffer avanza de **4 en 4 floats** por partícula, no de 3 en 3. Calcula el
paso como `floats.length / count` en vez de asumirlo.

### Demasiados parámetros

Síntoma: instrumento imposible de tocar. Separa parámetros de calibración y controles de performance.

### Publicación rota

Síntoma: local funciona, GitHub Pages queda negro o con 404. Abre DevTools → Network/Console; verifica rutas de assets y que el workflow haya terminado correctamente.

## Checklist de entrega técnica

- `npm run build` pasa.
- `npm run preview` reproduce la obra.
- URL pública abre en una ventana incógnita.
- consola sin errores críticos.
- LAB permite aislar fuerzas.
- PERFORMANCE no requiere la interfaz de desarrollo.
- El sistema arranca en cero partículas y sin fuerzas activas.
- Con todas las capas apagadas, la figura dibujada no se mueve.
- `R` devuelve al estado inicial y `0` devuelve la figura a su estado dibujado.
- Puedes explicar estado, fuerzas, integración, render y controles.
