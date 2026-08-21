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

## Apagar la gravedad ahora frena de verdad

**Qué se pidió.** Que al deseleccionar la tecla `5` y/o la gravedad, las partículas dejen
de caer inmediatamente.

**Por qué no ocurría.** No era un fallo del interruptor: era la primera ley de Newton.
Quitar una fuerza deja de **acelerar** el sistema, pero no le quita la velocidad que ya
había acumulado. Con la gravedad eso se notaba como un fallo evidente: tras unos segundos
cayendo, las partículas llevaban una velocidad considerable, y al apagarla seguían bajando
a velocidad constante para siempre —reapareciendo por arriba una y otra vez por las
condiciones de contorno periódicas—. Físicamente impecable; como gesto de instrumento,
inservible: apagar la gravedad tiene que significar «deja de caer».

**Corrección.**

- `src/simulation/createSimulation.js` — nuevo paso de compute `haltParticles`, que pone
  las velocidades a cero **sin tocar posiciones ni el flag de vida**: la figura se queda
  exactamente donde está, pero quieta. Se expone como `halt()`. Es distinto de `reset()`
  (que vacía el sistema) y de `restoreFigure()` (que rehace el trazo): aquí no se pierde
  ni se mueve nada, solo se anula el movimiento.
- `src/main.js` — `toggleLayer()` llama a `simulation.halt()` al apagar la gravedad, y
  `toggleAllLayers()` lo llama al apagar todas las fuerzas con la tecla `5`.

**Qué NO frena, y por qué.** Soltar atracción, repulsión o fricción sigue dejando el
sistema en movimiento por inercia. Es deliberado por dos razones: es la **prueba de
Inercia** que documenta `GUIA_ESTUDIANTE.md` (sin fuerzas, lo que se movía sigue
moviéndose), y es una herramienta expresiva —soltar la atracción justo cuando la figura
está más comprimida y verla salir disparada—. La gravedad es el caso distinto porque es
la única que empuja siempre en la misma dirección: su inercia no decae ni se curva, solo
produce una caída perpetua que no vuelve sola a ningún sitio.

**Cómo se verificó.** Con pasos deterministas y lectura de los dos buffers desde la GPU:

| Momento | Rapidez media | `y` media |
|---|---|---|
| Cayendo, gravedad ON (60 pasos) | 1.200 | 0.928 |
| Justo al apagar la gravedad | **0.000000** | 0.928 |
| 60 pasos después, sin fuerzas | **0.000000** | **0.928** (desplazamiento 0.000000) |

| Comprobación | Resultado |
|---|---|
| Tecla `5` encendida (las cuatro) | rapidez 1.271 |
| Tecla `5` deseleccionada | rapidez **0.000000**, desplazamiento en `y` **0.000000** |
| Gravedad reactivada tras el frenado | rapidez 1.200 — vuelve a acelerar con normalidad |
| Soltar la atracción (no debe frenar) | 0.379 → 0.379 → 0.379 tras 30 pasos: la inercia se conserva |

La última fila es la que protege la prueba de Inercia: el frenado se aplica donde se pidió
y en ningún otro sitio.

## Calibración de escala: hacer evidentes atracción y repulsión

**Qué se pidió.** Que las fuerzas 1 y 2 atraigan y repelan de forma **evidente** hacia
donde está el cursor —«no se está viendo casi»— y que **funcionen con la gravedad
encendida**, porque con ella activa ninguna de las dos hacía nada.

**Los dos síntomas eran el mismo problema: escala.** Las leyes originales eran
`k_a/d²` (atracción, `k_a = 2.2`) y `k_r/d³` (repulsión, `k_r = 2.0`). En un mundo de
`boundsSize = 10`, las distancias de trabajo van de 2 a 5 unidades, y ahí el inverso del
cuadrado ya no vale casi nada:

| distancia | atracción `2.2/d²` | gravedad (constante) | resultado |
|---|---|---|---|
| d = 2 | 0.55 | 1.2 | gravedad **2.2×** más fuerte |
| d = 3 | 0.24 | 1.2 | gravedad **4.9×** más fuerte |
| d = 5 | 0.09 | 1.2 | gravedad **13.6×** más fuerte |

La fuerza era despreciable más allá de un radio de ~2 unidades. Por eso «no se veía casi»
y por eso la gravedad —que es constante en todo el espacio— la borraba por completo. No
era un bug de lógica: el interruptor funcionaba y la dirección era correcta. Era que la
**magnitud a la distancia real de uso** estaba uno o dos órdenes por debajo de lo
necesario.

**Corrección 1 — cambio de las leyes de caída.** Se bajó un exponente a cada una:

| | Antes | Ahora |
|---|---|---|
| Atracción | `k_a / d²` | **`k_a / d`** |
| Repulsión | `k_r / d³` | **`k_r / d²`** |

