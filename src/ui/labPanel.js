function rangeRow(parent, label, object, key, min, max, step, onInput, getValue) {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  const lab = document.createElement('label');
  const name = document.createElement('span');
  const value = document.createElement('span');
  value.className = 'value';
  name.textContent = label;
  lab.append(name, value);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(object[key]);
  const refresh = () => {
    object[key] = Number(input.value);
    value.textContent = Number(input.value).toFixed(step < 0.01 ? 3 : 2);
    onInput?.(object[key]);
  };
  input.addEventListener('input', refresh);
  refresh();
  wrap.append(lab, input);
  parent.append(wrap);
  return {
    input,
    refresh() {
      if (getValue) {
        const next = Number(getValue());
        object[key] = next;
        input.value = String(next);
        value.textContent = next.toFixed(step < 0.01 ? 3 : 2);
      }
    }
  };
}

function checkRow(parent, label, initial, onChange, getValue) {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  const lab = document.createElement('label');
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = initial;
  input.addEventListener('change', () => onChange(input.checked));
  lab.append(name, input);
  wrap.append(lab);
  parent.append(wrap);
  return {
    input,
    refresh() { if (getValue) input.checked = Boolean(getValue()); }
  };
}

function button(parent, label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  parent.append(b);
  return b;
}

export function createLabPanel({
  params,
  onReset,
  onRestore,
  onSeedCloud,
  onDrawToggle,
  onPreset,
  onModeChange,
  onPauseChange
}) {
  const refreshers = [];
  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.innerHTML = `
    <h1>LesAlpx · Instrumento de capas</h1>
    <p>Dibuja la figura (condición inicial), luego conduce las fuerzas.
    <strong>P</strong> cambia a PERFORMANCE.</p>
  `;

  // FIGURA -----------------------------------------------------------------
  // La figura dibujada es la condición inicial, no una trayectoria: define
  // dónde nacen las partículas, no por dónde tienen que pasar.
  const figure = document.createElement('div');
  figure.className = 'group';
  figure.innerHTML = '<h2>Figura (condición inicial)</h2><p>El trazo decide dónde nacen las partículas. Nacen quietas: nada se mueve hasta que activas una capa.</p>';
  panel.append(figure);

  const state = {
    brushRadius: params.brushRadius.value,
    initialSpeed: params.initialSpeed.value,
    timeScale: params.timeScale.value,
    maxSpeed: params.maxSpeed.value,
    particleSize: params.particleSize.value,
    intensity: params.intensity.value,
    attractStrength: params.attractStrength.value,
    repelStrength: params.repelStrength.value,
    dragCoefficient: params.dragCoefficient.value,
    gravityStrength: params.gravityStrength.value
  };

  // Se guarda la referencia de este botón (los demás no la necesitan) porque
  // tiene que reflejar el estado del modo dibujo: la tecla D puede cambiarlo sin
  // pasar por el panel, y el botón quedaría mintiendo. Lo sincroniza setDrawMode().
  const drawButton = button(figure, 'Modo dibujo: OFF · D', () => onDrawToggle?.());
  refreshers.push(rangeRow(figure, 'brushRadius (grosor)', state, 'brushRadius', 0.01, 0.4, 0.005, (v) => params.brushRadius.value = v, () => params.brushRadius.value));
  // initialSpeed vive aquí, junto al pincel, y no en «Simulación», porque solo
  // afecta a las partículas en el instante de nacer: cambiarlo no mueve nada de
  // lo ya dibujado, solo lo que se dibuje o restaure a partir de ahora.
  refreshers.push(rangeRow(figure, 'initialSpeed (al nacer)', state, 'initialSpeed', 0, 2, 0.01, (v) => params.initialSpeed.value = v, () => params.initialSpeed.value));
  button(figure, 'Restaurar figura · 0', () => onRestore?.());
  button(figure, 'Sembrar nube de prueba', () => onSeedCloud?.());

  const sim = document.createElement('div');
  sim.className = 'group';
  sim.innerHTML = '<h2>Simulación</h2>';
  panel.append(sim);

  refreshers.push(rangeRow(sim, 'timeScale', state, 'timeScale', 0, 2, 0.01, (v) => params.timeScale.value = v, () => params.timeScale.value));
  refreshers.push(rangeRow(sim, 'maxSpeed', state, 'maxSpeed', 0.2, 12, 0.1, (v) => params.maxSpeed.value = v, () => params.maxSpeed.value));
  refreshers.push(rangeRow(sim, 'particleSize', state, 'particleSize', 0.005, 0.1, 0.001, (v) => params.particleSize.value = v, () => params.particleSize.value));
  refreshers.push(rangeRow(sim, 'intensity (macro)', state, 'intensity', 0, 2, 0.01, (v) => params.intensity.value = v, () => params.intensity.value));

  const layers = document.createElement('div');
  layers.className = 'group';
  layers.innerHTML = '<h2>Fuerzas</h2><p>Cada fuerza entra o sale de la mezcla, no es un adorno visual. Atracción y repulsión apuntan al atractor (el puntero); la gravedad es un campo constante hacia abajo.</p>';
  panel.append(layers);

  refreshers.push(checkRow(layers, '1 · Atracción', params.attractEnabled.value > 0, (v) => params.attractEnabled.value = v ? 1 : 0, () => params.attractEnabled.value > 0));
  refreshers.push(rangeRow(layers, 'attractStrength', state, 'attractStrength', 0, 8, 0.05, (v) => params.attractStrength.value = v, () => params.attractStrength.value));
  refreshers.push(checkRow(layers, '2 · Repulsión', params.repelEnabled.value > 0, (v) => params.repelEnabled.value = v ? 1 : 0, () => params.repelEnabled.value > 0));
  refreshers.push(rangeRow(layers, 'repelStrength', state, 'repelStrength', 0, 8, 0.05, (v) => params.repelStrength.value = v, () => params.repelStrength.value));
  refreshers.push(checkRow(layers, '3 · Fricción (drag)', params.dragEnabled.value > 0, (v) => params.dragEnabled.value = v ? 1 : 0, () => params.dragEnabled.value > 0));
  refreshers.push(rangeRow(layers, 'dragCoefficient', state, 'dragCoefficient', 0, 1, 0.01, (v) => params.dragCoefficient.value = v, () => params.dragCoefficient.value));
  refreshers.push(checkRow(layers, '4 · Gravedad', params.gravityEnabled.value > 0, (v) => params.gravityEnabled.value = v ? 1 : 0, () => params.gravityEnabled.value > 0));
  refreshers.push(rangeRow(layers, 'gravityStrength', state, 'gravityStrength', 0, 5, 0.05, (v) => params.gravityStrength.value = v, () => params.gravityStrength.value));

  const tests = document.createElement('div');
  tests.className = 'group';
  tests.innerHTML = '<h2>Pruebas de capa (verificación)</h2><p>Cada prueba aísla una capa y devuelve la figura a su estado dibujado. Predice qué debería ocurrir antes de pulsar.</p>';
  panel.append(tests);
  for (const [id, label] of [
    ['inercia', '0 · Inercia (sin fuerzas)'],
    ['atraccion', '1 · Atracción sola'],
    ['repulsion', '2 · Repulsión sola'],
    ['friccion', '3 · Fricción sola'],
    ['gravedad', '4 · Gravedad sola'],
    ['todas', '5 · Todas juntas']
  ]) button(tests, label, () => onPreset(id));

  const actions = document.createElement('div');
  actions.className = 'group';
  actions.innerHTML = '<h2>Acciones</h2>';
  panel.append(actions);
  button(actions, 'Reset: cero partículas · R', onReset);
  button(actions, 'Pausar / continuar', () => onPauseChange());
  button(actions, 'LAB / PERFORMANCE', () => onModeChange());

  document.body.append(panel);

  return {
    element: panel,
    setVisible(visible) { panel.classList.toggle('hidden', !visible); },
    // Lo llama main.js cada vez que cambia el modo dibujo, venga del botón o de
    // la tecla D, para que panel y estado real no se desincronicen.
    setDrawMode(active) {
      drawButton.textContent = active ? 'Modo dibujo: ON · D' : 'Modo dibujo: OFF · D';
      drawButton.classList.toggle('active', active);
    },
    refresh() { for (const item of refreshers) item.refresh(); }
  };
}
