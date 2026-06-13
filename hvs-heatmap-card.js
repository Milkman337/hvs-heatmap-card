// BYD HVS Temperature Heatmap Card
//
// Physical layout per element: 3 columns × 4 rows, column-major numbering.
// Columns 1 & 3 = electrical terminal edges (hotter), column 2 = center (cooler).
//
//   [s1 ][s5 ][s9 ]
//   [s2 ][s6 ][s10]
//   [s3 ][s7 ][s11]
//   [s4 ][s8 ][s12]
//
// E1 = top of physical stack (hottest — heat accumulates), E4 = floor (coolest).
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

  // HSL → RGB (h: 0–360, s/l: 0–100)
  _hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  // Temperature → RGB via smooth HSL gradient blue→cyan→green→yellow→red
  _tempToRgb(t, lo, hi) {
    const n = Math.max(0, Math.min(1, (t - lo) / Math.max(hi - lo, 0.01)));
    return this._hslToRgb(240 - n * 240, 72 + n * 18, 46 - n * 10);
  }

  // Render a smooth bilinear-interpolated heatmap onto a canvas.
  // Rotated 90°: horizontal axis = rows (0–3), vertical axis = cols (0–2).
  // Top edge = col 0 (left terminal), bottom edge = col 2 (right terminal).
  // colData[col][row] = temperature value (column-major, 3 cols × 4 rows).
  _drawCanvas(canvas, colData, lo, hi) {
    const COLS = 3, ROWS = 4;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d = img.data;

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        // Horizontal axis → row index (0 to ROWS-1)
        // Vertical axis   → col index (0 to COLS-1)
        const fr = (px / (W - 1)) * (ROWS - 1);
        const fc = (py / (H - 1)) * (COLS - 1);

        const r0 = Math.floor(fr), r1 = Math.min(r0 + 1, ROWS - 1);
        const c0 = Math.floor(fc), c1 = Math.min(c0 + 1, COLS - 1);
        const tx = fr - r0, ty = fc - c0;

        const t00 = colData[c0][r0], t10 = colData[c0][r1];
        const t01 = colData[c1][r0], t11 = colData[c1][r1];
        const vals = [t00, t10, t01, t11].filter(v => v !== null && !isNaN(v));

        let rgb;
        if (!vals.length) {
          rgb = [45, 45, 45];
        } else if (vals.length < 4) {
          // Graceful fallback for missing sensors
          rgb = this._tempToRgb(vals.reduce((a, b) => a + b) / vals.length, lo, hi);
        } else {
          // Bilinear interpolation
          const t = t00 * (1 - tx) * (1 - ty)
                  + t10 * tx       * (1 - ty)
                  + t01 * (1 - tx) * ty
                  + t11 * tx       * ty;
          rgb = this._tempToRgb(t, lo, hi);
        }

        const i = (py * W + px) * 4;
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
  }

  _render() {
    if (!this._hass || !this._config) return;

    const ELEMENTS = 4, COLS = 3, ROWS = 4, CPE = 12;
    const title = this._config.title || 'BYD HVS Temperature Heatmap';

    // Read all temps. grid[e][col][row], column-major within each element.
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
    const avg = flat.length ? flat.reduce((a, b) => a + b) / flat.length : null;
    const missing = ELEMENTS * CPE - flat.length;

    // Build element rows — E1 at top, E4 at bottom
    let elementsHtml = '';
    for (let e = 0; e < ELEMENTS; e++) {
      const eNum = e + 1;
      const isTop = e === 0;
      const isBottom = e === ELEMENTS - 1;

      const ets = grid[e].flat().filter(v => v !== null && !isNaN(v));
      const eMin = ets.length ? Math.min(...ets).toFixed(1) : '—';
      const eMax = ets.length ? Math.max(...ets).toFixed(1) : '—';
      const eAvg = ets.length ? (ets.reduce((a, b) => a + b) / ets.length).toFixed(1) : '—';

      // Tooltip lists all 12 sensor readings
      const tipLines = [];
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const gc = e * CPE + c * ROWS + r + 1;
          const t = grid[e][c][r];
          tipLines.push(`C${String(gc).padStart(2, '0')}: ${t !== null ? t.toFixed(1) + '°' : 'n/a'}`);
        }
      }

      elementsHtml += `
        <div class="element">
          <div class="el-label" title="Element ${eNum}${isTop ? ' — top' : isBottom ? ' — bottom' : ''}">
            ${isTop ? '↑ ' : ''}E${eNum}${isBottom ? ' ↓' : ''}
          </div>
          <canvas class="el-canvas" data-element="${e}" width="240" height="90"
            title="E${eNum} · avg ${eAvg}°C · ${eMin}–${eMax}°C&#10;${tipLines.join('  ')}"></canvas>
          <div class="el-stat">${eAvg}°C<br><span class="range">${eMin}–${eMax}</span></div>
        </div>`;

      if (!isBottom) elementsHtml += `<div class="sep"></div>`;
    }

    const gradStops = [
      'hsl(0,90%,36%) 0%',
      'hsl(60,85%,43%) 35%',
      'hsl(120,80%,43%) 55%',
      'hsl(180,76%,44%) 75%',
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
        .elements { display: flex; flex-direction: column; flex: 1; }
        .element { display: flex; align-items: center; gap: 6px; }

        .el-label {
          width: 28px; flex-shrink: 0;
          font-size: 0.62em; font-weight: 700;
          color: var(--secondary-text-color); text-align: right;
          cursor: default; line-height: 1;
        }
        .el-canvas {
          flex: 1; display: block;
          width: 100%; height: auto;
          border-radius: 6px;
          cursor: default;
          image-rendering: auto;
        }
        .el-stat {
          width: 48px; flex-shrink: 0;
          font-size: 0.58em; color: var(--secondary-text-color);
          line-height: 1.6; text-align: left;
        }
        .range { opacity: 0.7; font-size: 0.9em; }

        .sep {
          height: 6px; margin: 1px 0;
          border-bottom: 1px dashed var(--divider-color, rgba(128,128,128,0.18));
        }

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
          margin-top: 8px; font-size: 0.61em;
          color: var(--secondary-text-color); text-align: center;
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
        <div class="footer">↑ E1 top of stack &nbsp;·&nbsp; E4 bottom ↓ &nbsp;·&nbsp; ← left terminal · center · right terminal →</div>
      </ha-card>
    `;

    // Draw the gradient canvases now that the DOM is ready
    this.shadowRoot.querySelectorAll('.el-canvas').forEach(canvas => {
      this._drawCanvas(canvas, grid[parseInt(canvas.dataset.element)], lo, hi);
    });
  }
}

customElements.define('hvs-heatmap-card', HVSHeatmapCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hvs-heatmap-card',
  name: 'HVS Battery Heatmap',
  description: 'BYD HVS temperature heatmap — bilinear gradient, 4 elements × 3×4 sensors',
  preview: false,
});
