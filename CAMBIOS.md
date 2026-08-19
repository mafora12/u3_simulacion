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

## Bug: las teclas 1–5 no aplicaban fuerzas en PERFORMANCE

**Síntoma reportado.** Las teclas de capa funcionan en LAB (el editor) pero en
PERFORMANCE no aplican ninguna fuerza a la figura dibujada. Se esperaba poder cambiar de
fuerza con cada tecla sin importar el orden en que se pulsen.

**Primer diagnóstico, incompleto.** La primera revisión encontró un problema real —el
vector `wind` arranca en `(0,0,0)` y la tecla `3` nunca le daba magnitud— y lo corrigió,
pero se dio el bug por cerrado tras verificar **solo esa capa de forma aislada**. Esa
verificación no reproducía el flujo real, donde el estado se arrastra entre modos, así
que dejó pasar la causa principal, que afectaba a **las cinco teclas a la vez**.

**Causa raíz.** El shader no aplica una fuerza por tener el interruptor encendido.
Multiplica tres factores, y basta con que uno valga cero para que la fuerza sea cero:

```
fuerza = magnitud_de_la_capa × interruptor × intensity        (y  dt = dt × timeScale)
```

Los dos multiplicadores **globales** son los culpables, y ninguno es visible en
PERFORMANCE:

- **`intensity`** — la rueda del ratón lo conduce en vivo y llega hasta `0`. Con `0`,
  Textura, Núcleo y Pulso empujan con fuerza cero. Es trivial provocarlo sin querer: la
  rueda está anunciada en el HUD de PERFORMANCE, y el panel —lo único que mostraba el
  valor— está **oculto** justamente en ese modo.
- **`timeScale`** — multiplica `dt`. Con `0` el sistema entero queda congelado por muchas
  capas que se enciendan.

Y por debajo, la magnitud propia de cada capa también puede estar en cero (`wind` siempre
arranca así; las demás si se baja su slider a `0` en LAB).

**Por qué LAB sí funcionaba (la asimetría exacta).** En LAB, cada tecla pasa por
`allLayersOff()`, que devuelve `intensity` a `1`, y por `applyPreset()`, que fija la
magnitud de la capa aislada. Las tres condiciones quedan restablecidas en cada pulsación.
En PERFORMANCE, `toggleLayer()` solo invertía el interruptor y **no restablecía nada**.
No era un problema "del modo performance": era que solo LAB reponía las condiciones
necesarias para que una capa se oiga.

Medido en el navegador, con `intensity` en 0 y la misma tecla `2`:

| Modo | `intensity` al pulsar | Desplazamiento medio |
|---|---|---|
| LAB | 0 → **1** (lo restaura `allLayersOff`) | **0.170** ✅ |
| PERFORMANCE | 0 → **0** (no lo restaura nadie) | **0.000** ❌ |

**Corrección** (`src/main.js`):

- Tabla `LAYER_MAGNITUDES`: qué uniform lleva la magnitud de cada capa y con qué valor
  revive si está en cero. Es data-driven para que añadir una capa no obligue a tocar la
  lógica de encendido. Los valores de reposo coinciden con `parameters.js`, salvo `wind`,
  que allí arranca en cero y toma la dirección del preset de LAB.
- `engageLayer(enabledKey)`: único camino de encendido. Enciende el interruptor y
  restablece las tres condiciones —magnitud propia, `intensity` y `timeScale`— **solo
  cuando están en el valor degenerado cero**. Si el intérprete dejó `intensity` en `0.3`
  o subió `vortexStrength` a `6`, se respeta su elección: se repara el silencio, no se
  pisa una decisión.
- `toggleLayer()`, `toggleAllLayers()` (tecla `5`) y el gesto de **espacio** (invertir
  núcleo) pasan todos por `engageLayer`. Apagar sigue siendo apagar: la reparación solo
  ocurre al encender.
- **El HUD de PERFORMANCE ahora muestra el estado en vivo**: `1 Pulso ● · 2 Núcleo ○ …`
  más el valor de `intensity`. Sin esto, una capa encendida pero muda es indistinguible
  de una apagada, que es exactamente lo que hacía el bug tan desconcertante. La rueda
  refresca el HUD porque es el control capaz de enmudecerlo todo sin tocar interruptores.

**Cómo se verificó.** El bucle de animación solo avanza la física cuando la pestaña se
está componiendo en pantalla, así que "mirar si se mueve" no distingue un bug de una
pestaña en segundo plano. Se forzaron pasos deterministas con `stepSimulation()` y se
midió el **desplazamiento real de posiciones** leyendo el buffer de vuelta desde la GPU
(`getArrayBufferAsync`), no solo la velocidad.

