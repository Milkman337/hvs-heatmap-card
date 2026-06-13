# HVS Heatmap Card Suite

Custom Home Assistant Lovelace cards for the BYD HVS battery — four visually distinct cards covering every available sensor.

## Cards

| Card | File | Shows |
|------|------|-------|
| `hvs-heatmap-card` | `hvs-heatmap-card.js` | Bilinear-interpolated temperature heatmap per element (canvas) |
| `hvs-cells-card` | `hvs-cells-card.js` | All 48 cells as color-coded tiles with hot/cold glow animation |
| `hvs-element-card` | `hvs-element-card.js` | Four SVG ring gauges (one per element) with min/max/spread |
| `hvs-overview-card` | `hvs-overview-card.js` | SOC arc gauge + power / voltage / current + temperature bar |

## Installation

### HACS

1. In HACS → three-dot menu → **Custom repositories**
2. Add `https://git.kjan.de/jank/hvs-heatmap-card` with category **Dashboard**
3. Install **HVS Heatmap Card** — HACS auto-registers `hvs-heatmap-card.js`
4. For the three additional cards, go to Settings → Dashboards → Resources and add:
   - `/hacsfiles/hvs-heatmap-card/hvs-cells-card.js` (JavaScript module)
   - `/hacsfiles/hvs-heatmap-card/hvs-element-card.js` (JavaScript module)
   - `/hacsfiles/hvs-heatmap-card/hvs-overview-card.js` (JavaScript module)

### Manual

Copy each `.js` file to `/config/www/` and register all four in Settings → Dashboards → Resources:

```
/local/hvs-heatmap-card.js     (JavaScript module)
/local/hvs-cells-card.js       (JavaScript module)
/local/hvs-element-card.js     (JavaScript module)
/local/hvs-overview-card.js    (JavaScript module)
```

## Configuration

All cards require `device_id` — the part of the sensor entity ID between `byd_battery_` and `_byd_cell_temperature`.

### hvs-heatmap-card — Bilinear heatmap

```yaml
type: custom:hvs-heatmap-card
device_id: p030t020z2309050895
title: BYD HVS Temperature Heatmap   # optional
```

### hvs-cells-card — 48-cell tile grid

```yaml
type: custom:hvs-cells-card
device_id: p030t020z2309050895
title: BYD HVS Cell Temperatures     # optional
warn_delta: 6                         # optional — delta °C that triggers spread warning (default 6)
```

### hvs-element-card — Element ring gauges

```yaml
type: custom:hvs-element-card
device_id: p030t020z2309050895
title: BYD HVS Elements              # optional
warn_delta: 5                         # optional — per-element Δ°C warning threshold (default 5)
```

### hvs-overview-card — Battery command center

The overview card computes temperature from the 48 cell sensors automatically. All other entities are optional — the card renders whatever you configure.

```yaml
type: custom:hvs-overview-card
device_id: p030t020z2309050895
title: BYD HVS Battery               # optional
entity_soc: sensor.byd_battery_p030t020z2309050895_byd_state_of_charge   # SOC %
entity_power: sensor.byd_battery_p030t020z2309050895_byd_power            # kW (+charge/-discharge)
entity_voltage: sensor.byd_battery_p030t020z2309050895_byd_voltage        # V
entity_current: sensor.byd_battery_p030t020z2309050895_byd_current        # A
entity_state: sensor.byd_battery_p030t020z2309050895_byd_state            # status string
entity_capacity: sensor.byd_battery_p030t020z2309050895_byd_capacity      # kWh
warn_delta: 6                                                               # Δ°C warning (default 6)
```

## Sensor naming

All 48 temperature sensors follow the pattern:
```
sensor.byd_battery_{device_id}_byd_cell_temperature_tower_1_cell_01
...
sensor.byd_battery_{device_id}_byd_cell_temperature_tower_1_cell_48
```

Cells 01–12 → Element 1 (top of physical stack, hottest), 13–24 → E2, 25–36 → E3, 37–48 → Element 4 (floor).

## Dashboard YAML example

```yaml
title: BYD HVS Battery
views:
  - title: Battery
    cards:
      - type: custom:hvs-overview-card
        device_id: p030t020z2309050895
        entity_soc: sensor.byd_battery_p030t020z2309050895_byd_state_of_charge
        entity_power: sensor.byd_battery_p030t020z2309050895_byd_power

      - type: custom:hvs-heatmap-card
        device_id: p030t020z2309050895

      - type: custom:hvs-element-card
        device_id: p030t020z2309050895

      - type: custom:hvs-cells-card
        device_id: p030t020z2309050895
```
