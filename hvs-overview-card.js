// BYD HVS Battery Overview Card
// SOC arc gauge + power/voltage/current/status — all configurable sensors.
// Temperature summary always computed from the 48 cell sensors (device_id required).
// Sensor entities are optional: the card renders whatever is configured.

class HVSOverviewCard extends HTMLElement {
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

  _val(entityId) {
    if (!entityId) return null;
    const st = this._hass.states[entityId];
    if (!st || st.state === 'unavailable' || st.state === 'unknown') return null;
    const n = parseFloat(st.state);
    return isNaN(n) ? st.state : n;
  }

  _unit(entityId) {
    if (!entityId) return '';
    const st = this._hass.states[entityId];
    return st?.attributes?.unit_of_measurement || '';
  }

  // Animated arc gauge for SOC (0-100%)
  // 270° arc: 7-o'clock → 5-o'clock through top. R=54, center (65,65), viewBox 130×130
  _socGauge(soc) {
    const R = 54, SW = 14, CX = 65, CY = 65;
    const circ = 2 * Math.PI * R;      // ≈339.3
    const arcTotal = circ * 0.75;      // ≈254.5
    const pct = soc !== null ? Math.max(0, Math.min(100, soc)) / 100 : 0;
    const filled = pct * arcTotal;

    const color = soc === null ? '#555'
      : soc < 15 ? '#ef4444'
      : soc < 30 ? '#f97316'
      : soc < 50 ? '#f59e0b'
      : '#22c55e';

    const trackId = `soc-track-${Math.random().toString(36).slice(2,6)}`;

    return `
      <svg viewBox="0 0 130 130" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
        <defs>
          <linearGradient id="${trackId}" gradientUnits="userSpaceOnUse" x1="20" y1="110" x2="110" y2="20">
            <stop offset="0%" stop-color="${soc !== null && soc < 30 ? '#ef4444' : '#22c55e'}"/>
            <stop offset="100%" stop-color="${color}"/>
          </linearGradient>
        </defs>
        <!-- Track -->
        <circle cx="${CX}" cy="${CY}" r="${R}"
          fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${SW}"
          stroke-dasharray="${arcTotal} ${circ}"
          transform="rotate(135 ${CX} ${CY})"/>
        <!-- Fill -->
        <circle cx="${CX}" cy="${CY}" r="${R}"
          fill="none" stroke="url(#${trackId})" stroke-width="${SW}" stroke-linecap="round"
          stroke-dasharray="${filled} ${circ}"
          transform="rotate(135 ${CX} ${CY})"
          style="filter:drop-shadow(0 0 8px ${color});transition:stroke-dasharray 1.1s ease"/>
        <!-- Value -->
        <text x="${CX}" y="${CY + 2}" text-anchor="middle" font-size="24" font-weight="800"
              fill="${color}" font-family="sans-serif"
              style="filter:drop-shadow(0 0 6px ${color})">
          ${soc !== null ? Math.round(soc) : '—'}
        </text>
        <text x="${CX}" y="${CY + 17}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.35)" font-family="sans-serif">% SOC</text>
      </svg>`;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const c = this._config;
    const title = c.title || 'BYD HVS Battery';

    const soc     = this._val(c.entity_soc);
    const power   = this._val(c.entity_power);
    const voltage = this._val(c.entity_voltage);
    const current = this._val(c.entity_current);
    const status  = this._val(c.entity_state);
    const capacity= this._val(c.entity_capacity);

    const hasSoc     = soc !== null;
    const hasPower   = power !== null && typeof power === 'number';
    const hasVoltage = voltage !== null;
    const hasCurrent = current !== null;
    const hasStatus  = status !== null;
    const hasCapacity= capacity !== null;

    // Compute temp stats from 48 cell sensors
    const tempVals = [];
    for (let i = 1; i <= 48; i++) {
      const st = this._hass.states[this._sid(i)];
      const v = st && st.state !== 'unavailable' ? parseFloat(st.state) : NaN;
      if (!isNaN(v)) tempVals.push(v);
    }
    const hasTemp = tempVals.length > 0;
    const tempLo  = hasTemp ? Math.min(...tempVals) : null;
    const tempHi  = hasTemp ? Math.max(...tempVals) : null;
    const tempAvg = hasTemp ? tempVals.reduce((a, b) => a + b, 0) / tempVals.length : null;
    const tempDelta = hasTemp ? tempHi - tempLo : null;

    // Power direction
    let powerIcon = '⊙', powerLabel = 'Idle', powerColor = 'var(--secondary-text-color)';
    let powerAbs = 0;
    if (hasPower) {
      powerAbs = Math.abs(power);
      if (power > 0.05) { powerIcon = '⬆'; powerLabel = 'Charging'; powerColor = '#22c55e'; }
      else if (power < -0.05) { powerIcon = '⬇'; powerLabel = 'Discharging'; powerColor = '#f59e0b'; }
    }

    // Status badge
    const statusStr = String(status || '').trim();
    let badgeColor = '#6b7280';
    if (/charg/i.test(statusStr)) badgeColor = '#22c55e';
    else if (/discharg/i.test(statusStr)) badgeColor = '#f59e0b';
    else if (/error|fault/i.test(statusStr)) badgeColor = '#ef4444';
    const statusBadge = hasStatus
      ? `<span class="status-badge" style="color:${badgeColor};border-color:${badgeColor}30">${statusStr}</span>`
      : '';

    // Temperature bar (15–50 °C linear scale)
    const tempBarPct = hasTemp ? Math.max(0, Math.min(100, ((tempAvg - 15) / 35) * 100)) : 50;
    const warnDelta = c.warn_delta != null ? c.warn_delta : 6;
    const deltaWarn = hasTemp && tempDelta >= warnDelta;

    // Metric rows on the right side of the gauge
    let metrics = '';
    if (hasPower) metrics += `
      <div class="metric-row power">
        <span class="m-icon" style="color:${powerColor}">${powerIcon}</span>
        <span class="m-val" style="color:${powerColor}">${powerAbs.toFixed(2)} ${this._unit(c.entity_power) || 'kW'}</span>
        <span class="m-label">${powerLabel}</span>
      </div>
      <div class="divider"></div>`;
    if (hasVoltage) metrics += `
      <div class="metric-row">
        <span class="m-label">Voltage</span>
        <span class="m-val">${typeof voltage === 'number' ? voltage.toFixed(1) : voltage} ${this._unit(c.entity_voltage)}</span>
      </div>`;
    if (hasCurrent) metrics += `
      <div class="metric-row">
        <span class="m-label">Current</span>
        <span class="m-val">${typeof current === 'number' ? current.toFixed(1) : current} ${this._unit(c.entity_current)}</span>
      </div>`;
    if (hasCapacity) metrics += `
      <div class="metric-row">
        <span class="m-label">Capacity</span>
        <span class="m-val">${typeof capacity === 'number' ? capacity.toFixed(1) : capacity} ${this._unit(c.entity_capacity)}</span>
      </div>`;
    if (hasTemp) {
      metrics += `
      <div class="metric-row">
        <span class="m-label">Avg Temp</span>
        <span class="m-val">${tempAvg.toFixed(1)} °C</span>
      </div>
      <div class="metric-row">
        <span class="m-label">Range</span>
        <span class="m-val">${tempLo.toFixed(1)}–${tempHi.toFixed(1)} °C</span>
      </div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding:14px 12px 14px; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
        .title { font-size:1em; font-weight:600; color:var(--primary-text-color); }
        .status-badge {
          font-size:.68em; padding:2px 10px; border-radius:99px;
          border:1px solid; font-weight:600; letter-spacing:.04em;
        }

        .body { display:flex; gap:10px; align-items:center; }
        .gauge-col { flex:0 0 130px; }
        .gauge-col svg { width:100%; height:auto; }

        .metrics-col { flex:1; display:flex; flex-direction:column; gap:5px; min-width:0; }
        .metric-row {
          display:flex; justify-content:space-between; align-items:center; gap:6px;
          font-size:.78em;
        }
        .metric-row.power { margin-bottom:2px; }
        .m-label { color:var(--secondary-text-color); flex-shrink:0; }
        .m-val { font-weight:700; color:var(--primary-text-color); text-align:right; }
        .m-icon { font-size:1em; }
        .divider { height:1px; background:rgba(255,255,255,.07); margin:2px 0; }

        .temp-section { margin-top:12px; }
        .temp-header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:5px; }
        .temp-title { font-size:.72em; color:var(--secondary-text-color); }
        .temp-delta {
          font-size:.68em; font-weight:700;
          color:${deltaWarn ? 'var(--warning-color,#f59e0b)' : 'var(--secondary-text-color)'};
        }
        .bar-track {
          position:relative; height:6px; border-radius:99px; overflow:visible;
          background:linear-gradient(to right,
            rgb(75,120,210) 0%, rgb(60,170,170) 25%, rgb(60,160,80) 50%,
            rgb(190,160,50) 75%, rgb(200,70,50) 100%);
        }
        .bar-marker {
          position:absolute; top:-4px; transform:translateX(-50%);
          width:14px; height:14px; border-radius:50%;
          background:#fff; border:2px solid rgba(255,255,255,.9);
          box-shadow:0 0 8px rgba(0,0,0,.5), 0 0 12px rgba(255,255,255,.2);
        }
        .bar-ends { display:flex; justify-content:space-between; font-size:.58em; color:var(--secondary-text-color); margin-top:4px; }
        .no-data { font-size:.78em; color:var(--secondary-text-color); text-align:center; padding:8px; }
      </style>
      <ha-card>
        <div class="header">
          <div class="title">${title}</div>
          ${statusBadge}
        </div>
        <div class="body">
          ${hasSoc
            ? `<div class="gauge-col">${this._socGauge(soc)}</div>`
            : ''}
          <div class="metrics-col">
            ${metrics || `<div class="no-data">Configure <code>entity_soc</code>, <code>entity_power</code>, etc. in card YAML</div>`}
          </div>
        </div>
        ${hasTemp ? `
          <div class="temp-section">
            <div class="temp-header">
              <span class="temp-title">Cell temperature</span>
              <span class="temp-delta">Δ ${tempDelta.toFixed(1)}°${deltaWarn ? ' ⚠' : ''}</span>
            </div>
            <div class="bar-track">
              <div class="bar-marker" style="left:${tempBarPct.toFixed(1)}%"></div>
            </div>
            <div class="bar-ends"><span>15 °C</span><span>${tempAvg.toFixed(1)} °C avg</span><span>50 °C</span></div>
          </div>` : ''}
      </ha-card>`;
  }
}

customElements.define('hvs-overview-card', HVSOverviewCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hvs-overview-card',
  name: 'HVS Battery Overview',
  description: 'SOC arc gauge + power/voltage/current + temperature bar — all configurable',
  preview: false,
});