Partiendo de un estado deliberadamente hostil —`intensity = 0`, `timeScale = 0` y las
magnitudes de todas las capas en `0`— sobre una figura dibujada, 40 pasos por tecla:

| Orden de pulsación | Desplazamiento por tecla |
|---|---|
| `1 → 2 → 3` | 0.319 · 0.617 · 0.759 |
| `3 → 1 → 2` | 0.342 · 0.745 · 1.018 |
| `2 → 3 → 1` | 0.055 · 0.450 · 0.846 |
| `5` (todas) | 0.501 — revive las cuatro capas, `intensity` y `timeScale` |

Antes de la corrección, **todas** esas celdas eran `0.000`. Cada tecla se rescata a sí
misma de forma independiente: entre prueba y prueba se volvió a forzar `intensity` a cero
con la rueda y la siguiente tecla siguió sonando, que es la independencia de orden pedida.

También se comprobó que una elección deliberada sobrevive: con `intensity = 0.3` y
`vortexStrength = 6`, pulsar `1` mantiene ambos valores intactos.

## Cambio de conjunto de fuerzas: atracción, repulsión, fricción y gravedad

**Qué se pidió.** Reemplazar las fuerzas del instrumento por **atracción, repulsión,
fricción, gravedad** y **todas juntas**, accesibles con las teclas `1`–`5` en PERFORMANCE.

**Qué había antes.** Cuatro capas heredadas de la lectura de LesAlpx: Pulso (vórtice),
Núcleo (radial, donde el *signo* decidía si atraía o repelía), Textura (viento) y
Fricción. Atracción y repulsión no eran dos fuerzas: eran la misma con el signo cambiado.

**Qué hay ahora.**

| Tecla | Fuerza | Ley | Notas |
|---|---|---|---|
| `1` | Atracción | `+dir · k / d²` | Hacia el atractor (lo conduce el puntero). |
| `2` | Repulsión | `−dir · k / d³` | Alejándose del atractor. |
| `3` | Fricción | `−c · v` | Freno. No se escala por `intensity`. |
| `4` | Gravedad | `(0, −g, 0)` | Campo uniforme; no depende del atractor. |
| `5` | Todas juntas | — | Las cuatro a la vez. |

Se eliminaron el vórtice y el viento, y la capa radial única se dividió en dos
independientes (`attractEnabled`/`attractStrength` y `repelEnabled`/`repelStrength`).

**La decisión de diseño: por qué los exponentes son distintos.** Si atracción y repulsión
usaran las dos la ley del inverso del cuadrado, serían literalmente la misma fuerza con el
signo cambiado y, encendidas a la vez con la tecla `5`, se restarían hasta casi anularse:
la tecla "todas juntas" daría el resultado más soso del instrumento. Haciendo que la
repulsión caiga con el **cubo** de la distancia, cada una domina en un régimen distinto
—la repulsión de cerca, la atracción de lejos— y existe un radio de equilibrio en
`d = k_repulsión / k_atracción`. Con los valores por defecto (2.0 y 2.2) ese radio cae en
≈ 0.9 unidades, dentro del espacio visible. El resultado es que `5` ordena la figura en
una **cáscara** alrededor del atractor, con la gravedad arrastrándola y la fricción
impidiendo que se dispare: un comportamiento emergente, que es justo lo que pide el
encargo, en lugar de una resta que se cancela.

**La gravedad no es una atracción con otro nombre.** La atracción apunta al atractor y
depende de la distancia; la gravedad es un campo uniforme hacia `-Y`, igual en todo el
espacio. Con las condiciones de contorno periódicas, las partículas caen, salen por abajo
y vuelven a entrar por arriba. Combinada con la fricción alcanzan velocidad terminal.

**Cambios por archivo.**

- `src/simulation/parameters.js` — fuera `windEnabled`/`wind`, `vortexEnabled`/
  `vortexStrength`, `radialEnabled`/`radialStrength`. Dentro `attractEnabled`/
  `attractStrength` (2.2), `repelEnabled`/`repelStrength` (2.0), `gravityEnabled`/
  `gravityStrength` (1.2). Se conservan `attractor` y `softening`, que ahora sirven a las
  dos fuerzas radiales.
- `src/simulation/createSimulation.js` — el bloque de fuerzas pasa a las cuatro nuevas. La
  geometría radial (dirección unitaria y distancia con `softening`) se calcula **una vez**
  y la comparten atracción y repulsión.
