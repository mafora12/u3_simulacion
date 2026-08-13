// Traza tipo osciloscopio: NO lee audio. Grafica la velocidad promedio real
// de las partículas (leída del propio compute shader), así la onda sigue
// siendo comportamiento emergente del sistema, no un visualizador de música.
export function createOscilloscope({ maxSamples = 240 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'oscilloscope-wrap';
  wrap.innerHTML = '<div class="oscilloscope-label">Velocidad promedio del sistema</div>';

  const canvas = document.createElement('canvas');
  canvas.className = 'oscilloscope';
  canvas.width = 320;
  canvas.height = 96;
  wrap.append(canvas);
  document.body.append(wrap);

  const ctx = canvas.getContext('2d');
  const samples = [];

  function push(value) {
    samples.push(value);
    if (samples.length > maxSamples) samples.shift();
  }

  function draw(scale) {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (samples.length < 2) return;
    ctx.strokeStyle = '#5ad1ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    samples.forEach((v, i) => {
      const x = (i / (maxSamples - 1)) * width;
      const norm = Math.min(1, v / Math.max(scale, 0.0001));
      const y = height - norm * height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  return {
    push,
    draw,
    setVisible(visible) { wrap.classList.toggle('hidden', !visible); }
  };
}
