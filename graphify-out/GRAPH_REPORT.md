# Graph Report - u3_simulacion  (2026-08-17)

## Corpus Check
- 12 files · ~3,726 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 82 nodes · 118 edges · 7 communities
- Extraction: 72% EXTRACTED · 26% INFERRED · 2% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.78)
- Token cost: 0 input · 96,035 output

## Community Hubs (Navigation)
- Simulation Engine & UI Runtime
- Simulation Concepts & Common Errors
- Dependencies & Build Scripts
- Force Explorations & Test Matrix
- Deployment Pipeline
- Project Overview & Controls

## God Nodes (most connected - your core abstractions)
1. `README.md (U3 · Forces Instrument)` - 11 edges
2. `main()` - 6 edges
3. `createSimulation()` - 6 edges
4. `createLabPanel()` - 6 edges
5. `Deploy to GitHub Pages Workflow` - 6 edges
6. `src/simulation/createSimulation.js (estado GPU, fuerzas, integración, render)` - 6 edges
7. `Matriz mínima de pruebas` - 6 edges
8. `createOscilloscope()` - 5 edges
9. `scripts` - 4 edges
10. `Build de producción (npm run build / preview)` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Checklist de entrega técnica` --semantically_similar_to--> `Build de producción (npm run build / preview)`  [INFERRED] [semantically similar]
  PRUEBAS_Y_DEPURACION.md → README.md
- `Install step (npm install)` --semantically_similar_to--> `Build de producción (npm run build / preview)`  [INFERRED] [semantically similar]
  .github/workflows/deploy.yml → README.md
- `Build step (npm run build)` --semantically_similar_to--> `Build de producción (npm run build / preview)`  [INFERRED] [semantically similar]
  .github/workflows/deploy.yml → README.md
- `index.html (entrada HTML de Vite)` --semantically_similar_to--> `U3 · Forces Instrument (proyecto)`  [INFERRED] [semantically similar]
  index.html → README.md
- `Controles (panel y mapeo de teclado/puntero)` --semantically_similar_to--> `Controles del intérprete (teclado/puntero)`  [INFERRED] [semantically similar]
  GUIA_ESTUDIANTE.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Matriz mínima de pruebas (Inercia, +X, Atracción, Repulsión, Vórtice)** — pruebas_y_depuracion_prueba_inercia, pruebas_y_depuracion_prueba_x, pruebas_y_depuracion_prueba_atraccion, pruebas_y_depuracion_prueba_repulsion, pruebas_y_depuracion_prueba_vortice [EXTRACTED 1.00]
- **Cinco exploraciones del modo LAB** — guia_estudiante_exploracion_inercia, guia_estudiante_exploracion_fuerza_constante_x, guia_estudiante_exploracion_atraccion, guia_estudiante_exploracion_repulsion, guia_estudiante_exploracion_vortice [EXTRACTED 1.00]
- **Archivos que debes entender primero (arquitectura mental del proyecto)** — src_main_file, src_simulation_parameters_file, src_simulation_createsimulation_file, src_ui_labpanel_file [EXTRACTED 1.00]

## Communities (7 total, 0 thin omitted)

### Community 0 - "Simulation Engine & UI Runtime"
Cohesion: 0.17
Nodes (8): main(), createSimulation(), createParameters(), button(), checkRow(), createLabPanel(), rangeRow(), createOscilloscope()

### Community 1 - "Simulation Concepts & Common Errors"
Cohesion: 0.18
Nodes (15): Cómo trabajar con IA (flujo de prompting disciplinado), División de responsabilidades CPU y GPU, Estado (positionBuffer, velocityBuffer), Fuerzas (bloque force), Integración (actualización de v y p), Modelo mental (controles→uniforms→GPU→buffers→render), Render (SpriteNodeMaterial + InstancedMesh), TSL (Three.js Shading Language) (+7 more)

### Community 2 - "Dependencies & Build Scripts"
Cohesion: 0.13
Nodes (14): dependencies, three, devDependencies, vite, name, private, scripts, build (+6 more)

### Community 3 - "Force Explorations & Test Matrix"
Cohesion: 0.18
Nodes (12): Exploración: Atracción, Exploración: Fuerza constante +X, Exploración: Inercia, Exploración: Repulsión, Exploración: Vórtice, Error: singularidad radial, Matriz mínima de pruebas, Prueba: Atracción (+4 more)

### Community 4 - "Deployment Pipeline"
Cohesion: 0.31
Nodes (9): Build step (npm run build), Deploy to GitHub Pages step, Deploy to GitHub Pages Workflow, Install step (npm install), Upload Pages artifact step (path ./dist), Error: publicación rota (GitHub Pages), Build de producción (npm run build / preview), Publicar en GitHub Pages (+1 more)

### Community 5 - "Project Overview & Controls"
Cohesion: 0.28
Nodes (9): Controles (panel y mapeo de teclado/puntero), #app root div, index.html (entrada HTML de Vite), Error: demasiados parámetros, Controles del intérprete (teclado/puntero), README.md (U3 · Forces Instrument), U3 · Forces Instrument (proyecto), src/main.js (escena, cámara, renderer, loop, interacción, modos) (+1 more)

## Ambiguous Edges - Review These
- `src/simulation/parameters.js (parámetros/uniforms)` → `Error: dt demasiado grande`  [AMBIGUOUS]
  PRUEBAS_Y_DEPURACION.md · relation: conceptually_related_to
- `src/simulation/createSimulation.js (estado GPU, fuerzas, integración, render)` → `TSL (Three.js Shading Language)`  [AMBIGUOUS]
  GUIA_ESTUDIANTE.md · relation: conceptually_related_to

## Knowledge Gaps
- **11 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `src/simulation/parameters.js (parámetros/uniforms)` and `Error: dt demasiado grande`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `src/simulation/createSimulation.js (estado GPU, fuerzas, integración, render)` and `TSL (Three.js Shading Language)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `README.md (U3 · Forces Instrument)` connect `Project Overview & Controls` to `Simulation Concepts & Common Errors`, `Deployment Pipeline`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **Why does `Matriz mínima de pruebas` connect `Force Explorations & Test Matrix` to `Simulation Concepts & Common Errors`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `createSimulation()` (e.g. with `dispose()` and `reset()`) actually correct?**
  _`createSimulation()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dependencies & Build Scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._