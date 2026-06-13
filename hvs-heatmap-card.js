// BYD HVS Temperature Heatmap Card
//
// Physical layout per element: 3 columns × 4 rows, column-major numbering.
// Columns 1 & 3 are the electrical terminal edges (hotter), column 2 is center (cooler).
//
//   [s1 ][s5 ][s9 ]
//   [s2 ][s6 ][s10]
//   [s3 ][s7 ][s11]
//   [s4 ][s8 ][s12]
//
// 4 elements stacked: element 4 (top of stack) at top, element 1 (bottom) at bottom.
// All 48 sensors share tower_1: cell_01 … cell_48.

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
    if (!config.device_id) throw new Error('device_id is required');
    this._config = config;
  }

  getCardSize() { return 10; }

  _sensorId(globalCell) {
    return `sensor.byd_battery_${this._config.device_id}_byd_cell_temperature_tower_1_cell_${String(globalCell).padStart(2, '0')}`;
  }

  // Smooth HSL gradient: blue (240°) → cyan → green → yellow → red (0°)
  _tempToColor(t, lo, hi) {
    if (t === null) return { bg: 'rgba(60,60,60,0.3)', fg: '#555', glow: 'none' };
    const n = Math.max(0, Math.min(1, (t - lo) / Math.max(hi - lo, 0.01)));
    const hue = 240 - n * 240;
    const sat = 72 + n * 18;
    const light = 46 - n * 10;
    const bg = `hsl(${hue.toFixed(1)},${sat.toFixed(0)}%,${light.toFixed(0)}%)`;
    const fg = light > 40 ? '#fff' : '#ffe';
    return { bg, fg };
  }

  _render() {
    if (!this._hass || !this._config) return;

    const ELEMENTS = 4;
    const COLS = 3;
    const ROWS = 4;
    const CPE = COLS * ROWS; // 12
    const title = this._config.title || 'BYD HVS Temperature Heatmap';

    // Read all 48 temps; grid[e][col][row] using column-major layout
    const grid = [];
    for (let e = 0; e < ELEMENTS; e++) {
      const cols = [];
      for (let c = 0; c < COLS; c++) {
        const rows = [];
        for (let r = 0; r < ROWS; r++) {
          const globalCell = e * CPE + c * ROWS + r + 1;
          const st = this._hass.states[this._sensorId(globalCell)];
          rows.push(st && st.state !== 'unavailable' ? parseFloat(st.state) : null);
        }
        cols.push(rows);
      }
      grid.push(cols);
    }

    const flat = grid.flat(2).filter(v => v !== null && !isNaN(v));
    const lo = flat.length ? Math.min(...flat) : 20;
    const hi = flat.length ? Math.max(...flat) : 40;
    const avg = flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : null;
    const missing = ELEMENTS * CPE - flat.length;

    // Build element blocks — element 4 at top, element 1 at bottom
    let elementsHtml = '';
    for (let e = ELEMENTS - 1; e >= 0; e--) {
      const eNum = e + 1;
      const isTop = e === ELEMENTS - 1;
      const isBottom = e === 0;

      // Build the 4-row × 3-col grid
      let rowsHtml = '';
      for (let r = 0; r < ROWS; r++) {
        let cellsHtml = '';
        for (let c = 0; c < COLS; c++) {
          const globalCell = e * CPE + c * ROWS + r + 1;
          const temp = grid[e][c][r];
          const { bg, fg } = this._tempToColor(temp, lo, hi);
          cellsHtml += `<div class="cell" style="background:${bg};color:${fg}"
            title="cell ${String(globalCell).padStart(2,'0')} · ${temp !== null ? temp.toFixed(1)+' °C' : 'n/a'}"
          ><span class="ct">${temp !== null ? temp.toFixed(1) : '—'}</span></div>`;
        }
        rowsHtml += `<div class="grow-row">${cellsHtml}</div>`;
      }

      const ets = grid[e].flat().filter(v => v !== null && !isNaN(v));
      const eMin = ets.length ? Math.min(...ets).toFixed(1) : '—';
      const eMax = ets.length ? Math.max(...ets).toFixed(1) : '—';

      elementsHtml += `
        <div class="element${isBottom ? ' element-bottom' : ''}">
          <div class="el-label" title="Element ${eNum}${isBottom ? ' — bottom of stack' : isTop ? ' — top of stack' : ''}">
            ${isTop ? '↑ ' : ''}E${eNum}${isBottom ? ' ↓' : ''}
          </div>
          <div class="el-grid">${rowsHtml}</div>
          <div class="el-stat">${eMin}–${eMax}°</div>
        </div>`;

      if (e > 0) {
        elementsHtml += `<div class="sep"></div>`;
      }
    }

    // Vertical gradient legend
    const gradStops = [
      'hsl(0,90%,36%) 0%',
      'hsl(30,88%,40%) 15%',
      'hsl(60,85%,43%) 35%',
      'hsl(120,80%,43%) 55%',
      'hsl(180,76%,44%) 75%',
      'hsl(220,76%,46%) 88%',
      'hsl(240,74%,48%) 100%',
    ].join(', ');

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 14px 12px 12px; box-sizing: border-box; }

        .header {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-bottom: 12px; flex-wrap: wrap; gap: 4px;
        }
        .title { font-size: 1em; font-weight: 500; color: var(--primary-text-color); }
        .stats { font-size: 0.76em; color: var(--secondary-text-color); text-align: right; }
        .stats b { color: var(--primary-text-color); }
        .warn { color: var(--warning-color, orange); }

        .body { display: flex; gap: 8px; align-items: stretch; }

        .elements { display: flex; flex-direction: column; flex: 1; gap: 0; }

        .element {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .el-label {
          width: 28px; flex-shrink: 0;
          font-size: 0.62em; font-weight: 700;
          color: var(--secondary-text-color);
          text-align: right;
          cursor: default;
          line-height: 1;
        }
        .el-grid { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .grow-row { display: flex; gap: 2px; }
        .cell {
          flex: 1;
          height: 26px;
          border-radius: 3px;
          display: flex; align-items: center; justify-content: center;
          cursor: default;
          transition: filter 0.12s, transform 0.1s;
          min-width: 0;
        }
        .cell:hover { filter: brightness(1.2); transform: scale(1.06); z-index: 2; position: relative; }
        .ct { font-size: 0.66em; font-weight: 700; line-height: 1; }

        .el-stat {
          width: 52px; flex-shrink: 0;
          font-size: 0.58em;
          color: var(--secondary-text-color);
          text-align: left;
          line-height: 1.4;
        }

        .sep {
          height: 5px;
          margin: 2px 0;
          border-bottom: 1px dashed var(--divider-color, rgba(128,128,128,0.2));
        }

        /* Vertical legend */
        .legend {
          display: flex; flex-direction: column; align-items: center;
          gap: 4px; width: 20px; flex-shrink: 0;
        }
        .lval { font-size: 0.62em; color: var(--secondary-text-color); white-space: nowrap; }
        .lbar {
          flex: 1; width: 9px; border-radius: 4px;
          background: linear-gradient(to bottom, ${gradStops});
        }

        .footer {
          margin-top: 8px;
          font-size: 0.62em; color: var(--secondary-text-color);
          text-align: center; letter-spacing: 0.02em;
        }
      </style>
      <ha-card>
        <div class="header">
          <div class="title">${title}</div>
          <div class="stats">
            ${avg !== null
              ? `avg <b>${avg.toFixed(1)} °C</b> &nbsp;|&nbsp; <b>${lo.toFixed(1)}–${hi.toFixed(1)} °C</b>`
              : 'no data'}
            ${missing > 0 ? `<br><span class="warn">${missing} unavailable</span>` : ''}
          </div>
        </div>
        <div class="body">
          <div class="elements">${elementsHtml}</div>
          <div class="legend">
            <span class="lval">${hi.toFixed(0)}°</span>
            <div class="lbar"></div>
            <span class="lval">${lo.toFixed(0)}°</span>
          </div>
        </div>
        <div class="footer">← left terminal &nbsp;·&nbsp; center &nbsp;·&nbsp; right terminal →</div>
      </ha-card>
    `;
  }
}

customElements.define('hvs-heatmap-card', HVSHeatmapCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hvs-heatmap-card',
  name: 'HVS Battery Heatmap',
  description: 'BYD HVS temperature heatmap — 4 elements × 3 cols × 4 rows',
  preview: false,
});
