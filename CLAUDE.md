# HVS Heatmap Card

Custom Home Assistant Lovelace card for the BYD HVS battery temperature heatmap.

## Structure

- `hvs-heatmap-card.js` — single-file custom element, no build step
- `hacs.json` — HACS manifest (category: Dashboard)

## Card layout

4 vertical columns (one per battery element), E1 on the left (bottom of stack), E4 on the right (top).
Each column has 12 cells stacked top-to-bottom, showing global cell number and temperature.
Smooth HSL gradient: blue (cold) → cyan → green → yellow → red (hot).

## Sensor pattern

All 48 sensors are under `tower_1`:
`sensor.byd_battery_{device_id}_byd_cell_temperature_tower_1_cell_01` … `cell_48`

Cells 01–12 = Element 1 (bottom), 13–24 = E2, 25–36 = E3, 37–48 = Element 4 (top).

## Config

```yaml
type: custom:hvs-heatmap-card
device_id: p030t020z2309050895
title: BYD HVS Battery   # optional
```

## Remote

`https://git.kjan.de/jank/hvs-heatmap-card.git` — push with `git push`
