# Graph Report - u3_simulacion  (2026-08-15)

## Corpus Check
- Corpus is ~3,726 words - fits in a single context window. You may not need a graph.

## Summary
- 71 nodes · 103 edges · 7 communities
- Extraction: 88% EXTRACTED · 11% INFERRED · 1% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.5)
- Token cost: 59,374 input · 0 output

## Community Hubs (Navigation)
- Build & Deployment Pipeline
- Package Configuration
- Simulation Core Modules
- Force Exploration Tests
- Simulation Pipeline Concepts
- Lab Panel UI Controls
- App Entry Point

## God Nodes (most connected - your core abstractions)
1. `README` - 14 edges
2. `Guía del estudiante` - 12 edges
3. `Cinco exploraciones` - 7 edges
4. `main()` - 6 edges
5. `createSimulation()` - 6 edges
6. `createLabPanel()` - 6 edges
7. `createOscilloscope()` - 5 edges
8. `Deploy to GitHub Pages Workflow` - 5 edges
9. `Validación y depuración` - 5 edges
10. `Criterio de dominio` - 5 edges

## Surprising Connections (you probably didn't know these)
- `README` --references--> `vite`  [EXTRACTED]
  README.md → package.json
- `Validación y depuración` --complements--> `Guía del estudiante`  [AMBIGUOUS]
  PRUEBAS_Y_DEPURACION.md → GUIA_ESTUDIANTE.md
- `src/simulation/parameters.js` --supplies_parameters_to--> `force Block`  [INFERRED]
  README.md → GUIA_ESTUDIANTE.md
- `Errores típicos generados por IA` --warns_about--> `GitHub Pages`  [EXTRACTED]
  PRUEBAS_Y_DEPURACION.md → .github/workflows/deploy.yml
- `README` --documents--> `npm install`  [EXTRACTED]
  README.md → .github/workflows/deploy.yml

## Import Cycles
- None detected.

## Communities (7 total, 0 thin omitted)

### Community 0 - "Build & Deployment Pipeline"
Cohesion: 0.20
Nodes (14): Checklist de entrega técnica, GitHub Actions, GitHub Pages, Deploy to GitHub Pages Workflow, Keyboard/Pointer Controls, LAB Mode, src/ui/labPanel.js, Node.js 22 (+6 more)

### Community 1 - "Package Configuration"
Cohesion: 0.13
Nodes (14): dependencies, three, devDependencies, vite, name, private, scripts, build (+6 more)

### Community 2 - "Simulation Core Modules"
Cohesion: 0.21
Nodes (4): main(), createSimulation(), createParameters(), createOscilloscope()

### Community 3 - "Force Exploration Tests"
Cohesion: 0.24
Nodes (10): Atracción Test, Atractor (Attractor Point), Errores típicos generados por IA, GPU Compute Pass, Fuerza constante +X Test, Cinco exploraciones, Inercia Test, Validación y depuración (+2 more)

### Community 4 - "Simulation Pipeline Concepts"
Cohesion: 0.36
Nodes (9): Cómo trabajar con IA, src/simulation/createSimulation.js, Criterio de dominio, force Block, Guía del estudiante, Velocity/Position Integration, SpriteNodeMaterial + InstancedMesh Render, positionBuffer / velocityBuffer (+1 more)

### Community 5 - "Lab Panel UI Controls"
Cohesion: 0.70
Nodes (4): button(), checkRow(), createLabPanel(), rangeRow()

### Community 6 - "App Entry Point"
Cohesion: 0.67
Nodes (3): index.html Entry Point, src/main.js, U3 · Forces Instrument

## Ambiguous Edges - Review These
- `Guía del estudiante` → `Validación y depuración`  [AMBIGUOUS]
  README.md · relation: complements

## Knowledge Gaps
- **17 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Guía del estudiante` and `Validación y depuración`?**
  _Edge tagged AMBIGUOUS (relation: complements) - confidence is low._
- **Why does `README` connect `Build & Deployment Pipeline` to `Package Configuration`, `Force Exploration Tests`, `Simulation Pipeline Concepts`, `App Entry Point`?**
  _High betweenness centrality (0.357) - this node is a cross-community bridge._
- **Why does `vite` connect `Package Configuration` to `Build & Deployment Pipeline`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `createSimulation()` (e.g. with `dispose()` and `reset()`) actually correct?**
  _`createSimulation()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._