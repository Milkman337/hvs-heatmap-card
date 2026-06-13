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
    return 5;
  }

  // All 48 sensors share tower_1; cells 01–48 split into 4 elements of 12
  // Element 1 (bottom) = cells 01–12, Element 4 (top) = cells 37–48
  _sensorId(globalCell) {
    return `sensor.byd_battery_${this._config.device_id}_byd_cell_temperature_tower_1_cell_${String(globalCell).padStart(2, '0')}`;
  }

  _tempToColor(t, lo, hi) {
    if (t === null) return ['#2d2d2d', '#666'];
    const n = Math.max(0, Math.min(1, (t - lo) / Math.max(hi - lo, 0.01)));
    let r, g, b;
    if (n < 0.25) {
      r = 0; g = Math.round(n / 0.25 * 160); b = 220;
    } else if (n < 0.5) {
      r = 0; g = Math.round(160 + (n - 0.25) / 0.25 * 95); b = Math.round(220 * (1 - (n - 0.25) / 0.25));
    } else if (n < 0.75) {
      r = Math.round((n - 0.5) / 0.25 * 255); g = 255; b = 0;
    } else {
      r = 255; g = Math.round(255 * (1 - (n - 0.75) / 0.25)); b = 0;
    }
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return [`rgb(${r},${g},${b})`, lum > 145 ? '#111' : '#fff'];
  }

  _render() {
    if (!this._hass || !this._config) return;

    const ELEMENTS = 4;
    const CELLS_PER_ELEMENT = 12;
    const TOTAL_CELLS = ELEMENTS * CELLS_PER_ELEMENT; // 48
    const title = this._config.title || 'BYD HVS Temperature Heatmap';

    // Collect all 48 temps, grouped into 4 elements of 12
    // Element 1 = cells 01–12 (bottom), Element 4 = cells 37–48 (top)
    const grid = [];
    for (let e = 0; e < ELEMENTS; e++) {
      const row = [];
      for (let c = 0; c < CELLS_PER_ELEMENT; c++) {
        const globalCell = e * CELLS_PER_ELEMENT + c + 1;
        const st = this._hass.states[this._sensorId(globalCell)];
        row.push(st && st.state !== 'unavailable' ? parseFloat(st.state) : null);
      }
      grid.push(row);
    }

    const flat = grid.flat().filter(v => v !== null && !isNaN(v));
    const lo = flat.length ? Math.floor(Math.min(...flat)) : 20;
    const hi = flat.length ? Math.ceil(Math.max(...flat)) : 40;
    const avg = flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : null;
    const missing = TOTAL_CELLS - flat.length;

    // Build element rows — E4 at top, E1 at bottom (physical orientation)
    let rows = '';
    for (let e = ELEMENTS; e >= 1; e--) {
      const eIdx = e - 1; // 0-based index into grid[]
      let cells = '';
      for (let c = 0; c < CELLS_PER_ELEMENT; c++) {
        const temp = grid[eIdx][c];
        const [bg, fg] = this._tempToColor(temp, lo, hi);
        const globalCell = eIdx * CELLS_PER_ELEMENT + c + 1;
        const sId = this._sensorId(globalCell);
        cells += `<div class="cell" style="background:${bg};color:${fg}" title="${sId}\n${temp !== null ? temp.toFixed(1) + ' °C' : 'unavailable'}">
          <span class="cn">${String(globalCell).padStart(2, '0')}</span>
          <span class="ct">${temp !== null ? temp.toFixed(1) : '—'}</span>
        </div>`;
      }

      const isTop = e === ELEMENTS;
      const isBottom = e === 1;
      const elLabel = isTop ? `E${e} ↑` : isBottom ? `E${e} ↓` : `E${e}`;
      const elTitle = `Element ${e}${isBottom ? ' (bottom)' : isTop ? ' (top)' : ''}`;

      // Per-element min/max
      const ets = grid[eIdx].filter(v => v !== null && !isNaN(v));
      const eInfo = ets.length
        ? `${Math.min(...ets).toFixed(1)}–${Math.max(...ets).toFixed(1)} °C`
        : 'no data';

      rows += `<div class="row">
        <div class="elabel" title="${elTitle}">${elLabel}</div>
        <div class="cells">${cells}</div>
        <div class="einfo">${eInfo}</div>
      </div>`;
    }

    const gradStops = [
      'rgb(0,0,220) 0%',
      'rgb(0,160,160) 25%',
      'rgb(0,255,0) 50%',
      'rgb(255,255,0) 75%',
      'rgb(255,0,0) 100%',
    ].join(', ');

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 14px 16px 12px; box-sizing: border-box; }

        .header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; flex-wrap: wrap; gap: 4px; }
        .title { font-size: 1em; font-weight: 500; color: var(--primary-text-color); }
        .stats { font-size: 0.78em; color: var(--secondary-text-color); text-align: right; }
        .stats b { color: var(--primary-text-color); }

        .grid { display: flex; flex-direction: column; gap: 3px; }
        .row { display: flex; align-items: center; gap: 4px; }

        .elabel {
          width: 30px; flex-shrink: 0;
          font-size: 0.68em; font-weight: 700;
          color: var(--secondary-text-color);
          text-align: right;
          cursor: default;
          line-height: 1;
        }
        .cells { display: flex; flex: 1; gap: 2px; }
        .cell {
          flex: 1; min-width: 0;
          aspect-ratio: 0.8;
          border-radius: 3px;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          cursor: default;
          transition: filter 0.15s;
          overflow: hidden;
        }
        .cell:hover { filter: brightness(1.18); z-index: 1; }
        .cn { font-size: 0.5em; opacity: 0.7; line-height: 1; }
        .ct { font-size: 0.66em; font-weight: 700; line-height: 1.3; }

        .einfo {
          width: 64px; flex-shrink: 0;
          font-size: 0.62em;
          color: var(--secondary-text-color);
          text-align: left;
          padding-left: 2px;
          line-height: 1.3;
        }

        .divider {
          border: none;
          border-top: 1px solid var(--divider-color, rgba(128,128,128,0.2));
          margin: 8px 0;
        }
        .footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
        .legend { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 160px; }
        .lbar {
          flex: 1; height: 7px; border-radius: 3px;
          background: linear-gradient(to right, ${gradStops});
        }
        .lval { font-size: 0.72em; color: var(--secondary-text-color); white-space: nowrap; }
        .orient { font-size: 0.68em; color: var(--secondary-text-color); }
        .warn { font-size: 0.7em; color: var(--warning-color, orange); }
      </style>
      <ha-card>
        <div class="header">
          <div class="title">${title}</div>
          <div class="stats">
            ${avg !== null ? `avg <b>${avg.toFixed(1)} °C</b> &nbsp;|&nbsp; range <b>${lo}–${hi} °C</b>` : 'no data'}
            ${missing > 0 ? `<br><span class="warn">${missing} sensor${missing > 1 ? 's' : ''} unavailable</span>` : ''}
          </div>
        </div>
        <div class="grid">${rows}</div>
        <hr class="divider">
        <div class="footer">
          <div class="orient">↑ top element &nbsp;·&nbsp; ↓ bottom element</div>
          <div class="legend">
            <span class="lval">${lo} °C</span>
            <div class="lbar"></div>
            <span class="lval">${hi} °C</span>
          </div>
        </div>
      </ha-card>
    `;
  }
}

customElements.define('hvs-heatmap-card', HVSHeatmapCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hvs-heatmap-card',
  name: 'HVS Battery Heatmap',
  description: 'Temperature heatmap for BYD HVS battery — 4 elements × 12 cells per element',
  preview: false,
});
