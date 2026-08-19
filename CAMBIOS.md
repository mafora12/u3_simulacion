# Cambios sobre el proyecto base

Registro de qué se modificó respecto a `forces-instrument-u3`, por qué, y cómo se
verificó. El proyecto base es un caso de estudio, no la solución: aquí queda anotado
en qué se separa de él esta versión.

## Qué se pidió

1. Poder dibujar una figura.
2. Que al inicio no haya partículas ni fuerzas aplicadas.
3. Que las fuerzas entren con cuatro teclas.
4. Que el reset devuelva al estado inicial de cero partículas.
5. Que dibujar no mueva la cámara, pero que al dejar de dibujar se pueda volver a
   orbitar. Solución acordada: una tecla que activa y desactiva el modo dibujo.

## La decisión de diseño que ordena todo lo demás

El encargo prohíbe «controlar directamente las posiciones para dibujar una trayectoria
previamente coreografiada». Dibujar podía chocar de frente con eso, así que el trazo se
definió como **condición inicial y nada más**:

- El pincel decide **dónde nacen** las partículas y con qué velocidad (`initialSpeed`,
  cero por defecto). Escribe el estado una sola vez, en el instante de nacer.
- A partir de ahí no vuelve a tocar posiciones nunca. Lo que la figura haga
  —organizarse, tensarse, dispersarse, colapsar— sale del bloque de fuerzas.
- La prueba que separa una cosa de la otra: **con las cuatro capas apagadas la figura
  debe quedarse absolutamente inmóvil**. Si se moviera, algo estaría empujando
  posiciones fuera del modelo de fuerzas.

La cadena del encargo se mantiene, con el dibujo entrando por arriba:

```
figura dibujada (condición inicial)
    → escucha → intención → score → interpretación → fuerzas → comportamiento emergente
```

## Cambios por archivo

### `src/simulation/parameters.js`

- Nuevos uniforms del pincel: `brushFrom`, `brushTo`, `brushRadius`, `spawnCursor`,
  `spawnSeed`. Los dos últimos son de tipo `uint` explícito, porque se suman al índice
  de instancia dentro del shader.
- `initialSpeed` pasa de `0.35` a `0` — la figura nace quieta.
- Las cuatro capas (`windEnabled`, `radialEnabled`, `vortexEnabled`, `dragEnabled`)
  pasan a `0`. El instrumento arranca en silencio físico.

### `src/simulation/createSimulation.js`

Aquí está el núcleo del cambio.

**Tercer buffer, `aliveBuffer`.** «Cero partículas» no puede significar «buffer vacío»:
un `instancedArray` se reserva en GPU con tamaño fijo y no se redimensiona en caliente.
Lo que sí se puede es marcar qué ranuras están ocupadas. `aliveBuffer` guarda 1.0 o 0.0
por ranura, y se consulta en dos sitios: el compute no integra las vacías y el render
las dibuja con escala 0.

**Tres pasos de compute nuevos:**

| Paso | Qué hace |
|---|---|
| `clearParticles` | Deja todas las ranuras vacías. Es el estado inicial real. |
| `spawnSegment` | Hace nacer `stampSize` partículas repartidas a lo largo de un tramo. |
| `seedCloudParticles` | La nube aleatoria del proyecto base, ahora explícita y opcional. |

**El pincel sella tramos, no puntos.** Cada movimiento del puntero emite un segmento y
las partículas se reparten a lo largo de él, con reparto estratificado (una por franja,
posición aleatoria dentro de la franja). Esto evita dos problemas a la vez: el trazo no
deja huecos aunque muevas rápido, y cada tramo cuesta **un solo dispatch** en vez de uno
por punto interpolado. La primera versión interpolaba y llegaba a 64 dispatches por
evento de puntero; se descartó por eso.

**Anillo de ranuras.** Cada tramo ocupa un bloque contiguo de `stampSize` ranuras y el
cursor da la vuelta al llegar al final. Como `count` es múltiplo de `stampSize`, un
bloque nunca queda partido en dos y el shader no necesita hacer módulo.

**La figura se recuerda en CPU.** La GPU guarda el estado *actual*, que las fuerzas van
deformando. Para poder volver al estado *dibujado* hace falta recordar aparte cómo era
la figura: una lista de tramos, dos vectores cada uno. Con ella, `restoreFigure()` es
simplemente volver a sellar la lista.

**API nueva:** `stamp()`, `restoreFigure()`, `reset()`, `seedCloud()`,
`getAliveCount()`, `getFigureLength()`. `reset()` cambia de significado: antes
re-sembraba una nube aleatoria, ahora deja el sistema vacío y olvida la figura.

### `src/main.js`

- **Modo dibujo (`D`).** Es un estado con tecla propia que desactiva `OrbitControls`.
  Sin un interruptor explícito, arrastrar giraría la cámara y trazaría a la vez, y la
  figura saldría deformada porque el plano de trabajo se mueve mientras dibujas.
- **El plano de trabajo mira siempre a la cámara.** Se recalcula en cada consulta con la
  dirección de la cámara como normal. Con un plano fijo en Z=0, al orbitar el trazo
  saldría deformado por la perspectiva y, visto de canto, sería imposible dibujar.
