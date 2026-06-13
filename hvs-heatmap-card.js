class HVSHeatmapCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    if (!config.device_id) {
      throw new Error('device_id is required (e.g. p030t020z2309050895)');
    }
    this._config = config;
  }

  getCardSize() {
    return 8;
  }

  _sensorId(globalCell) {
    return `sensor.byd_battery_${this._config.device_id}_byd_cell_temperature_tower_1_cell_${String(globalCell).padStart(2, '0')}`;
  }

  // Smooth HSL gradient: blue (240°) → cyan → green → yellow → red (0°)
  _tempToColor(t, lo, hi) {
    if (t === null) return { bg: 'rgba(80,80,80,0.25)', fg: '#555', border: 'rgba(255,255,255,0.05)' };
    const n = Math.max(0, Math.min(1, (t - lo) / Math.max(hi - lo, 0.01)));
    const hue = 240 - n * 240;
    const sat = 75 + n * 15;          // 75% → 90%
    const light = 48 - n * 10;        // 48% → 38%
    const bg = `hsl(${hue.toFixed(1)},${sat.toFixed(0)}%,${light.toFixed(0)}%)`;
    const fg = light > 42 ? '#fff' : (light > 36 ? '#ffe' : '#fff');
    const border = `hsla(${hue.toFixed(1)},${sat.toFixed(0)}%,${(light + 20).toFixed(0)}%,0.35)`;
    return { bg, fg, border };
  }

  _render() {
    if (!this._hass || !this._config) return;

    const ELEMENTS = 4;
    const CPE = 12; // cells per element
    const title = this._config.title || 'BYD HVS Temperature Heatmap';

    const grid = [];
    for (let e = 0; e < ELEMENTS; e++) {
      const row = [];
      for (let c = 0; c < CPE; c++) {
        const id = this._sensorId(e * CPE + c + 1);
        const st = this._hass.states[id];
        row.push(st && st.state !== 'unavailable' ? parseFloat(st.state) : null);
      }
      grid.push(row);
    }

    const flat = grid.flat().filter(v => v !== null && !isNaN(v));
    const lo = flat.length ? Math.min(...flat) : 20;
    const hi = flat.length ? Math.max(...flat) : 40;
    const avg = flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : null;
    const missing = ELEMENTS * CPE - flat.length;

    // Each element is a column; cells run top-to-bottom within the column.
    // E1 (bottom of stack) on the left, E4 (top) on the right.
    // Within each element, cell 1 at top, cell 12 at bottom.
    let cols = '';
    for (let e = 1; e <= ELEMENTS; e++) {
      const eIdx = e - 1;
      const ets = grid[eIdx].filter(v => v !== null && !isNaN(v));
      const eMin = ets.length ? Math.min(...ets).toFixed(1) : '—';
      const eMax = ets.length ? Math.max(...ets).toFixed(1) : '—';
      const eAvg = ets.length ? (ets.reduce((a, b) => a + b, 0) / ets.length).toFixed(1) : '—';

      let cellsHtml = '';
      for (let c = 0; c < CPE; c++) {
        const globalCell = eIdx * CPE + c + 1;
        const temp = grid[eIdx][c];
        const { bg, fg, border } = this._tempToColor(temp, lo, hi);
        cellsHtml += `
          <div class="cell" style="background:${bg};color:${fg};border-color:${border}"
               title="cell ${globalCell} · ${temp !== null ? temp.toFixed(1) + ' °C' : 'unavailable'}">
            <span class="cn">${String(globalCell).padStart(2, '0')}</span>
            <span class="ct">${temp !== null ? temp.toFixed(1) : '—'}</span>
          </div>`;
      }

      const isBottom = e === 1;
      const isTop = e === ELEMENTS;
      cols += `
        <div class="col">
          <div class="el-header" title="Element ${e}${isBottom ? ' — bottom' : isTop ? ' — top' : ''}">
            E${e}${isBottom ? ' ↓' : isTop ? ' ↑' : ''}
          </div>
          <div class="cells">${cellsHtml}</div>
          <div class="el-footer">${eAvg}°<br><span class="el-range">${eMin}–${eMax}</span></div>
        </div>`;
    }

    // Gradient legend — vertical on the right side
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          padding: 14px 14px 12px;
          box-sizing: border-box;
        }
        .header {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-bottom: 14px; flex-wrap: wrap; gap: 4px;
        }
        .title { font-size: 1em; font-weight: 500; color: var(--primary-text-color); }
        .stats { font-size: 0.78em; color: var(--secondary-text-color); text-align: right; }
        .stats b { color: var(--primary-text-color); }

        .body {
          display: flex;
          gap: 6px;
          align-items: stretch;
        }
        .grid {
          display: flex;
          gap: 4px;
          flex: 1;
        }
        .col {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .el-header {
          font-size: 0.65em;
          font-weight: 700;
          color: var(--secondary-text-color);
          text-align: center;
          padding-bottom: 2px;
          cursor: default;
        }
        .cells {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }
        .cell {
          flex: 1;
          min-height: 28px;
          border-radius: 4px;
          border: 1px solid transparent;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: default;
          transition: filter 0.15s, transform 0.1s;
        }
        .cell:hover {
          filter: brightness(1.2);
          transform: scaleX(1.06);
          z-index: 2;
          position: relative;
        }
        .cn {
          font-size: 0.48em;
          opacity: 0.65;
          line-height: 1;
          letter-spacing: 0.02em;
        }
        .ct {
          font-size: 0.68em;
          font-weight: 700;
          line-height: 1.35;
        }
        .el-footer {
          font-size: 0.58em;
          color: var(--secondary-text-color);
          text-align: center;
          padding-top: 3px;
          line-height: 1.4;
        }
        .el-range {
          opacity: 0.7;
          font-size: 0.9em;
        }

        /* Vertical legend */
        .legend {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          width: 22px;
          flex-shrink: 0;
        }
        .lval {
          font-size: 0.65em;
          color: var(--secondary-text-color);
          white-space: nowrap;
          writing-mode: horizontal-tb;
          line-height: 1;
        }
        .lbar {
          flex: 1;
          width: 10px;
          border-radius: 5px;
          background: linear-gradient(
            to bottom,
            hsl(0,90%,38%),
            hsl(30,90%,40%),
            hsl(60,90%,43%),
            hsl(120,85%,43%),
            hsl(180,80%,44%),
            hsl(210,80%,46%),
            hsl(240,80%,48%)
          );
        }

        .orient {
          font-size: 0.62em;
          color: var(--secondary-text-color);
          text-align: center;
          margin-top: 8px;
          letter-spacing: 0.03em;
        }
        .warn { color: var(--warning-color, orange); }
      </style>
      <ha-card>
        <div class="header">
          <div class="title">${title}</div>
          <div class="stats">
            ${avg !== null ? `avg <b>${avg.toFixed(1)} °C</b> &nbsp;|&nbsp; <b>${lo.toFixed(1)}–${hi.toFixed(1)} °C</b>` : 'no data'}
            ${missing > 0 ? `<br><span class="warn">${missing} unavailable</span>` : ''}
          </div>
        </div>
        <div class="body">
          <div class="grid">${cols}</div>
          <div class="legend">
            <span class="lval">${hi.toFixed(0)}°</span>
            <div class="lbar"></div>
            <span class="lval">${lo.toFixed(0)}°</span>
          </div>
        </div>
        <div class="orient">← bottom of stack &nbsp;·&nbsp; top of stack →</div>
      </ha-card>
    `;
  }
}

customElements.define('hvs-heatmap-card', HVSHeatmapCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hvs-heatmap-card',
  name: 'HVS Battery Heatmap',
  description: 'Temperature heatmap for BYD HVS battery — 4 elements × 12 cells',
  preview: false,
});