Lo esencial es que **la repulsión conserva un exponente más que la atracción**, que es la
condición que hace existir la cáscara. Igualando `k_a/d = k_r/d²` sale `d_eq = k_r / k_a`:
**la misma relación** que con el par anterior. El cambio da alcance sin romper el modelo.

**Corrección 2 — recalibrado de magnitudes.**

| Parámetro | Antes | Ahora | Razón |
|---|---|---|---|
| `attractStrength` | 2.2 | **6.0** | A d=3 vale 2.0, por encima de la gravedad (1.2) |
| `repelStrength` | 2.0 | **18.0** | Ver abajo |
| `d_eq` resultante | 0.909 | **3.0** | Esfera amplia y legible en vez de un nudo diminuto |

El valor alto de `repelStrength` no es arbitrario, es la consecuencia inevitable del
diseño: como la repulsión **debe** caer más deprisa para que la cáscara exista, a la
distancia de trabajo es siempre la más débil de las dos. Una primera pasada con
`repelStrength = 5.5` mejoró la repulsión aislada (+0.259 frente a +0.068) pero **seguía
perdiendo contra la gravedad**: repulsión + gravedad daba −0.076, es decir, las partículas
seguían acercándose. Subirla a 18 fue lo que resolvió el síntoma reportado.

**Corrección 3 — el marcador del atractor ahora se ve en PERFORMANCE.** Parte de «no se
ve» no era física sino de lectura: el marcador estaba oculto en PERFORMANCE, así que no
había forma de saber **hacia dónde** tiraban las fuerzas. Se veía a las partículas
moverse, pero no hacia qué. Ahora:

- Aparece en PERFORMANCE mientras atracción o repulsión estén activas.
- **Cambia de color** según cuál manda: azul frío `#7fd4ff` para atracción, naranja cálido
  `#ff9a5a` para repulsión, blanco en reposo.
- Sigue ocultándose mientras dibujas, porque ahí el puntero es pincel y no atractor.
- La regla depende de cuatro cosas que cambian por caminos distintos (modo, modo dibujo y
  los dos interruptores radiales). En vez de repetirla en cada sitio —que es como se
  desincronizan— se resuelve en **un único lugar, una vez por frame**, desde el bucle de
  render (`updateAttractorHelper`). Se eliminaron las asignaciones duplicadas que había en
  `setMode` y `setDrawMode`.

**Cómo se verificó.** Desplazamiento de la distancia media al atractor, 60 pasos, misma
figura y mismo atractor:

| Escenario | Antes | Ahora |
|---|---|---|
| Atracción sola | −0.185 | **−0.984** (5.3× más) |
| Repulsión sola | +0.068 | **+0.794** (11.7× más) |
| Gravedad sola (referencia) | −0.343 | −0.343 |
| **Atracción + gravedad** | apenas distinguible de gravedad sola | **−1.344** (frente a −0.343: la atracción manda) |
| **Repulsión + gravedad** | **−0.076** (la gravedad ganaba) | **+0.473** (la repulsión manda) |

Las dos filas en negrita son exactamente el síntoma reportado, ahora resuelto: con la
gravedad encendida, la atracción acerca cuatro veces más que la gravedad sola, y la
repulsión **invierte el signo** del desplazamiento.

**La predicción del radio de equilibrio sobrevivió al cambio de leyes**, que es la mejor
señal de que el modelo estaba bien entendido y no ajustado a ojo:

| `k_a` | `k_r` | `d_eq` predicho | Mediana observada | Banda p10–p90 |
|---|---|---|---|---|
| 6.0 | 18.0 | **3.000** | **3.000** | 3.000 – 3.000 |
| 6.0 | 30.0 | **5.000** | **5.000** | 5.000 – 5.000 |
| 12.0 | 18.0 | **1.500** | **1.500** | 1.500 – 1.500 |

Partiendo de una mediana de ≈3.42 con la figura dispersa, la nube converge al radio
predicho con p10 y p90 idénticos a tres decimales.

**Verificación del marcador**, en los siete estados que puede tomar:

| Estado | Visible | Color |
|---|---|---|
| LAB, sin fuerzas | sí | blanco |
| LAB, dibujando | **no** | — |
| PERFORMANCE, sin radiales | **no** | — |
| PERFORMANCE + atracción | sí | azul `#7fd4ff` |
| PERFORMANCE + repulsión | sí | naranja `#ff9a5a` |
| PERFORMANCE, apagadas | **no** | — |
| PERFORMANCE + tecla 5 | sí | naranja (de cerca manda la repulsión) |

**Rangos del panel ampliados** para que los nuevos valores sean alcanzables:
`attractStrength` 0–20 (antes 0–8) y `repelStrength` 0–40 (antes 0–8).

## El punto de fuerza no se podía conducir con el puntero

**Qué se pidió.** «No me deja guiar el punto de atracción o repulsión con el puntero del
mouse, necesito controlar eso.»