- **Trazo continuo** con umbral mínimo (no sellar si el puntero apenas se movió) y
  partición de saltos grandes en varios tramos, para que la densidad no caiga.
- **Captura de puntero**, para que arrastrar fuera del canvas no corte la figura a media
  línea, y manejo de `pointercancel` además de `pointerup`.
- **Los presets de LAB ya no re-siembran**, llaman a `restoreFigure()`. Así las seis
  pruebas parten de la misma condición inicial y son comparables entre sí.
- **`R`** apaga todas las capas y vacía el sistema. **`0`** restaura la figura.
- **Corrección de un bug preexistente** en el osciloscopio, ver más abajo.

### `src/ui/labPanel.js`

Grupo nuevo «Figura (condición inicial)»: botón de modo dibujo que refleja el estado
(la tecla `D` puede cambiarlo sin pasar por el panel), `brushRadius`, `initialSpeed`,
«Restaurar figura» y «Sembrar nube de prueba».

### `src/styles.css`

Una regla: `.panel button.active`, para que el botón de modo dibujo se vea encendido.

### Documentación

`README.md`, `GUIA_ESTUDIANTE.md` y `PRUEBAS_Y_DEPURACION.md` actualizados: controles
nuevos, la distinción condición inicial / trayectoria, la prueba de Reposo en la matriz
mínima, y dos errores típicos nuevos.

## Bug preexistente encontrado y corregido

El osciloscopio leía el buffer de velocidades avanzando **3 floats por partícula**. En
WGSL un `vec3` se alinea a 16 bytes, así que el paso real es **4**. La lectura
desalineaba las componentes y el promedio que mostraba era falso.

Se detectó midiendo el tamaño real del buffer devuelto por `getArrayBufferAsync`:
16384 floats para 4096 partículas. Ahora el paso se calcula (`floats.length / count`) en
vez de asumirse.

## Controles

| Tecla | Acción |
|---|---|
| `D` | Entra/sale del modo dibujo. Bloquea la órbita mientras dibujas. |
| `1`–`4` | Las cuatro capas: Pulso, Núcleo, Textura, Fricción. |
| `5` | Todas las capas. |
| `0` | Devuelve la figura a su estado dibujado, sin borrarla. |
| `R` | Reset: cero partículas, ninguna fuerza, figura olvidada. |
| `P` | LAB / PERFORMANCE. |
| espacio | Invierte el núcleo mientras se mantiene pulsado. |
| rueda | Macro de intensidad. |
| puntero | Dibuja (en modo dibujo) o mueve el atractor (fuera de él). |

El mismo número señala siempre la misma capa. Lo que cambia es qué significa pulsarlo:
en LAB la aísla y restaura la figura para verificarla; en PERFORMANCE la mete o la saca
de la mezcla en vivo, sin cortar el sistema.

## Cómo se verificó

No se aceptó «se ve bien» como evidencia. Como la máquina de desarrollo no tiene Node.js,
se sirvió el proyecto con un servidor estático y un import map, y se ejecutó el pipeline
real de WebGPU en el navegador.

**Núcleo de simulación, leyendo los buffers de vuelta desde la GPU:**

| Comprobación | Resultado |
|---|---|
| Tras `reset()`, ninguna partícula viva | 0 de 4096 |
| Un tramo `(-1,0,0) → (1,0,0)` cae donde debe | x en [-0.994, 0.990], \|y\| ≤ 0.020 con radio 0.02 |
| 120 pasos **sin fuerzas**: desplazamiento | 2.4e-7 (dos ULPs de float32, ruido del `mod` del wrap) |
| 120 pasos **con Núcleo**: desplazamiento | 1.24 |
| Ranuras vacías desplazadas | 0 |
| `restoreFigure()` devuelve la figura al trazo | x en [-0.996, 1.002] |
| Anillo: 21 sellos con capacidad 16 | 4096 vivas, figura recortada a 16 |

**Aplicación completa, con eventos de puntero y teclado reales:**

| Comprobación | Resultado |
|---|---|
| Arranque con helpers ocultos | 0 píxeles encendidos |
| Dibujar un círculo | 73 sellos disparados |
| El mismo arrastre con modo dibujo OFF | 0 sellos |
| Forma renderizada | anillo: radio p10=38.2, p50=40.4, p90=42.5 (un disco lleno daría p10≈0) |
| 150 frames sin capas activas | 1006 → 1006 píxeles, idéntico |
| Tecla 2 (Núcleo) | 1289 píxeles, la figura se mueve |

**Lo que no está verificado:** `npm run build` y el despliegue a GitHub Pages, porque
requieren Node 22 y no hay Node instalado en esta máquina.

## Cosas que se probaron y se descartaron

- **Un dispatch por punto interpolado.** Hasta 64 por evento de puntero. Sustituido por
  el sellado de tramos, que hace lo mismo con uno.
- **Medir el resultado leyendo píxeles del canvas WebGPU con `drawImage`.** Devuelve
  siempre negro; no sirve como sonda. Se sustituyó por lectura directa de los buffers.
- **Usar `Return()` para saltar las ranuras vacías en el shader.** Se prefirió envolver
  la física en un `If`, que es equivalente y no depende de esa construcción.