- `src/main.js` — `LAYER_KEYS` y `LAYER_MAGNITUDES` remapeadas; presets de LAB reescritos
  (`atraccion`, `repulsion`, `friccion`, `gravedad`, `todas`); `allLayersOff()` ahora
  recorre `LAYER_KEYS` en vez de listar uniforms a mano, así que añadir una fuerza ya no
  obliga a acordarse de tocarlo.
- `src/ui/labPanel.js` — grupo «Fuerzas» con las cuatro casillas y sus magnitudes, y los
  seis botones de prueba renombrados.

**El gesto de la barra espaciadora.** Antes invertía el signo de la fuerza radial. Con
atracción y repulsión ya separadas, invertir es **intercambiarlas**: mientras se mantiene
pulsada, la que estaba encendida cede el sitio a la otra, y al soltar se deshace el
intercambio. Si no había ninguna encendida entra la repulsión, para que el gesto nunca
quede mudo.

**Cómo se verificó.** Con pasos de física deterministas (`stepSimulation()`) y lectura de
los buffers de vuelta desde la GPU, sobre una figura dibujada y con el atractor fijado
lejos de ella. Cada fuerza se midió con la magnitud que la distingue de las demás:

| Tecla | Métrica | Antes → después (60 pasos) |
|---|---|---|
| `1` Atracción | distancia media al atractor | 2.777 → **2.592** (se acerca) |
| `2` Repulsión | distancia media al atractor | 2.777 → **2.845** (se aleja) |
| `4` Gravedad | `y` media | 1.539 → **0.929** (cae) |
| `3` Fricción | rapidez media bajo gravedad | sin fricción 1.200 → 2.400; **con fricción 1.200 → 2.196** |
| `5` Todas | interruptores | `attract=1 repel=1 drag=1 gravity=1` |
| espacio | interruptores | `attract=1 repel=0` → pulsado `attract=0 repel=1` → soltado `attract=1 repel=0` |

La fricción se mide contra un sistema **en movimiento** a propósito: sobre una figura
quieta un freno no puede hacer nada, así que compararla contra el reposo no probaría nada.

Se repitió además la prueba de independencia de orden del bug anterior, ahora con el
conjunto nuevo y forzando el estado hostil (`intensity = 0`, `timeScale = 0` y todas las
magnitudes en `0`) **antes de cada pulsación**:

| Orden | Desplazamiento por tecla |
|---|---|
| `1 → 2 → 4` | 0.081 · 0.118 · 0.323 |
| `4 → 1 → 2` | 0.273 · 0.605 · 0.633 |
| `2 → 4 → 1` | 0.031 · 0.236 · 0.543 |
| `1 → 4 → 2` | 0.081 · 0.399 · 0.576 |

Ninguna celda en cero: cada tecla se rescata a sí misma sin importar el orden.

**Un falso positivo durante la verificación**, anotado porque es fácil repetirlo: una
primera pasada dio `0.0000` para la tecla `1`. No era un fallo del código sino del arnés
de pruebas, que arrancaba con la atracción ya encendida de una prueba anterior, de modo
que la primera pulsación la **apagaba** —comportamiento correcto de un interruptor—. Al
partir de un estado conocido, la celda pasó a 0.081. Conviene fijar el estado inicial
antes de medir un toggle.

## Controles

| Tecla | Acción |
|---|---|
| `D` | Entra/sale del modo dibujo. Bloquea la órbita mientras dibujas. |
| `1` | Atracción (hacia el atractor). |
| `2` | Repulsión (alejándose del atractor). |
| `3` | Fricción (freno). |
| `4` | Gravedad (campo constante hacia abajo). |
| `5` | Las cuatro fuerzas juntas. |
| `0` | Devuelve la figura a su estado dibujado, sin borrarla. |
| `R` | Reset: cero partículas, ninguna fuerza, figura olvidada. |
| `P` | LAB / PERFORMANCE. |
| espacio | Intercambia atracción y repulsión mientras se mantiene pulsado. |
| rueda | Macro de intensidad. |
| puntero | Dibuja (en modo dibujo) o mueve el atractor (fuera de él). |

El mismo número señala siempre la misma fuerza. Lo que cambia es qué significa pulsarlo:
en LAB la aísla y restaura la figura para verificarla; en PERFORMANCE la mete o la saca
de la mezcla en vivo, sin cortar el sistema.

En PERFORMANCE el HUD muestra qué fuerzas están dentro de la mezcla y cuánto vale
`intensity` (`1 Atracción ● · 2 Repulsión ○ · …`), porque el panel está oculto en ese modo
y sin esa línea una fuerza encendida pero muda no se distingue de una apagada.

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
