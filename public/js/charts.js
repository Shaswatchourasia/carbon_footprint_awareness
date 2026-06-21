const SVG_NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function polarPoint(cx, cy, r, degrees) {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Renders the "emission ring" gauge: a tree-ring / instrument-dial hybrid.
 * The filled arc represents the user's projected annual footprint against a
 * scale; thin tick marks mark the country benchmark and the Paris-aligned
 * target, so the ring carries comparative meaning, not just a raw number.
 */
export function renderGauge(svg, { valueTonnes, benchmarkTonnes, targetTonnes }) {
  svg.innerHTML = '';
  const cx = 120;
  const cy = 120;
  const r = 92;
  const circumference = 2 * Math.PI * r;

  const scaleMax = Math.max(valueTonnes, benchmarkTonnes, targetTonnes) * 1.35 || 1;
  const valueFraction = Math.min(1, valueTonnes / scaleMax);
  const isOverBenchmark = valueTonnes > benchmarkTonnes;

  // Track
  svg.appendChild(
    el('circle', {
      cx, cy, r,
      fill: 'none',
      stroke: 'var(--line)',
      'stroke-width': 14,
    })
  );

  // Value arc
  const valueArc = el('circle', {
    cx, cy, r,
    fill: 'none',
    stroke: isOverBenchmark ? 'var(--clay)' : 'var(--leaf)',
    'stroke-width': 14,
    'stroke-linecap': 'round',
    'stroke-dasharray': `${circumference * valueFraction} ${circumference}`,
    transform: `rotate(-90 ${cx} ${cy})`,
  });
  svg.appendChild(valueArc);

  // Benchmark + target tick marks
  const addTick = (fraction, color, labelText) => {
    const angle = fraction * 360;
    const inner = polarPoint(cx, cy, r - 11, angle);
    const outer = polarPoint(cx, cy, r + 11, angle);
    svg.appendChild(
      el('line', {
        x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y,
        stroke: color, 'stroke-width': 3,
      })
    );
    const labelPoint = polarPoint(cx, cy, r + 24, angle);
    const text = el('text', {
      x: labelPoint.x, y: labelPoint.y,
      'text-anchor': 'middle',
      'font-size': '9',
      'font-family': 'var(--font-mono)',
      fill: color,
    });
    text.textContent = labelText;
    svg.appendChild(text);
  };

  addTick(Math.min(1, benchmarkTonnes / scaleMax), 'var(--ink-soft)', 'avg');
  addTick(Math.min(1, targetTonnes / scaleMax), 'var(--leaf-dark)', 'target');

  // Center readout
  const bigNumber = el('text', {
    x: cx, y: cy - 4,
    'text-anchor': 'middle',
    'font-family': 'var(--font-display)',
    'font-size': '38',
    fill: 'var(--ink)',
  });
  bigNumber.textContent = valueTonnes.toFixed(1);
  svg.appendChild(bigNumber);

  const unit = el('text', {
    x: cx, y: cy + 20,
    'text-anchor': 'middle',
    'font-family': 'var(--font-mono)',
    'font-size': '11',
    fill: 'var(--muted)',
  });
  unit.textContent = 't CO2e / yr';
  svg.appendChild(unit);
}

/**
 * Renders the category breakdown as a simple, accessible horizontal bar
 * list (real DOM elements, not canvas) so screen readers can read each row.
 */
export function renderCategoryBars(container, perCategoryMonthlyKg, topCategory) {
  container.innerHTML = '';
  const max = Math.max(...Object.values(perCategoryMonthlyKg), 1);

  const sorted = Object.entries(perCategoryMonthlyKg).sort((a, b) => b[1] - a[1]);

  for (const [category, kg] of sorted) {
    const li = document.createElement('li');
    li.className = 'bar-row' + (category === topCategory ? ' is-top' : '');

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = category;

    const track = document.createElement('span');
    track.className = 'bar-track';
    const fill = document.createElement('span');
    fill.className = 'bar-fill';
    fill.style.width = `${Math.max(2, (kg / max) * 100)}%`;
    track.appendChild(fill);

    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = `${kg.toFixed(0)} kg/mo`;

    li.append(label, track, value);
    li.setAttribute('aria-label', `${category}: ${kg.toFixed(0)} kilograms per month`);
    container.appendChild(li);
  }
}