**Lo primero fue descartar lo obvio.** Medido en el navegador, el atractor **sí** seguía
al puntero y la física **sí** obedecía: al colocarlo arriba a la izquierda, el centroide
de la figura se acercó a él de 5.648 a 4.382 en 90 pasos. El uniform llegaba a la GPU sin
problema. El fallo no estaba en el mecanismo sino en el **gesto**.

**Causa 1 — el botón izquierdo hacía dos cosas a la vez y se estorbaban.** Al arrastrar
en LAB, el atractor se movía *y la cámara orbitaba al mismo tiempo*:

| Arrastrando a | Atractor | Cámara |
|---|---|---|
| (680, 370) | (0.57, −0.14) | (−0.19, 0.05, 11.00) |
| (760, 390) | (1.70, −0.43) | (−1.11, 0.28, 10.94) |
| (840, 410) | (2.75, −0.71) | (−2.66, 0.67, 10.65) |

Y como el plano de trabajo se construye con la **dirección de la cámara** como normal
—decisión correcta, y necesaria para dibujar con la vista orbitada—, girar la vista mueve
la referencia sobre la que se proyecta el puntero. Es decir: el punto se recalculaba
contra un sistema que se estaba moviendo debajo del propio gesto. Se iba solo mientras
intentabas llevarlo.

**Causa 2 — no se podía aparcar.** El atractor iba pegado al puntero en todo momento, sin
pulsar nada. Cualquier movimiento de la mano —ir a pulsar una tecla, apartarse— arrastraba
el punto de fuerza consigo. En una interpretación en vivo eso no es conducir: es no poder
soltar.

**Causa 3 — el punto podía salirse del mundo.** El encuadre es más ancho que el volumen
simulado: los bordes de la pantalla caían en `x ≈ ±7.69` con el mundo terminando en `±5`.
Fuera de la caja, las partículas eran atraídas hacia un punto al otro lado de la pared
periódica, y el resultado no se leía como atracción sino como fuga.

**Corrección.**

- **Los dos gestos se separaron por botón.** El izquierdo queda para el instrumento
  (dibujar la figura y arrastrar el punto de fuerza); la órbita pasa al **botón derecho**
  vía `orbit.mouseButtons = { LEFT: null, MIDDLE: DOLLY, RIGHT: ROTATE }`. Orbitar es para
  encuadrar antes de tocar, no mientras se toca.
- **El atractor pasa a ser un objeto que se agarra y se suelta.** Se arrastra con el botón
  izquierdo y **se queda donde lo dejes**. El cursor lo anuncia: `grab` en reposo,
  `grabbing` mientras lo llevas.
- **Se acota al volumen simulado** (`±boundsSize/2 − 0.2` = ±4.8), así que el gesto siempre
  apunta a un sitio con sentido físico.
- **El marcador se ve mientras lo arrastras**, aunque no haya ninguna fuerza radial
  encendida: no se puede colocar a ciegas un punto que no se ve.
- **Se suprime el menú contextual** en el canvas. OrbitControls ya lo hacía, pero solo
  mientras está habilitado, y en PERFORMANCE está apagado: sin esto, un clic derecho en
  mitad de la interpretación abriría el menú del navegador encima de la obra.

**Cómo se verificó.**

| Comprobación | Resultado |
|---|---|
| Puntero moviéndose **sin** botón | atractor **no** se mueve: queda aparcado en (0.00, 0.00) |
| Arrastre izquierdo | atractor (−1.99, 0.57) → (0.85, −0.57) → (3.70, −1.71) |
| Cámara durante ese arrastre | **(0.00, 0.00, 11.00) sin cambio** — ya no gira |
| Cursor | `grab` → `grabbing` → `grab` |
| Tras soltar y mover el puntero | sigue aparcado en (3.70, −1.71) |
| Arrastre a la esquina de la pantalla | acotado a (−4.80, 4.80), dentro de la caja |
| **Botón derecho** | cámara (0.00, 0.00, 11.00) → (−0.94, 0.33, 10.95) **sin mover el atractor** |
| Menú contextual | `defaultPrevented = true` |
| **Regresión: dibujo** | 2304 partículas selladas; el atractor no se movió al dibujar |
| Marcador, PERFORMANCE sin fuerzas, sin arrastrar | oculto |
| Marcador, PERFORMANCE sin fuerzas, **arrastrando** | **visible** |
| Marcador, PERFORMANCE + atracción | visible, azul `#7fd4ff` |

**Nota de método.** Una primera pasada dio por buena la visibilidad del marcador leyendo
`attractorHelper.visible` sin recalcularlo: como el bucle de render no avanza con el panel
del navegador oculto, ese valor era de un frame anterior y no probaba nada. Se repitió
exponiendo `updateAttractorHelper()` y forzando el recálculo. Leer un estado que nadie ha
actualizado es una forma fácil de creer que algo se verificó.

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
