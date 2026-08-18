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
    radialStrength: params.radialStrength.value,
    vortexStrength: params.vortexStrength.value,
    dragCoefficient: params.dragCoefficient.value,
    windX: params.wind.value.x,
    windY: params.wind.value.y
  };

  const drawButton = button(figure, 'Modo dibujo: OFF · D', () => onDrawToggle?.());
  refreshers.push(rangeRow(figure, 'brushRadius (grosor)', state, 'brushRadius', 0.01, 0.4, 0.005, (v) => params.brushRadius.value = v, () => params.brushRadius.value));
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
  layers.innerHTML = '<h2>Capas</h2><p>Cada capa es algo que entra o sale de la mezcla, no un adorno visual.</p>';
  panel.append(layers);

  refreshers.push(checkRow(layers, '1 · Pulso (vórtice)', params.vortexEnabled.value > 0, (v) => params.vortexEnabled.value = v ? 1 : 0, () => params.vortexEnabled.value > 0));
  refreshers.push(rangeRow(layers, 'vortexStrength', state, 'vortexStrength', -8, 8, 0.05, (v) => params.vortexStrength.value = v, () => params.vortexStrength.value));
  refreshers.push(checkRow(layers, '2 · Núcleo (radial)', params.radialEnabled.value > 0, (v) => params.radialEnabled.value = v ? 1 : 0, () => params.radialEnabled.value > 0));
  refreshers.push(rangeRow(layers, 'radialStrength', state, 'radialStrength', -8, 8, 0.05, (v) => params.radialStrength.value = v, () => params.radialStrength.value));
  refreshers.push(checkRow(layers, '3 · Textura (viento)', params.windEnabled.value > 0, (v) => params.windEnabled.value = v ? 1 : 0, () => params.windEnabled.value > 0));
  refreshers.push(rangeRow(layers, 'wind.x', state, 'windX', -4, 4, 0.05, (v) => params.wind.value.x = v, () => params.wind.value.x));
  refreshers.push(rangeRow(layers, 'wind.y', state, 'windY', -4, 4, 0.05, (v) => params.wind.value.y = v, () => params.wind.value.y));
  refreshers.push(checkRow(layers, '4 · Fricción (drag)', params.dragEnabled.value > 0, (v) => params.dragEnabled.value = v ? 1 : 0, () => params.dragEnabled.value > 0));
  refreshers.push(rangeRow(layers, 'dragCoefficient', state, 'dragCoefficient', 0, 1, 0.01, (v) => params.dragCoefficient.value = v, () => params.dragCoefficient.value));

  const tests = document.createElement('div');
  tests.className = 'group';
  tests.innerHTML = '<h2>Pruebas de capa (verificación)</h2><p>Cada prueba aísla una capa y devuelve la figura a su estado dibujado. Predice qué debería ocurrir antes de pulsar.</p>';
  panel.append(tests);
  for (const [id, label] of [
    ['inercia', '0 · Inercia (sin capas)'],
    ['pulso', '1 · Pulso solo'],
    ['nucleo', '2 · Núcleo solo'],
    ['textura', '3 · Textura sola'],
    ['friccion', '4 · Fricción sola'],
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
    setDrawMode(active) {
      drawButton.textContent = active ? 'Modo dibujo: ON · D' : 'Modo dibujo: OFF · D';
      drawButton.classList.toggle('active', active);
    },
    refresh() { for (const item of refreshers) item.refresh(); }
  };
}
