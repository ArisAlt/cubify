# Project Scaffold

This document outlines the file structure and key components of the **Cubify** project.

## Directory Structure

```text
cubify/
│
├── cubify.html               # Main Application File (HTML/CSS)
├── cubify.js                 # Application Logic
├── skills/keyboard-handwiring/  # Public Claude Agent Skill (MIT), own git repo: github.com/ArisAlt/keyboard-handwiring-skill
├── skills/keyboard-handwiring.skill  # Packaged skill (upload/install)
├── README.md                 # Project Overview and Usage Instructions
├── scaffold.md               # Project Structure and Organization
├── GEMINI.md                 # AI Context and Instructions File
├── past_memory.md            # AI Memory and Architectural Log
│
├── keyboard.json             # Example QMK Layout Configuration
├── splitkb_aurora_lily58_rev1_layout_2026-04-07.json  # Alternate Layout Example
├── Screenshot_20260419_140914-1.png # Project reference screenshot
│
└── keymaps/                  # Directory for user-specific keymap files
```

## Key Components

### 1. Main Application (`cubify.html` + `cubify.js`)
A single HTML file containing:
- **UI Structure**: File upload, MCU selection, view toggle button, and keyboard stage.
- **Styling**: Modern, dark-themed CSS with clear visual feedback for interactive elements.
- **Logic**:
  - Parses uploaded QMK JSON files to map the physical layout.
  - Contains a custom C parser to read and associate QMK `LAYOUT` macros from `keymap.c` files.
  - Matches the physical layout properties (x, y, w, h).
  - Associates matrix positions `[row, col]` with predefined MCU pin profiles.
  - Renders interactive SVGs to visualize matrix wiring paths using ribbon cable color coding.
  - Handles the mirroring logic for the bottom (soldering) view and layer switching for top view.
  - Wiring choice (`#wiringSelect` / `#kleWiringSelect`): diode matrix, or direct wiring for macropads (`buildDirectGrids` → `matrix_pins.direct`, one pin per key, shared GND; drawn by `drawControllers(..., direct)`).
  - Firmware export: `firmwareSpec()` (shared pins/matrix/split/info.json, never re-routes) feeds the Vial ZIP and `buildQmkFirmware('via'|'qmk')` (keyboard.json, keymaps from `legendToKeycode`/`firmwareLayers`, `via.json` from `viaLayoutKLE`, build.sh, BUILD.md).
- **Tests** (`tests/`, `npm test`): `harness.js` runs the real `cubify.js` in a fake DOM; `wiring`, `split`, `boards`, `amoeba`, `direct` and `firmware` test files.

### 2. Layout Configurations (`*.json`)
These files define the physical key layout and the matrix structure, extracted from tools like QMK Configurator or a keyboard's source code. They are consumed by the visualizer to render the keyboard.
