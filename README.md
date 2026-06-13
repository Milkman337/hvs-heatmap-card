# HVS Heatmap Card

A custom Home Assistant Lovelace card that displays a temperature heatmap for the BYD HVS battery system.

Visualizes all 48 temperature sensors as a color-coded grid (4 elements × 12 cells), oriented bottom-to-top to match the physical battery stack.

![heatmap preview](preview.png)

## Installation

### HACS (recommended)

1. In HACS → Frontend, click the three-dot menu → **Custom repositories**
2. Add `https://git.kjan.de/jank/hvs-heatmap-card` with category **Lovelace**
3. Install **HVS Heatmap Card** from HACS
4. Add the resource (HACS usually does this automatically)

### Manual

1. Copy `hvs-heatmap-card.js` to `/config/www/hvs-heatmap-card.js`
2. In HA → Settings → Dashboards → Resources, add:
   - URL: `/local/hvs-heatmap-card.js`
   - Type: JavaScript module

## Configuration

```yaml
type: custom:hvs-heatmap-card
device_id: p030t020z2309050895
title: BYD HVS Battery  # optional, defaults to "BYD HVS Temperature Heatmap"
```

| Option | Required | Description |
|--------|----------|-------------|
| `device_id` | yes | The device ID from your sensor names (the part between `byd_battery_` and `_byd_cell_temperature`) |
| `title` | no | Card title |

## Sensor naming

Expects sensors following the pattern:

```
sensor.byd_battery_{device_id}_byd_cell_temperature_tower_1_cell_01
...
sensor.byd_battery_{device_id}_byd_cell_temperature_tower_1_cell_48
```

Cells 01–12 → Element 1 (bottom), 13–24 → E2, 25–36 → E3, 37–48 → Element 4 (top).
