# U3 · Forces Instrument — Bitácora

**Mariana Flórez** · Actividad 03: encargo de diseño · Interpretación de *LesAlpx* (Floating Points, *Crush*, 2019)

Instrumento visual basado en fuerzas, construido sobre el caso de estudio
`forces-instrument-u3` con asistencia de IA generativa, verificado con predicciones
medibles y preparado para interpretación en tiempo real.

Esta bitácora está ordenada según los entregables del encargo. No es un diario de frases
generales: cada afirmación sobre el comportamiento del sistema tiene detrás una medición
reproducible, y cada decisión de diseño dice qué se aceptó, qué se corrigió y qué se
descartó.

> **Estado de la entrega.** Todo lo descrito aquí está implementado y medido, salvo el
> **score visual (§5)**, que depende de mi escucha y está marcado como pendiente de
> completar. Ver §8 para el detalle honesto de qué falta.

---

## Índice

1. [Instrumento funcional y publicado](#1-instrumento-funcional-y-publicado)
2. [Mapa del sistema](#2-mapa-del-sistema)
3. [Ficha de fuerzas](#3-ficha-de-fuerzas)
4. [Registro de pruebas](#4-registro-de-pruebas)
5. [Score visual](#5-score-visual-de-lesalpx)
6. [Bitácora de IA](#6-bitácora-de-ia)
7. [Autoevaluación ponderada](#7-autoevaluación-ponderada)
8. [Qué falta y qué no está verificado](#8-qué-falta-y-qué-no-está-verificado)
9. [Ejecutar y publicar](#9-ejecutar-y-publicar)

---

## 1. Instrumento funcional y publicado

**URL pública:** <https://mafora12.github.io/u3_simulacion/>

Verificado el 2026-08-19 abriendo la URL en un navegador con WebGPU: carga el canvas,
inicializa el renderer, muestra el panel de LAB con las cuatro fuerzas y el HUD en modo
LAB. Sin errores en consola.

**Contrato técnico cumplido:** Web + Three.js `0.185.1` + `WebGPURenderer` + TSL +
GPU Compute + Vite `8.2.1` + publicación automática por GitHub Actions
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

### Los dos modos

| | **LAB** | **PERFORMANCE** |
|---|---|---|
| Para qué | Comprender y verificar | Interpretar en vivo |
| Panel | Visible (sliders, casillas, pruebas) | Oculto |
| Ejes | Visibles | Ocultos |
| Marcador del atractor | Siempre visible (blanco) | Visible **solo si atracción o repulsión están activas**, y coloreado según cuál manda |
| Órbita de cámara | Activa | Bloqueada |
| Teclas `1`–`4` | **Aíslan** una fuerza y restauran la figura | **Meten o sacan** la fuerza de la mezcla, sin cortar el sistema |
| Tecla `5` | Preset de las cuatro juntas | Enciende/apaga todas |
| Retroalimentación | Panel + osciloscopio | HUD con estado en vivo + osciloscopio |

El instrumento **arranca vacío**: cero partículas y ninguna fuerza activa. Ese es el
estado inicial real, no una nube de arranque.

### Flujo de uso

1. `D` → traza una figura con el puntero. Es la **condición inicial**: define dónde nacen
   las partículas, no por dónde deben pasar. Nacen quietas.
2. `D` otra vez → sales del modo dibujo y recuperas la órbita.
3. `P` → PERFORMANCE. Conduces las fuerzas con `1`–`5`, el atractor con el puntero, la
   intensidad con la rueda y la inversión radial con el espacio.

### Controles

| Control | Acción |
|---|---|
| `D` | Entra/sale del modo dibujo. Bloquea la órbita mientras dibujas. |
| `P` | LAB ↔ PERFORMANCE. |
| `1` | Atracción (hacia el atractor). |
| `2` | Repulsión (alejándose del atractor). |
| `3` | Fricción (freno). |
| `4` | Gravedad (campo constante hacia abajo). Al apagarla, el sistema **frena en seco**. |
| `5` | Las cuatro fuerzas juntas. Al apagarlas, frena en seco. |
| `0` | Devuelve la figura a su estado dibujado, sin borrarla. |
| `R` | Reset: cero partículas, ninguna fuerza, figura olvidada. |
| espacio | Mientras se mantiene pulsado, intercambia atracción y repulsión. |
| rueda | Macro de intensidad (`0`–`2`). |
| puntero | Dibuja (en modo dibujo) o conduce el atractor (fuera de él). |

**Son nueve controles con función interpretativa**, no un panel de sliders. El panel
completo existe solo en LAB, que es donde se verifica; en PERFORMANCE está oculto a
propósito para que la conducción pase por gestos y no por ajustes finos.

---

## 2. Mapa del sistema

```
  PUNTERO / TECLADO                    CPU                            GPU
  ─────────────────                    ───                            ───
  D  → modo dibujo ──────────→ figure[] (lista de tramos) ──→ spawnSegment  ─┐
  puntero → atractor ────────→ uniforms (params)          ──→                │
  1-5 → interruptores ───────→ engageLayer()              ──→ updateParticles│→ positionBuffer
  rueda → intensity ─────────→                            ──→                │  velocityBuffer
  espacio → swap radial ─────→                            ──→ haltParticles ─┘  aliveBuffer
                                                                                     │
                                              render (SpriteNodeMaterial) ←──────────┘
```

### Estado

Todo el estado físico vive en la GPU, en tres *storage buffers* creados con
`instancedArray`:

| Buffer | Tipo | Qué guarda | Dónde |
|---|---|---|---|
| `positionBuffer` | `vec3` × 131 072 | Posición de cada partícula | [`createSimulation.js:41`](src/simulation/createSimulation.js#L41) |
| `velocityBuffer` | `vec3` × 131 072 | Velocidad de cada partícula | [`createSimulation.js:42`](src/simulation/createSimulation.js#L42) |
| `aliveBuffer` | `float` × 131 072 | `1.0` si la ranura contiene partícula, `0.0` si está vacía | [`createSimulation.js:43`](src/simulation/createSimulation.js#L43) |

`aliveBuffer` es el añadido que hace posible «cero partículas»: un `instancedArray` se
reserva con tamaño fijo y no se redimensiona en caliente, así que lo que crece al dibujar
no es el buffer sino cuántas ranuras están marcadas como vivas. Se consulta en dos
sitios: el compute no integra las vacías y el render las dibuja con escala 0.

La **figura dibujada** es el único estado que vive en la CPU: una lista de tramos
(`figure[]`, [`createSimulation.js:265`](src/simulation/createSimulation.js#L265)), dos
vectores por tramo. La GPU guarda el estado *actual*, que las fuerzas deforman; la CPU
recuerda el estado *dibujado* para poder volver a él con `0`.

### Pasos de compute

| Paso | Qué hace | Dónde |
|---|---|---|
| `clearParticles` | Deja todas las ranuras vacías. Estado inicial real. | [`createSimulation.js:50`](src/simulation/createSimulation.js#L50) |
| `haltParticles` | Pone velocidades a cero sin tocar posiciones ni vida. | [`createSimulation.js:66`](src/simulation/createSimulation.js#L66) |
| `spawnSegment` | Hace nacer 256 partículas repartidas por un tramo del pincel. | [`createSimulation.js:75`](src/simulation/createSimulation.js#L75) |
| `seedCloudParticles` | Nube aleatoria reproducible para verificar sin dibujar. | [`createSimulation.js:115`](src/simulation/createSimulation.js#L115) |
| `updateParticles` | **El corazón**: fuerzas → aceleración → velocidad → posición. | [`createSimulation.js:135`](src/simulation/createSimulation.js#L135) |

### Fuerzas

Bloque único dentro de `updateParticles`, [`createSimulation.js:150-205`](src/simulation/createSimulation.js#L150).
La geometría radial (dirección unitaria y distancia con *softening*) se calcula **una vez**
y la comparten atracción y repulsión.

| Fuerza | Línea | Uniforms |
|---|---|---|
| Atracción | [`:156`](src/simulation/createSimulation.js#L156) | `attractEnabled`, `attractStrength` |
| Repulsión | [`:174`](src/simulation/createSimulation.js#L174) | `repelEnabled`, `repelStrength` |
| Fricción | [`:191`](src/simulation/createSimulation.js#L191) | `dragEnabled`, `dragCoefficient` |
| Gravedad | [`:196`](src/simulation/createSimulation.js#L196) | `gravityEnabled`, `gravityStrength` |

### Integración

[`createSimulation.js:207-220`](src/simulation/createSimulation.js#L207). **Euler
semi-implícito** con masa unitaria (`a = F`):

```
v ← v + F·dt          dt = params.dt × timeScale
v ← clamp(v, maxSpeed)     (limita la velocidad, evita explosiones numéricas)
p ← p + v·dt
p ← wrap(p, boundsSize)    (condiciones de contorno periódicas)
```

Se actualiza **primero la velocidad y después la posición** (semi-implícito, no explícito):
es más estable para fuerzas centrales y no gana energía artificialmente en órbitas.

### Render

[`createSimulation.js:224-257`](src/simulation/createSimulation.js#L224). El render **no
recalcula física**: consume el estado de la GPU.

- `SpriteNodeMaterial` con `AdditiveBlending`, `InstancedMesh` de 131 072 instancias.
- `positionNode` ← `positionBuffer` como atributo.
- `scaleNode` ← `particleSize × alive` (una ranura vacía degenera el quad y no rasteriza).
- `colorNode` ← interpola azul `#46a6ff` → naranja `#ffb35a` según `speed / maxSpeed`:
  **el color es un instrumento de lectura**, no decoración; dice dónde está la energía.
- `opacityNode` ← máscara circular × `alive`.

### Controles y modos (CPU)

| Responsabilidad | Dónde |
|---|---|
| Escena, cámara, renderer, loop | [`main.js:62-90`](src/main.js#L62), loop en [`:591`](src/main.js#L591) |
| Proyección puntero → mundo (plano orientado a cámara) | [`main.js:126`](src/main.js#L126) |
| Pincel: emisión de tramos | [`main.js:218`](src/main.js#L218) |
| Modo dibujo / modo LAB-PERFORMANCE | [`main.js:201`](src/main.js#L201), [`:213`](src/main.js#L213) |
| Marcador del atractor (visibilidad y color) | [`main.js:229`](src/main.js#L229), resuelto una vez por frame |
| Mapa tecla → fuerza | [`main.js:294`](src/main.js#L294) |
| Presets de verificación (LAB) | [`main.js:317`](src/main.js#L317) |
| Encendido robusto de fuerza | [`main.js:394`](src/main.js#L394) |
| Toggles de PERFORMANCE + frenado | [`main.js:421`](src/main.js#L421), [`:433`](src/main.js#L433) |
| Intercambio atracción/repulsión (espacio) | [`main.js:450`](src/main.js#L450) |
| Teclado | [`main.js:525`](src/main.js#L525) |
| HUD con estado en vivo | [`main.js:162`](src/main.js#L162), [`:173`](src/main.js#L173) |
| Osciloscopio (lectura de velocidad real desde GPU) | [`main.js:489`](src/main.js#L489), [`oscilloscope.js`](src/ui/oscilloscope.js) |

### Archivos

| Archivo | Responsabilidad |
|---|---|
| [`src/main.js`](src/main.js) | Escena, cámara, renderer, loop, interacción, modos, teclado, HUD. |
| [`src/simulation/parameters.js`](src/simulation/parameters.js) | Uniforms: puente CPU→GPU. Cambiar `.value` no recompila el shader. |
| [`src/simulation/createSimulation.js`](src/simulation/createSimulation.js) | Estado GPU, pasos de compute, fuerzas, integración y render. |
| [`src/ui/labPanel.js`](src/ui/labPanel.js) | Panel de LAB: sliders, casillas y botones de prueba. |
| [`src/ui/oscilloscope.js`](src/ui/oscilloscope.js) | Gráfica de la rapidez media real. |
| [`src/styles.css`](src/styles.css) | Estilos de panel, HUD y osciloscopio. |

---

## 3. Ficha de fuerzas

Notación: `p` posición, `v` velocidad, `A` atractor, `d = max(‖A − p‖, softening)`,
`û = (A − p)/d` (unitario hacia el atractor), `I` = macro `intensity`.

### Fuerza 1 · Atracción — tecla `1`

```
F_a = û · k_a / d  ·  attractEnabled · I
```

| Parámetro | Uniform | Defecto | Rango panel |
|---|---|---|---|
| `k_a` | `attractStrength` | `6.0` | 0 – 20 |
| — | `softening` | `0.35` | fijo |

- **Dirección:** hacia el atractor, que conduce el puntero.
- **Ley:** inversa a la distancia (`1/d`) — **alcance largo**, se intensifica al acercarse.
- **Predicción:** partiendo del reposo, la distancia media al atractor **disminuye**, y
  más deprisa cuanto más cerca.
- **Decisión de diseño:** `softening` acota `d` por abajo. Sin él, una partícula que cae
  sobre el atractor divide por casi cero y sale disparada al infinito — la *singularidad
  radial* documentada en [`PRUEBAS_Y_DEPURACION.md`](PRUEBAS_Y_DEPURACION.md).

### Fuerza 2 · Repulsión — tecla `2`

```
F_r = − û · k_r / d²  ·  repelEnabled · I
```

| Parámetro | Uniform | Defecto | Rango panel |
|---|---|---|---|
| `k_r` | `repelStrength` | `18.0` | 0 – 40 |

- **Dirección:** alejándose del atractor.
- **Ley:** inverso del **cuadrado** — un exponente más que la atracción, así que domina de cerca.
- **Predicción:** partiendo del reposo, la distancia media al atractor **aumenta**.
- **Decisión de diseño — la más importante del proyecto:** la repulsión lleva **siempre un
  exponente más** que la atracción. Si ambas usaran la misma ley serían literalmente la
  misma fuerza con el signo cambiado, y encendidas a la vez (tecla `5`) se restarían hasta
  casi anularse: la tecla «todas juntas» daría el resultado más pobre del instrumento. Con
  exponentes distintos cada una domina en un régimen y **existe un radio de equilibrio**:

  ```
  k_a / d = k_r / d²   ⟹   d_eq = k_r / k_a
  ```

  Con los valores por defecto, `d_eq = 18.0 / 6.0 = 3.0`. El resultado es que `5` ordena la
  figura en una **cáscara** alrededor del atractor en vez de colapsarla o dispersarla. Esto
  es comportamiento emergente de la dinámica, y está **medido** en §4.

- **Por qué `k_r` es tan alto (18) comparado con `k_a` (6).** No es arbitrario: es la
  consecuencia de la decisión anterior. Como la repulsión cae más deprisa —condición
  necesaria para que la cáscara exista— a la distancia de trabajo (3 a 5 unidades) es
  inevitablemente la más débil de las dos. Con un valor bajo la gravedad la vencía y la
  tecla `2` «no hacía nada». Ver la calibración medida más abajo.

### Fuerza 3 · Fricción — tecla `3`

```
F_d = − c · v  ·  dragEnabled            (sin multiplicar por I)
```

| Parámetro | Uniform | Defecto | Rango panel |
|---|---|---|---|
| `c` | `dragCoefficient` | `0.12` | 0 – 1 |

- **Dirección:** opuesta a la velocidad. Es un freno, no un empuje.
- **Predicción:** sobre una figura **quieta no hace nada**; sobre una en movimiento, la
  rapidez crece más despacio (o decae) frente al mismo escenario sin fricción.
- **Decisión de diseño:** es la única fuerza que **no** se escala por `intensity`. Un
  freno debe poder frenar aunque la intensidad esté alta; si se escalara, subir el macro
  aumentaría a la vez el empuje y el freno y el control perdería significado.

### Fuerza 4 · Gravedad — tecla `4`

```
F_g = (0, −1, 0) · g  ·  gravityEnabled · I
```

| Parámetro | Uniform | Defecto | Rango panel |
|---|---|---|---|
| `g` | `gravityStrength` | `1.2` | 0 – 5 |

- **Dirección:** `−Y` constante, **igual en todo el espacio**.
- **Predicción:** la `y` media baja; el efecto **no cambia** si muevo el atractor. Ese es
  el test que la distingue de la atracción.
- **Decisión de diseño:** con las condiciones de contorno periódicas, las partículas caen,
  salen por abajo y reentran por arriba. Combinada con fricción alcanzan velocidad
  terminal, que es la combinación más estable para sostener un tramo largo.

### Macros globales

| Control | Uniform | Efecto | Nota |
|---|---|---|---|
| Rueda | `intensity` | Escala atracción, repulsión y gravedad (0–2) | **No** escala la fricción. |
| Panel LAB | `timeScale` | Escala `dt` | Con `0` congela el sistema entero. |
| Panel LAB | `maxSpeed` | Techo de velocidad | Mín. 0.2: no puede anular el movimiento. |

> **Aprendizaje que costó un bug (ver §6).** Una fuerza no empuja por tener el
> interruptor encendido. El shader multiplica **magnitud × interruptor × intensity**, y
> `dt` se multiplica por `timeScale`. Basta que uno valga cero para que la fuerza sea
> cero. `engageLayer()` ([`main.js:394`](src/main.js#L394)) restablece los tres al
> encender, y solo si están en el valor degenerado cero.

### Gesto: inversión radial (espacio)

Mientras se mantiene pulsado, **intercambia** atracción y repulsión; al soltar deshace el
intercambio. Si ninguna estaba encendida, entra la repulsión, para que el gesto nunca
quede mudo. Antes invertía el signo de una fuerza radial única; con las dos separadas,
invertir *es* intercambiarlas. [`main.js:450`](src/main.js#L450)

### Decisión: qué frena y qué no

Apagar una fuerza no frena nada por sí solo — primera ley de Newton. Con la gravedad eso
se comportaba como un fallo: al apagarla las partículas seguían cayendo indefinidamente
con la velocidad acumulada, reentrando por arriba una y otra vez.

- **Frenan en seco:** apagar gravedad (`4`) y apagar todas (`5`) → `simulation.halt()`.
- **No frenan:** soltar atracción, repulsión o fricción → el sistema sigue por inercia.

Es deliberado: la inercia es la prueba base nº 2 y además es expresiva (soltar la
atracción con la figura comprimida y verla salir disparada). La gravedad es el caso
distinto porque empuja siempre en la misma dirección: su inercia no decae ni se curva,
solo produce una caída perpetua que no vuelve sola a ningún sitio.

---

## 4. Registro de pruebas

**Método.** El bucle de animación solo avanza la física cuando la pestaña se está
componiendo en pantalla, así que «mirar si se mueve» no distingue un fallo de una pestaña
en segundo plano. Todas las pruebas fuerzan pasos deterministas con `stepSimulation()` y
leen los buffers de vuelta desde la GPU con `getArrayBufferAsync`, midiendo posiciones y
velocidades reales. La condición inicial es siempre la misma figura dibujada, restaurada
antes de cada prueba, con el atractor fijado y fuera de la figura.

> **Cuidado al leer velocidades:** en WGSL un `vec3` se alinea a 16 bytes, así que el
> buffer avanza **4 floats por partícula**, no 3. El paso se calcula
> (`floats.length / count`) en vez de asumirse. Ver el bug corregido en
> [`CAMBIOS.md`](CAMBIOS.md).

### Las cinco pruebas base

| # | Prueba | Predicción | Observación | ✔ |
|---|---|---|---|---|
| 1 | **Reposo** — `initialSpeed = 0`, sin fuerzas | Nada se mueve | desplazamiento **1.97 × 10⁻⁷** en 120 pasos; rapidez **0** | ✅ |
| 2 | **Inercia** — `initialSpeed = 0.8`, sin fuerzas | Rapidez constante | **0.3826 → 0.3826** en 120 pasos (variación 0) | ✅ |
| 3 | **Atracción** sola | Distancia al atractor baja | **2.777 → 2.592** en 60 pasos | ✅ |
| 4 | **Repulsión** sola | Distancia al atractor sube | **2.777 → 2.845** en 60 pasos | ✅ |
| 5 | **Gravedad** sola | La `y` media baja | **1.539 → 0.929** en 60 pasos | ✅ |

La prueba de **Reposo** es la que separa este instrumento de una animación: `1.97 × 10⁻⁷`
son unos pocos ULP de `float32`, ruido del `mod` del wrap, no movimiento. Si la figura se
moviera sin fuerzas, algo estaría empujando posiciones fuera del modelo de fuerzas — que
es justo lo que el encargo prohíbe.

### Prueba de fricción (requiere sistema en movimiento)

Un freno sobre una figura quieta no puede hacer nada, así que compararlo contra el reposo
no probaría nada. Se enciende la gravedad para darle velocidad y se compara:

| Escenario | Rapidez media (60 → 120 pasos) |
|---|---|
| Gravedad sola | 1.200 → **2.400** |
| Gravedad + fricción | 1.200 → **2.196** |

La fricción **no invierte** el movimiento, lo amortigua: es exactamente lo que predice
`F = −c·v` bajo una fuerza constante que sigue actuando.

### Prueba específica: el radio de equilibrio atracción/repulsión

Esta es la prueba de la **combinación central** de mi sistema, y la que justifica la
decisión de diseño de los exponentes distintos.

**Predicción analítica.** En equilibrio, `k_a/d = k_r/d²`, luego `d_eq = k_r / k_a`. Con
fricción alta (`c = 0.5`) para disipar la energía, las partículas deben **converger a una
cáscara delgada** de ese radio, sin importar de dónde partan.

**Observación** (1500 pasos, atractor en el origen, figura dibujada lejos):

| `k_a` | `k_r` | `d_eq` predicho | Mediana observada | Banda p10–p90 |
|---|---|---|---|---|
| 6.0 | 18.0 | **3.000** | **3.000** | 3.000 – 3.000 |
| 6.0 | 30.0 | **5.000** | **5.000** | 5.000 – 5.000 |
| 12.0 | 18.0 | **1.500** | **1.500** | 1.500 – 1.500 |

La mediana de partida en los tres casos era ≈3.42, con la figura dispersa. La nube
**converge a la cáscara predicha con p10 y p90 idénticos a tres decimales**: no es una
tendencia, es el radio exacto que dice la ecuación.

**Modificación deliberada de un parámetro y su explicación.** Las filas 2 y 3 son el
cambio deliberado que pide el encargo. Al subir `k_r` de 18 a 30 el radio pasa de 3.0 a
5.0 (`30/6`): más repulsión empuja la cáscara hacia afuera. Al **duplicar `k_a`** de 6 a
12 el radio se reduce a la mitad (3.0 → 1.5): más atracción la comprime. La relación
observada es exactamente `k_r/k_a`. **La predicción y la observación coinciden**, lo que
confirma que el modelo que creo tener es el modelo que está corriendo en la GPU.

Vale la pena subrayar algo: esta predicción se formuló con el par de exponentes `(2,3)` y
sobrevivió intacta al cambiarlos a `(1,2)` para ganar alcance. Que la ecuación siga
acertando después de cambiarle las leyes por debajo es la mejor prueba de que el modelo
está bien entendido y no ajustado a ojo.

### Pruebas de conducción (modo PERFORMANCE)

| Comprobación | Resultado |
|---|---|
| Cada tecla `1`–`5` mueve partículas **en cualquier orden**, incluso forzando estado hostil (`intensity=0`, `timeScale=0`, magnitudes en `0`) antes de cada pulsación | 12 de 12 celdas con desplazamiento > 0 |
| Apagar gravedad → deja de caer | rapidez **0.000000**; desplazamiento en `y` **0.000000** tras 60 pasos |
| Deseleccionar tecla `5` → todo se detiene | rapidez 1.271 → **0.000000** |
| Reactivar la gravedad tras frenar | vuelve a acelerar con normalidad (1.200) |
| Soltar atracción **no** debe frenar (prueba de inercia) | 0.379 → 0.379 → 0.379 tras 30 pasos ✅ |
| Espacio intercambia atracción/repulsión | `attract=1 repel=0` → pulsado `attract=0 repel=1` → soltado `attract=1 repel=0` |

### Un falso positivo, anotado para no repetirlo

Una primera pasada de la prueba de orden dio `0.0000` para la tecla `1`. **No era un fallo
del código sino del arnés de pruebas**, que arrancaba con la atracción ya encendida de una
prueba anterior, de modo que la primera pulsación la *apagaba* — comportamiento correcto
de un interruptor. Al partir de un estado conocido, la celda pasó a 0.081. Lección: fijar
el estado inicial antes de medir un toggle.

---

## 5. Score visual de *LesAlpx*

> ### ⚠️ SECCIÓN PENDIENTE — debe completarla mi escucha
>
> El encargo es explícito: *«La música debe pasar por tu escucha, tu score y tus
> decisiones»*, y prohíbe el control automático por audio. Por eso esta sección **no puede
> generarse ni delegarse**: los tramos y las intenciones tienen que salir de escuchar
> *LesAlpx* y decidir. Lo que sigue es el **andamiaje** —el vocabulario de gestos
> disponible y la plantilla— más **un tramo de ejemplo** que muestra el nivel de detalle
> esperado. Los tiempos están marcados `[ ]` a propósito: los completo con cronómetro en
> mano.

### Vocabulario de conducción disponible

El score no indica posiciones de partículas. Expresa **intenciones y decisiones sobre
fuerzas**. Estos son los gestos que el instrumento sabe ejecutar:

| Intención | Gesto | Resultado dinámico |
|---|---|---|
| Organización | `1` atracción sola | La figura se recoge hacia el atractor |
| Acumulación | `1` + subir rueda | Colapso cada vez más veloz |
| Tensión | `1` + `2` (cáscara) | Equilibrio inestable, la figura «respira» en un radio |
| Estabilidad | `1` + `2` + `3` | La cáscara se asienta y deja de vibrar |
| Ruptura | espacio (invertir) | Lo que atraía repele: estallido desde el centro |
| Dispersión | `2` sola, rueda arriba | Expansión hacia los bordes |
| Transición | mover el atractor con el puntero | El centro de gravedad del campo se desplaza |
| Caída / peso | `4` gravedad | Descenso continuo, reentrada por arriba |
| Suspensión | `4` + `3` | Velocidad terminal: caída sostenida y estable |
| Detención | apagar `4` o `5` | **Frenado en seco**: la figura se queda donde está |
| Recomposición | `0` | La figura vuelve a su estado dibujado |
| Silencio | `R` | Cero partículas |

### Plantilla de score

| Tramo | Tiempo | Qué escucho | Intención | Gesto / controles | Comportamiento esperado |
|---|---|---|---|---|---|
| A — Entrada | `[ 0:00 – ? ]` | | | | |
| B — | `[ ? ]` | | | | |
| C — | `[ ? ]` | | | | |
| D — | `[ ? ]` | | | | |
| E — Cierre | `[ ? – fin ]` | | | | |

### Tramo de ejemplo (nivel de detalle esperado)

| Tramo | Tiempo | Qué escucho | Intención | Gesto / controles | Comportamiento esperado |
|---|---|---|---|---|---|
| **A — Entrada** | `[ 0:00 – ? ]` | Textura sostenida, sin pulso todavía | Materia latente, aún sin orden | Figura ya dibujada · sin fuerzas · rueda a ≈0.3 | La figura permanece inmóvil: presencia sin movimiento (verificado: desplazamiento 10⁻⁷) |
| **B — Primer pulso** | `[ ? ]` | Entra el patrón rítmico | Que la materia empiece a organizarse | `1` atracción · subir rueda gradualmente | La figura se recoge; el color vira de azul a naranja al ganar velocidad |
| **C — Tensión** | `[ ? ]` | Capas superpuestas, densidad creciente | Orden que no termina de cerrarse | `2` repulsión (con `1` activa) | Cáscara en `d ≈ 3.0`: tensión visible entre colapsar y estallar |

**La cadena que debo poder explicar**, y que este score materializa:

```
escucha → intención → score → interpretación → fuerzas → comportamiento emergente
```

En ningún punto de esa cadena hay análisis de audio: no se usa kick, amplitud, beat ni
FFT. El único mecanismo de control soy yo decidiendo qué tecla pulsar y cuándo.

---

## 6. Bitácora de IA

Uso de IA generativa (Claude) sobre el caso de estudio `forces-instrument-u3`, con ciclo
de **especificación → verificación → modificación**. Registro de qué acepté, qué corregí y
qué descarté.

### Ciclo 1 — Dibujar la condición inicial

**Especificación.** «Poder dibujar una figura; que al inicio no haya partículas ni fuerzas;
que las fuerzas entren con teclas; que el reset devuelva a cero partículas; que dibujar no
mueva la cámara.»

**Tensión detectada y resuelta antes de codificar.** El encargo prohíbe «controlar
directamente las posiciones para dibujar una trayectoria coreografiada». Dibujar podía
chocar de frente con eso. Decisión: el trazo es **condición inicial y nada más** — escribe
el estado una sola vez, en el instante de nacer, y no vuelve a tocar posiciones. La prueba
que separa una cosa de la otra es la de **Reposo**.

| Decisión | Resultado |
|---|---|
| ✅ Aceptado | `aliveBuffer` como tercer buffer para que «cero partículas» sea posible con buffers de tamaño fijo |
| ✅ Aceptado | Sellado por **tramos** con reparto estratificado |
| ❌ **Descartado** | Primera propuesta: un dispatch por punto interpolado — llegaba a **64 dispatches por evento de puntero**. Sustituido por un dispatch por tramo |
| ❌ **Descartado** | Medir resultados leyendo píxeles del canvas WebGPU con `drawImage`: devuelve siempre negro. Sustituido por lectura directa de buffers |
| ❌ **Descartado** | `Return()` para saltar ranuras vacías en el shader; preferí envolver la física en un `If` |
| 🔧 **Corregido a la IA** | El osciloscopio leía el buffer de velocidades avanzando **3 floats por partícula**. En WGSL un `vec3` se alinea a 16 bytes: el paso real es **4**. Detectado midiendo el tamaño real del buffer devuelto |

### Ciclo 2 — Las teclas no funcionaban en PERFORMANCE

**Especificación.** «Las fuerzas individuales no funcionan en modo performance; necesito
que además de funcionar en el editor funcionen en performance.»

**🔧 Corrección importante a la IA — primer diagnóstico incompleto.** La IA encontró un
problema real (el vector `wind` arrancaba en `(0,0,0)` y su tecla nunca le daba magnitud),
lo corrigió y **dio el bug por cerrado tras verificar solo esa capa aislada**. Al probarlo,
el fallo seguía. Se lo devolví: *«sigue persistiendo el error… no aplica las fuerzas en las
teclas de la 1 a la 5»*.

**Causa raíz real, encontrada en la segunda vuelta.** Ninguna tecla funcionaba porque el
shader multiplica **magnitud × interruptor × intensity**:

- `intensity` lo conduce la rueda y **llega hasta 0**. Es trivial provocarlo sin querer:
  la rueda está anunciada en el HUD de PERFORMANCE y el panel que mostraría el valor está
  oculto justo en ese modo.
- En LAB no se notaba porque cada tecla pasa por `allLayersOff()`, que devuelve `intensity`
  a 1. En PERFORMANCE **nadie lo restablecía**.

| Modo | `intensity` al pulsar `2` | Desplazamiento |
|---|---|---|
| LAB | 0 → **1** | **0.170** ✅ |
| PERFORMANCE | 0 → **0** | **0.000** ❌ |

| Decisión | Resultado |
|---|---|
| ✅ Aceptado | `engageLayer()`: restablece magnitud, `intensity` y `timeScale` al encender |
| ✅ Aceptado | Restablecer **solo** el valor degenerado cero: si dejé `intensity` en 0.3 a propósito, se respeta |
| ✅ Aceptado | HUD con estado en vivo de las fuerzas y de `intensity` en PERFORMANCE |
| 🔧 Corregido | La IA usó `=== 0` donde el resto del código usa `> 0` para estas banderas; unificado |
| ⚖️ **Criterio propio sobre la skill** | Se pidió aplicar `clean-code-gauntlet`. Su propio filtro clasifica esto como componente de interacción sin infraestructura de tests → indica omitir el pipeline de Jest/Stryker. Apliqué solo lo que sí transfiere (nombres, constantes con nombre, DRY), y eso encontró la inconsistencia anterior |

### Ciclo 3 — Cambio del conjunto de fuerzas

**Especificación.** «Que las fuerzas sean atracción, repulsión, fricción, gravedad y todas
juntas, en las teclas 1 a 5 de performance.»

| Decisión | Resultado |
|---|---|
| ✅ Aceptado | Eliminar vórtice y viento; dividir la capa radial única en dos fuerzas independientes |
| ⭐ **Decisión de diseño propia** | Dar a la repulsión un exponente 3 en lugar de 2. La IA planteaba inicialmente el mismo exponente con signo opuesto, lo que habría hecho que la tecla `5` se anulara. Exigí que «todas juntas» produjera comportamiento emergente, no una resta. De ahí sale el radio de equilibrio, que es ahora la prueba central del sistema |
| ✅ Aceptado | Que el gesto de espacio pase de «invertir signo» a «intercambiar las dos fuerzas» |
| ✅ Aceptado | Tabla `LAYER_MAGNITUDES` data-driven, para que añadir una fuerza no obligue a tocar la lógica de encendido |
| 🔧 Corregido | Actualizar `GUIA_ESTUDIANTE.md` y `PRUEBAS_Y_DEPURACION.md`, que habían quedado describiendo fuerzas inexistentes |

### Ciclo 4 — Que la gravedad frene al soltarla

**Especificación.** «Que al deseleccionar la tecla 5 y/o la gravedad dejen de caer
inmediatamente.»

**Diagnóstico.** No era un fallo del interruptor: era la primera ley de Newton. Quitar una
fuerza deja de acelerar, pero no borra la velocidad acumulada.

| Decisión | Resultado |
|---|---|
| ✅ Aceptado | Nuevo paso de compute `haltParticles`: pone velocidades a cero sin tocar posiciones ni vida |
| ⭐ **Decisión de diseño propia** | Limitar el frenado a gravedad y apagado general. Soltar atracción, repulsión o fricción **sigue** dejando el sistema por inercia, porque es la prueba base nº 2 y porque soltar la atracción con la figura comprimida es un gesto expresivo que quiero conservar. Verificado que la inercia no se rompió: 0.379 → 0.379 |

### Lo que no delegué

- **La decisión de diseño que ordena el proyecto** (el trazo como condición inicial y no
  como trayectoria), porque es la que hace que el encargo se cumpla o no.
- **Los exponentes de atracción y repulsión**, que son lo que convierte la tecla `5` en
  comportamiento emergente.
- **Qué frena y qué no al soltar una fuerza**, que es una decisión interpretativa.
- **El score y la escucha**, por prohibición explícita del encargo.
- **La verificación**: cada cifra de §4 la produje ejecutando el pipeline real de WebGPU y
  leyendo los buffers, no aceptando que «se ve bien».

---

## 7. Autoevaluación ponderada

> **⚠️ Las valoraciones son propuestas, no definitivas.** Están calculadas contra la
> evidencia que existe hoy en el repositorio. Debo confirmarlas o ajustarlas antes de
> entregar, porque el criterio real es **si puedo sostenerlas en la sustentación**: aislar,
> predecir, probar y modificar una fuerza en vivo. La nota de Score refleja que §5 está
> pendiente.

| Criterio | Peso | Evidencia concreta | Valoración |
|---|---:|---|---:|
| **Trazabilidad y comprensión del sistema** | 25 | [§2 Mapa del sistema](#2-mapa-del-sistema) con archivo y línea para estado, fuerzas, integración, render y controles. [§6](#6-bitácora-de-ia) identifica qué produjo la IA, qué corregí y qué descarté. | **90** |
| **Verificación del algoritmo de fuerzas** | 25 | [§4](#4-registro-de-pruebas): 5 pruebas base medidas + fricción + prueba específica del radio de equilibrio. Predicción analítica `d_eq = k_r/k_a` confirmada en **tres** configuraciones (3.000, 5.000, 1.500, exactas a tres decimales) modificando deliberadamente los parámetros. | **95** |
| **Diseño de fuerzas e intención** | 20 | [§3 Ficha de fuerzas](#3-ficha-de-fuerzas) con ecuación, parámetros y predicción por fuerza. Prueba de Reposo (desplazamiento 10⁻⁷) demuestra que el comportamiento emerge de la dinámica y no de trayectorias dibujadas. | **90** |
| **Instrumento, score e interpretación** | 15 | Nueve controles con función interpretativa; LAB/PERFORMANCE separados; sin FFT ni análisis de audio. **Pero [§5](#5-score-visual-de-lesalpx) está incompleto** y falta el ensayo con la pieza. | **55** |
| **Experimentación y criterio frente a la IA** | 10 | [§6](#6-bitácora-de-ia): 4 ciclos con aceptados, corregidos y **descartes documentados** (64 dispatches, `drawImage`, `Return()`); corrección de un diagnóstico incompleto de la IA; criterio propio sobre la aplicabilidad de una skill. | **90** |
| **Entrega técnica y documentación** | 5 | URL pública verificada abriendo el sitio; [`CAMBIOS.md`](CAMBIOS.md) con el proceso completo; esta bitácora. **Pendiente:** commit y push del frenado (§8). | **85** |

### Cálculo de aportes

| Criterio | Peso | Valoración | Aporte (peso × val ÷ 100) |
|---|---:|---:|---:|
| Trazabilidad y comprensión | 25 | 90 | **22.50** |
| Verificación del algoritmo | 25 | 95 | **23.75** |
| Diseño de fuerzas e intención | 20 | 90 | **18.00** |
| Instrumento, score e interpretación | 15 | 55 | **8.25** |
| Experimentación y criterio frente a IA | 10 | 90 | **9.00** |
| Entrega técnica y documentación | 5 | 85 | **4.25** |
| **Total** | **100** | | **85.75** |

**Lectura honesta del total.** Los dos criterios de suficiencia —trazabilidad y
verificación— están sólidos y no dependen de una captura bonita: hay predicción analítica,
observación medida y modificación deliberada de parámetros con explicación de la
diferencia. Lo que baja la nota es real y está en mi mano: **el score visual y el ensayo
con la pieza**. Completar §5 subiría ese criterio y con él el total.

---

## 8. Qué falta y qué no está verificado

Declarado explícitamente para que la bitácora permita reconstruir el estado real.

1. **Score visual (§5) incompleto.** Depende de mi escucha de *LesAlpx*; el encargo lo
   exige así. Está el andamiaje y un tramo de ejemplo; faltan tramos y tiempos.
2. **Ensayo de la interpretación completa** con la pieza sonando, de principio a fin.
3. **Cambios del frenado sin publicar.** `haltParticles` y sus llamadas están en el árbol
   de trabajo pero **no commiteados**. La URL pública sirve la versión anterior (que sí
   tiene ya las cuatro fuerzas nuevas). Para publicarlo:

   ```bash
   git add -A && git commit -m "Frenado al soltar gravedad y bitacora" && git push
   ```

4. **`npm run build` no ejecutado en esta máquina.** El workflow lo ejecuta en CI con
   Node 22 y el despliegue actual funciona, pero no lo he corrido localmente.
5. **Sin pruebas automatizadas.** La verificación es manual y reproducible, ejecutada
   contra el pipeline real de WebGPU en el navegador, no un suite en CI.

---

## 9. Ejecutar y publicar

### Requisitos

- Node.js 22 (Vite 8 requiere Node 20.19+ o 22.12+).
- Navegador con **WebGPU** habilitado (Chrome o Edge actuales).
- Git.

### Local

```bash
npm install
npm run dev
```

Abre la URL que imprime Vite.

### Build de producción

```bash
npm run build
npm run preview
```

`preview` sirve el contenido de `dist/`; úsalo antes de publicar.

### Publicación

El repositorio incluye [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). En
**Settings → Pages** debe estar seleccionado **GitHub Actions** como fuente. Cada push a
`main` instala, construye y despliega. `vite.config.js` usa `base: './'` para que los
assets sean relativos y el mismo build funcione bajo la ruta de proyecto de GitHub Pages.

---

## Documentación complementaria

| Documento | Contenido |
|---|---|
| [`CAMBIOS.md`](CAMBIOS.md) | Registro detallado de cada cambio sobre el proyecto base, con causas, correcciones y tablas de verificación. |
| [`GUIA_ESTUDIANTE.md`](GUIA_ESTUDIANTE.md) | Modelo mental del proyecto y exploraciones guiadas. |
| [`PRUEBAS_Y_DEPURACION.md`](PRUEBAS_Y_DEPURACION.md) | Matriz mínima de pruebas y errores típicos generados por IA. |
