# Graph Report - u3_simulacion  (2026-08-15)

## Corpus Check
- Corpus is ~4,953 words - fits in a single context window. You may not need a graph.

## Summary
- 90 nodes · 132 edges · 7 communities
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.5)
- Token cost: 81,564 input · 0 output

## Community Hubs (Navigation)
- Layers & Live Controls
- Simulation Core Modules
- Docs & LesAlpx Context
- Package Configuration
- Mental Model & Pitfalls
- App Modes & Delivery

## God Nodes (most connected - your core abstractions)
1. `U3 · Forces Instrument` - 9 edges
2. `Núcleo (capa radial)` - 9 edges
3. `Matriz Mínima (pruebas LAB)` - 9 edges
4. `Mapa de Control (referencia técnica)` - 8 edges
5. `main()` - 6 edges
6. `createSimulation()` - 6 edges
7. `createLabPanel()` - 6 edges
8. `Textura (capa viento)` - 6 edges
9. `Pulso (capa vórtice)` - 6 edges
10. `Fricción (capa drag)` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Checklist de Entrega Técnica` --verifies--> `Deploy to GitHub Pages Workflow`  [INFERRED]
  PRUEBAS_Y_DEPURACION.md → .github/workflows/deploy.yml
- `Matriz Mínima (pruebas LAB)` --tests_via--> `Tecla 0 (preset inercia, solo LAB)`  [EXTRACTED]
  PRUEBAS_Y_DEPURACION.md → README.md
- `Guía del Estudiante` --defers_to--> `Partitura de Interpretación · LesAlpx`  [EXTRACTED]
  GUIA_ESTUDIANTE.md → PARTITURA_LESALPX.md
- `Checklist de Entrega Técnica` --verifies_completion_of--> `Partitura de Interpretación · LesAlpx`  [EXTRACTED]
  PRUEBAS_Y_DEPURACION.md → PARTITURA_LESALPX.md
- `Validación y Depuración` --tests_repulsion_via--> `Espacio (invertir signo del Núcleo)`  [EXTRACTED]
  PRUEBAS_Y_DEPURACION.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Tecla 5 aísla/activa las 4 capas a la vez** — key_5, capa_textura, capa_nucleo, capa_pulso, capa_friccion [EXTRACTED]
- **Checklist exige poder explicar estado, fuerzas, integración, render y controles** — delivery_checklist, estado_concept, fuerzas_concept, integracion_concept, render_concept, controles_concept [EXTRACTED]

## Communities (7 total, 0 thin omitted)

### Community 0 - "Layers & Live Controls"
Cohesion: 0.16
Nodes (21): Fricción (capa drag), Núcleo (capa radial), Pulso (capa vórtice), Textura (capa viento), Error: singularidad radial, Tecla 1 (Pulso), Tecla 2 (Núcleo), Tecla 3 (Textura) (+13 more)

### Community 1 - "Simulation Core Modules"
Cohesion: 0.17
Nodes (8): main(), createSimulation(), createParameters(), button(), checkRow(), createLabPanel(), rangeRow(), createOscilloscope()

### Community 2 - "Docs & LesAlpx Context"
Cohesion: 0.16
Nodes (15): Controles (panel + mapeo teclado/puntero), Crush (álbum), Error: publicación rota, Error: demasiados parámetros, Floating Points (Sam Shepherd), GitHub Pages, Deploy to GitHub Pages Workflow, Guía del Estudiante (+7 more)

### Community 3 - "Package Configuration"
Cohesion: 0.13
Nodes (14): dependencies, three, devDependencies, vite, name, private, scripts, build (+6 more)

### Community 4 - "Mental Model & Pitfalls"
Cohesion: 0.31
Nodes (9): src/simulation/createSimulation.js, Error: dt demasiado grande, Error: actualizar partículas en JavaScript, Error: confundir render shader con compute, Estado (positionBuffer, velocityBuffer), Fuerzas (bloque force), Integración (actualización v/p), Modelo Mental (controles→parámetros→compute→buffers→render) (+1 more)

### Community 5 - "App Modes & Delivery"
Cohesion: 0.31
Nodes (8): Checklist de Entrega Técnica, U3 · Forces Instrument, Tecla 0 (preset inercia, solo LAB), Tecla P (LAB / PERFORMANCE), Tecla R (reset), LAB Mode, src/main.js, PERFORMANCE Mode

## Knowledge Gaps
- **21 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `U3 · Forces Instrument` connect `App Modes & Delivery` to `Layers & Live Controls`, `Docs & LesAlpx Context`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `src/simulation/createSimulation.js` connect `Mental Model & Pitfalls` to `Docs & LesAlpx Context`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `Partitura de Interpretación · LesAlpx` connect `Docs & LesAlpx Context` to `App Modes & Delivery`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._