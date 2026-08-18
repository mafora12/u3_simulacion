# U3 · Forces Instrument mariana 

Proyecto base que servirá como caso de estudio. Nos permitirá abordar los conceptos 
necesarios para comprender el código generado por la IA al momente 
de materializar las ideas.

## Requisitos

- Node.js 22 recomendado (Vite 8 requiere Node 20.19+ o 22.12+).
- Navegador con WebGPU habilitado; usa una versión actual de Chrome, Edge o un navegador con soporte equivalente.
- Git necesario para clonar el repositorio y trabajar localmente.

## Clonar y poner en funcionamiento

Clona el repositorio y entra en la carpeta del proyecto:

```bash
git clone https://github.com/juanferfranco/forces-instrument-u3.git
cd forces-instrument-u3
```

Instala las dependencias:

```bash
npm install
```

Inicia el servidor de desarrollo:

```bash
npm run dev
```

Abre en el navegador la URL local que muestra Vite. Se necesita un navegador con WebGPU habilitado.

## Ejecutar

```bash
npm install
npm run dev
```

Abre la URL que imprime Vite.

## Build de producción

```bash
npm run build
npm run preview
```

`preview` sirve el contenido construido en `dist/`; úsalo antes de publicar.

## Cómo se toca

El instrumento arranca vacío: **cero partículas y ninguna fuerza activa**. El flujo es
dibujar primero y conducir fuerzas después.

1. Pulsa `D` y traza una figura con el puntero. Esa figura es la **condición inicial**:
   define dónde nacen las partículas, no por dónde tienen que pasar. Nacen quietas.
2. Vuelve a pulsar `D` para salir del modo dibujo. Ahí recuperas la órbita de cámara.
3. Activa capas de fuerza con `1`–`4` y observa qué le ocurre a tu figura.

Dibujar **no** coreografía el movimiento: no se tocan posiciones a mano en ningún
momento. El trazo sólo siembra el estado inicial y todo lo que pasa después emerge de
las fuerzas del compute shader.

## Controles

- `D`: entra/sale del modo dibujo. Mientras dibujas, la órbita de cámara queda
  bloqueada, para que arrastrar el puntero trace en lugar de girar la vista.
- `P`: LAB / PERFORMANCE.
- `R`: reset al estado inicial: cero partículas, ninguna fuerza y figura olvidada.
- `0`: devuelve la figura a su estado dibujado, sin borrarla.
- `1`–`4`: las cuatro capas de fuerza (Pulso, Núcleo, Textura, Fricción). En LAB
  aíslan una capa y restauran la figura para poder verificarla; en PERFORMANCE la
  meten o sacan de la mezcla en vivo, sin cortar el sistema.
- `5`: todas las capas.
- puntero (fuera del modo dibujo): mueve el atractor de la capa Núcleo.
- rueda: macro de intensidad.
- espacio (PERFORMANCE): invierte temporalmente el signo de la fuerza radial.

## Publicar en GitHub Pages

El repositorio ya incluye `.github/workflows/deploy.yml`.

1. Crea un repositorio en GitHub y sube estos archivos a la rama `main`.
2. En **Settings → Pages**, selecciona **GitHub Actions** como fuente.
3. Haz push a `main`.
4. El workflow ejecutará `npm install`, build y despliegue.

`vite.config.js` usa `base: './'` para que los assets sean relativos y el mismo build funcione bajo una ruta de proyecto de GitHub Pages.

## Archivos que debes entender primero

1. `src/main.js`: escena, cámara, renderer, loop, interacción y modos.
2. `src/simulation/parameters.js`: parámetros/uniforms accesibles desde CPU.
3. `src/simulation/createSimulation.js`: estado GPU, fuerzas, integración y render.
4. `src/ui/labPanel.js`: controles del laboratorio y escenarios de exploración.

Lee la `GUIA_ESTUDIANTE.md` para comprender la estructura del proyecto y 
cómo se relacionan los archivos.

## Documentación complementaria

- [Guía del estudiante](GUIA_ESTUDIANTE.md)
- [Validación y depuración](PRUEBAS_Y_DEPURACION.md)
