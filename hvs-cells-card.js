// BYD HVS Cell Temperature Grid Card
// 48 cells as color-coded tiles — 4 columns (elements) × 12 rows (cells per element)
// E1 = top of physical stack (left), E4 = floor (right)

class HVSCellsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set hass(h) { this._hass = h; this._render(); }
  setConfig(c) {
    if (!c.device_id) throw new Error('device_id required');
    this._config = c;
  }
  getCardSize() { return 8; }

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

  _render() {
    if (!this._hass || !this._config) return;
    const title = this._config.title || 'BYD HVS Cell Temperatures';
    const warnDelta = this._config.warn_delta != null ? this._config.warn_delta : 6;

    const temps = [];
    for (let i = 1; i <= 48; i++) {
      const st = this._hass.states[this._sid(i)];
      const v = st && st.state !== 'unavailable' ? parseFloat(st.state) : NaN;
      temps.push(isNaN(v) ? null : v);
    }

    const valid = temps.filter(v => v !== null);
    const lo = valid.length ? Math.min(...valid) : 20;
    const hi = valid.length ? Math.max(...valid) : 40;
    const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    const delta = hi - lo;
    const hotIdx = valid.length ? temps.indexOf(hi) : -1;
    const coldIdx = valid.length ? temps.indexOf(lo) : -1;

    let colsHtml = '';
    for (let e = 0; e < 4; e++) {
      let cellsHtml = '';
      for (let c = 0; c < 12; c++) {
        const idx = e * 12 + c;
        const cellNum = idx + 1;
        const t = temps[idx];
        const color = t !== null ? this._tempColor(t, lo, hi) : '#2a2a2a';
        const cls = idx === hotIdx ? ' hot' : idx === coldIdx ? ' cold' : '';
        cellsHtml += `
          <div class="cell${cls}" style="--bg:${color};background:${color}" title="C${cellNum}: ${t !== null ? t.toFixed(1) + '°C' : 'n/a'}">
            <span class="cnum">${cellNum}</span>
            <span class="cval">${t !== null ? t.toFixed(1) : '—'}</span>
          </div>`;
      }
      const eLabel = e === 0 ? 'E1 ↑' : e === 3 ? 'E4 ↓' : `E${e + 1}`;
      colsHtml += `<div class="col"><div class="col-head">${eLabel}</div>${cellsHtml}</div>`;
    }

    const warnHtml = delta >= warnDelta
      ? `<span class="badge warn">⚠ Δ<b>${delta.toFixed(1)}°</b></span>` : '';

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 14px 12px 12px; }
        .header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:12px; flex-wrap:wrap; gap:4px; }
        .title { font-size:1em; font-weight:600; color:var(--primary-text-color); }
        .meta { font-size:0.7em; color:var(--secondary-text-color); }
        .meta b { color:var(--primary-text-color); }

        .grid { display:flex; gap:4px; }
        .col { flex:1; display:flex; flex-direction:column; gap:2px; min-width:0; }
        .col-head {
          text-align:center; font-size:0.62em; font-weight:700; letter-spacing:.04em;
          color:var(--secondary-text-color); padding-bottom:4px;
          border-bottom:1px solid rgba(255,255,255,.08); margin-bottom:2px;
        }

        .cell {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          border-radius:4px; padding:3px 2px; min-height:28px;
          cursor:default; transition:transform .12s;
          position:relative;
        }
        .cell:hover { transform:scale(1.12); z-index:10; box-shadow:0 2px 14px var(--bg,.3); }
        .cell.hot { animation:glow-hot 2s ease-in-out infinite; }
        .cell.cold { animation:glow-cold 2.5s ease-in-out infinite; }
        @keyframes glow-hot {
          0%,100% { box-shadow:0 0 5px 1px var(--bg); }
          50% { box-shadow:0 0 14px 5px var(--bg); }
        }
        @keyframes glow-cold {
          0%,100% { box-shadow:0 0 4px 1px rgba(80,160,255,.3); }
          50% { box-shadow:0 0 10px 3px rgba(80,160,255,.5); }
        }

        .cnum { font-size:.42em; opacity:.7; color:rgba(255,255,255,.85); line-height:1; }
        .cval { font-size:.64em; font-weight:700; color:#fff; line-height:1.15; text-shadow:0 1px 3px rgba(0,0,0,.6); }

        .footer { margin-top:10px; display:flex; justify-content:space-around; flex-wrap:wrap; gap:4px; }
        .badge {
          font-size:.65em; padding:3px 9px; border-radius:99px;
          background:rgba(255,255,255,.05); color:var(--secondary-text-color);
          border:1px solid rgba(255,255,255,.1);
        }
        .badge b { color:var(--primary-text-color); }
        .badge.warn { color:var(--warning-color,#f59e0b); border-color:rgba(245,158,11,.3); }
      </style>
      <ha-card>
        <div class="header">
          <div class="title">${title}</div>
          <div class="meta">
            ${avg !== null
              ? `avg <b>${avg.toFixed(1)}°C</b> &nbsp;·&nbsp; <b>${lo.toFixed(1)}–${hi.toFixed(1)}°C</b> &nbsp;·&nbsp; Δ <b>${delta.toFixed(1)}°</b>`
              : 'no data'}
          </div>
        </div>
        <div class="grid">${colsHtml}</div>
        <div class="footer">
          <span class="badge">🔵 C${coldIdx + 1} &nbsp;<b>${lo.toFixed(1)}°</b></span>
          <span class="badge">⊙ avg &nbsp;<b>${avg !== null ? avg.toFixed(1) : '—'}°</b></span>
          <span class="badge">🔴 C${hotIdx + 1} &nbsp;<b>${hi.toFixed(1)}°</b></span>
          ${warnHtml}
        </div>
      </ha-card>`;
  }
}

customElements.define('hvs-cells-card', HVSCellsCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hvs-cells-card',
  name: 'HVS Battery Cell Grid',
  description: 'All 48 cell temperatures as a color-coded tile grid with hot/cold glow',
  preview: false,
});
