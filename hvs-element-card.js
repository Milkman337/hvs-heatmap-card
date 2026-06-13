// BYD HVS Element Ring Gauge Card
// One animated SVG ring per element (E1–E4), showing avg/min/max temperature.
// Ring fills proportionally within the global temp range; color = temp position (blue→red).

class HVSElementCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set hass(h) { this._hass = h; this._render(); }
  setConfig(c) {
    if (!c.device_id) throw new Error('device_id required');
    this._config = c;
  }
  getCardSize() { return 5; }

  _sid(n) {
    return `sensor.byd_battery_${this._config.device_id}_byd_cell_temperature_tower_1_cell_${String(n).padStart(2, '0')}`;
  }

  _hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  _tempColor(t, lo, hi) {
    const n = Math.max(0, Math.min(1, (t - lo) / Math.max(hi - lo, 0.01)));
    const [r, g, b] = this._hslToRgb(240 - n * 240, 72 + n * 18, 46 - n * 10);
    return `rgb(${r},${g},${b})`;
  }

  // SVG ring gauge: 270° arc (7-o'clock → 5-o'clock through top)
  // R=42, SW=9, viewBox 100×100, center (50,50)
  _ring(avg, eMin, eMax, lo, hi, eNum, isTop, isBottom) {
    const R = 42, SW = 9, CX = 50, CY = 50;
    const circ = 2 * Math.PI * R;       // ≈263.9
    const arcTotal = circ * 0.75;       // 270° ≈197.9

    const avgPct = avg !== null ? Math.max(0, Math.min(1, (avg - lo) / Math.max(hi - lo, 0.01))) : 0;
    const filledAvg = avgPct * arcTotal;

    // Min-max span arc (drawn under the avg arc)
    const minPct = eMin !== null ? Math.max(0, Math.min(1, (eMin - lo) / Math.max(hi - lo, 0.01))) : 0;
    const maxPct = eMax !== null ? Math.max(0, Math.min(1, (eMax - lo) / Math.max(hi - lo, 0.01))) : 0;
    const spanStart = minPct * arcTotal;
    const spanLen = (maxPct - minPct) * arcTotal;

    const color = avg !== null ? this._tempColor(avg, lo, hi) : '#555';
    const minColor = eMin !== null ? this._tempColor(eMin, lo, hi) : '#333';
    const maxColor = eMax !== null ? this._tempColor(eMax, lo, hi) : '#333';

    // tag for top/bottom element label
    const physLabel = isTop ? '↑ top' : isBottom ? '↓ floor' : '';
    const sublabel = physLabel ? `<text x="50" y="84" text-anchor="middle" font-size="5.5" fill="rgba(255,255,255,0.3)" font-family="sans-serif">${physLabel}</text>` : '';

    return `
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
        <!-- Track -->
        <circle cx="${CX}" cy="${CY}" r="${R}"
          fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${SW}"
          stroke-dasharray="${arcTotal} ${circ}"
          transform="rotate(135 ${CX} ${CY})"/>
        <!-- Min-max span arc -->
        ${spanLen > 0 ? `
        <circle cx="${CX}" cy="${CY}" r="${R}"
          fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="${SW + 4}"
          stroke-dasharray="${spanLen} ${circ}"
          stroke-dashoffset="${-spanStart}"
          transform="rotate(135 ${CX} ${CY})"/>` : ''}
        <!-- Avg fill arc -->
        <circle cx="${CX}" cy="${CY}" r="${R}"
          fill="none" stroke="${color}" stroke-width="${SW}" stroke-linecap="round"
          stroke-dasharray="${filledAvg} ${circ}"
          transform="rotate(135 ${CX} ${CY})"
          style="filter:drop-shadow(0 0 5px ${color});transition:stroke-dasharray .9s ease"/>
        <!-- Element label -->
        <text x="${CX}" y="${CY - 8}" text-anchor="middle" font-size="9" font-weight="700"
              fill="rgba(255,255,255,0.4)" font-family="sans-serif">E${eNum}</text>
        <!-- Avg temperature -->
        <text x="${CX}" y="${CY + 8}" text-anchor="middle" font-size="14" font-weight="800"
              fill="${color}" font-family="sans-serif"
              style="filter:drop-shadow(0 0 4px ${color})">
          ${avg !== null ? avg.toFixed(1) : '—'}
        </text>
        <text x="${CX}" y="${CY + 18}" text-anchor="middle" font-size="6" fill="rgba(255,255,255,0.35)" font-family="sans-serif">°C</text>
        ${sublabel}
      </svg>`;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const title = this._config.title || 'BYD HVS Elements';
    const warnDelta = this._config.warn_delta != null ? this._config.warn_delta : 5;

    const elements = [];
    for (let e = 0; e < 4; e++) {
      const temps = [];
      for (let c = 1; c <= 12; c++) {
        const st = this._hass.states[this._sid(e * 12 + c)];
        const v = st && st.state !== 'unavailable' ? parseFloat(st.state) : NaN;
        if (!isNaN(v)) temps.push(v);
      }
      elements.push({
        avg: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
        min: temps.length ? Math.min(...temps) : null,
        max: temps.length ? Math.max(...temps) : null,
        delta: temps.length ? Math.max(...temps) - Math.min(...temps) : null,
      });
    }

    const allVals = elements.flatMap(e => [e.min, e.max]).filter(v => v !== null);
    const globalLo = allVals.length ? Math.min(...allVals) : 20;
    const globalHi = allVals.length ? Math.max(...allVals) : 40;

    let ringsHtml = '';
    for (let e = 0; e < 4; e++) {
      const { avg, min, max, delta } = elements[e];
      const color = avg !== null ? this._tempColor(avg, globalLo, globalHi) : '#555';
      const minC = min !== null ? this._tempColor(min, globalLo, globalHi) : '#555';
      const maxC = max !== null ? this._tempColor(max, globalLo, globalHi) : '#555';
      const isWarn = delta !== null && delta >= warnDelta;
      const isTop = e === 0;
      const isBottom = e === 3;

      ringsHtml += `
        <div class="elem">
          <div class="ring-wrap">
            ${this._ring(avg, min, max, globalLo, globalHi, e + 1, isTop, isBottom)}
          </div>
          <div class="stats">
            <span class="srow"><span class="sl">min</span><span class="sv" style="color:${minC}">${min !== null ? min.toFixed(1) + '°' : '—'}</span></span>
            <span class="srow"><span class="sl">max</span><span class="sv" style="color:${maxC}">${max !== null ? max.toFixed(1) + '°' : '—'}</span></span>
            <span class="srow"><span class="sl">Δ</span><span class="sv${isWarn ? ' warn' : ''}">${delta !== null ? delta.toFixed(1) + '°' : '—'}</span></span>
          </div>
        </div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 14px 12px 14px; }
        .title { font-size:1em; font-weight:600; color:var(--primary-text-color); margin-bottom:14px; }
        .grid { display:flex; gap:4px; justify-content:space-around; }
        .elem { flex:1; display:flex; flex-direction:column; align-items:center; }
        .ring-wrap { width:100%; max-width:110px; }
        .ring-wrap svg { width:100%; height:auto; overflow:visible; }
        .stats { display:flex; flex-direction:column; align-items:center; gap:1px; margin-top:6px; }
        .srow { display:flex; gap:4px; font-size:.6em; line-height:1.5; }
        .sl { color:var(--secondary-text-color); min-width:18px; }
        .sv { font-weight:700; color:var(--primary-text-color); }
        .sv.warn { color:var(--warning-color,#f59e0b); }
      </style>
      <ha-card>
        <div class="title">${title}</div>
        <div class="grid">${ringsHtml}</div>
      </ha-card>`;
  }
}

customElements.define('hvs-element-card', HVSElementCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hvs-element-card',
  name: 'HVS Battery Element Gauges',
  description: 'Per-element SVG ring gauges — avg/min/max/spread with glow effect',
  preview: false,
});
