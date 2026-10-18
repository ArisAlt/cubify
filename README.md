# Cubify — QMK Handwiring Visualizer

## Description

**Cubify** is a web-based, single-page application designed to simplify the process of handwiring custom keyboards. It reads QMK keyboard configuration JSON files and visually maps the physical layout directly to microcontroller pins. This tool bridges the gap between digital configurations and the physical soldering process.

## Features

- **JSON Upload**: Directly upload your QMK `keyboard.json` configuration file.
- **Multiple MCU Profiles**: Built-in pinout support for popular microcontrollers:
  - Raspberry Pi RP2040-Zero
  - Raspberry Pi RP2040-Tiny
  - Arduino Pro Micro (AVR)
  - ZMK nice!nano (nRF52840)
  - ZMK NRF52840 Dev Board (nice!nano V2.0 Compatible)
- **Monolithic or split, chosen with the board**: both board dropdowns are grouped into *Monolithic · one controller* and *Split · two controllers* (`2× RP2040-Zero · TRRS cable`, `2× nice!nano · wireless (ZMK)`, …). A wired split reserves one TRRS link pin per half (RP2040-Plus GP28, Zero/Tiny GP29, Pro Micro D2), keeps it out of the matrix and exports it as `split.serial`; changing the dropdown re-routes an imported KLE layout. nRF52840 boards are ZMK-only, so the Vial export refuses them.
- **A controller per half**: with *Show Wiring* on, each half's rows and columns run ("home-run") to that half's own controller block — columns straight down, rows in their own lanes — with the TRRS link (or BLE for wireless) drawn between the two controllers. Both controllers use the same pin list, as in QMK. The right half is **mirrored** by default (its outer column is col 0, like QMK's `lily58/rev1`, `sofle`, and the Sofle Pico); pick *same direction* for builds numbered like `handwired/dactyl_manuform`, or *flipped in firmware* to keep the matrix numbered left→right while wiring mirror-image, with the right controller's own reversed column list (`split.matrix_pins.right` / `MATRIX_COL_PINS_RIGHT`, like `keebio/iris/rev8`). QMK files that carry `split.matrix_pins.right` are shown with those pins on the right half. Column numbers always follow the physical column order.
- **Explicit split firmware config**: the Vial export declares the split (`split.enabled`), the link (`split.transport.protocol: serial` + `split.serial` driver/pin), each side's pins (`split.matrix_pins.right`, `MATRIX_*_PINS_RIGHT`) and handedness (`MASTER_LEFT`, with `EE_HANDS` instructions). A *split notice* shows keys per half, unused pins on the smaller half (uneven halves are allowed: Keebio Quefrency 30+37, Sinc 38+44) and warns when the halves touch or overlap.
- **🔌 Direct wiring for macropads**: for small boards (roughly 18 keys or fewer) pick *Direct wiring (no diodes)* in the KLE import's **Wiring** dropdown (or in the main bar after importing). Every switch gets its own GPIO, handed out in matrix reading order, and its other leg goes to a shared GND — no diodes, no matrix (the approach from Ewen Cluney's Hand-Wired Keyboard Guide). The option is only offered when the keys fit the board's free pins (a wired split's TRRS pin doesn't count); auto-select picks the smallest board that fits. Each key shows `<pin> | GND`; *Show Wiring* draws one home-run per key to the controller (fanned out to readable pins) plus the GND bus. The export writes `"matrix_pins": {"direct": [[...]]}` (rows of pins, `null` = no key there) and no `diode_direction`, with `split.matrix_pins.right.direct` for a split's right half, and `config.h` quotes the equivalent `DIRECT_PINS`. Cubify warns when there are more keys than free pins and notes when a diode matrix would need fewer pins (a 3×3 pad: 6 pins vs 9). QMK files with direct pins can also be uploaded. The Amoeba PCB layer is matrix-only.
- **Top and Bottom Views**: Toggle between viewing the keyboard from the top (keycaps) and the bottom (wiring/solder view, which horizontally mirrors the layout).
- **Interactive Tooltips**: Hover over keys to see exact matrix coordinates `[row, col]` and the specific pins to solder for your selected MCU.
- **Hardware Peripherals Panel**: Dynamically displays recommended or JSON-configured pins for OLED displays (I2C SDA/SCL) and Rotary Encoders (Pin A/Pin B).
- **Interactive Encoder Assignment**: Click the "🎯 Assign Encoders" button to convert any key in the visualizer into a Rotary Encoder, visually transforming it and updating its wiring tooltips.
- **Firmware export** (after importing a layout), always from the matrix and pins on screen; exporting never re-routes, so the firmware matches the wiring you soldered:
  - **⚙️ Export firmware → VIA or QMK**: a ZIP with a QMK keyboard folder: data-driven `keyboard.json` (pins, matrix, split, direct pins, USB IDs, Bootmagic key), `keymaps/default` and, for VIA, `keymaps/via` (`VIA_ENABLE`) plus `via.json`, which keeps the KLE's rotation and is loaded in usevia.app → Design tab. `build.sh` copies the folder to `keyboards/handwired/<name>` in `~/qmk_firmware` (or `$QMK_HOME`) and runs `qmk compile`. Layer 0 comes from the KLE legends (`!`/`1` → `KC_1`, `Shift` on the right → `KC_RSFT`, a blank wide key → space, `Fn` → `MO(1)`); unknown legends become `KC_NO` and are listed in `BUILD.md`. A loaded `keymap.c` is used instead when present. AliceZero builds this way with no warnings (VIA and QMK), as do a 2× Pro Micro split and a direct-wired pad.
  - **📦 Export Vial ZIP**: the same keyboard for vial-qmk (`keymaps/vial`, `vial.json`, unlock combo).
- **KLE files straight from the editor**: a raw KLE `.json` (e.g. exported from editor.keyboard-tools.xyz, like `AliceZero.json`) can be picked in *Local JSON*; it's auto-routed like *Import KLE*, on the board chosen in *MCU Profile*, and named from the KLE's own `name`.
- **Standalone App**: Entirely contained in a single HTML file—no server or installation required.
- **🧬 Amoeba PCBs layer**: draws every key as an [Amoeba Royale v2.0](https://github.com/mtl/keyboard-pcbs/tree/master/amoeba-royale) single-key PCB on the solder side, with pads in their real positions (rotated with angled keys) and pad-to-pad wiring: rows on the R pads, columns on the C pads, and the per-key LED chain (DOUT → DIN, numbered L0…Ln, one chain per split half) with LED +/− following it. The first LED's data pin is the first free MCU pin; its board also shows where LED + and − connect (e.g. `+ VBUS p40` / `− GND p38` on the RP2040-Plus, `5V`/`GND` on RP2040-Zero/Tiny, `VCC`/`GND` on Pro Micro and nice!nano). While ticked, the Vial export uses `DIODE_DIRECTION ROW2COL`, because the Amoeba's on-board diode has its anode on the R pad. Like the Show Wiring bottom view, it draws a controller block under each half with its pins: every row home-run leaves from an R pad, every column from the lowest board's C pad, and the LED data, LED + and LED − wires run from the first LED board's DIN/VDD/VSS pads to their controller pins; on splits each half has its own controller and the TRRS link sits between them. Pin labels never overlap.
  - **Readable by design:** layer switches (Rows · Columns · LED data · LED power · Unused pads; power and unused pads off by default), a 🔍 size slider (100–400%), and hover tracing — point at a key to see only its row, column and LED neighbours.
  - **Routing rules:** (1) *dead zone* — wires running side by side keep at least 2 px between their edges (4 px at the default 200 % size); crossing at an angle is fine. (2) *pads* — a wire only touches the pads at its own two ends and stays at least 1 px clear of every other pad (pads drawn at their true Ø1.5 mm). Each link takes the shortest route that keeps both rules: a straight link between facing pads when one is clean, otherwise a down → across → down lane (any pad pair, 1 px steps), and as a last resort an A* maze route in which pads are hard walls. Where a gap is too tight for both, the wire still never crosses a pad and gives up as little dead zone as possible.

## Usage

1. Open `cubify.html` in any modern web browser and pick your controller in *MCU Profile*.
2. Follow the **⚙️ Firmware** step bar under the controls (each step turns green with a ✓):
   1. **Load the layout JSON**: a KLE `.json` (e.g. exported from editor.keyboard-tools.xyz) or QMK `keyboard.json` in *Local JSON*, or paste KLE into *Import KLE*.
   2. **Build for VIA or QMK.**
   3. **Show wiring**: wire rows, columns and pins as drawn (the bottom view is the solder side). Hover a key for its matrix position and pins.
   4. **⚙️ Export firmware** (enabled once a layout is loaded): one ZIP with all files and the build/flash instructions. Unzip, run `./build.sh`, flash the `.uf2`/`.hex`.

## Testing

The wiring logic is covered by automated tests that run the real `cubify.js` (no browser needed, Node 18+):

```bash
npm test
```

They import `AliceZero.json` and generated split/monolithic layouts on every board profile, and check that:
- every key gets a unique `[row, col]`, and rows run top→bottom, columns left→right;
- no pin is used twice (a pin on a row *and* a column would short them) and no reserved pin is used;
- each key shows the pins of its row and column, on both halves of a split;
- each drawn wire connects exactly the keys of one row/column (never across split halves) and keeps one colour per pin;
- the bottom (solder) view only mirrors positions — pins and wires are unchanged;
- the exported `config.h`, `info.json` and `vial.json` match what's on screen, including split `MATRIX_ROWS` and a Vial unlock combo on keys that exist;
- the QMK/VIA export keeps the on-screen pins and matrix (exporting changes nothing), starts the layout at 0,0, maps AliceZero's legends to keycodes, writes a `via.json` with the same IDs, matrix and keys, and handles splits, direct wiring, a loaded keymap.c and ZMK-only boards;
- with direct wiring, every key gets its own pin in reading order (gaps are `null`), each key's home-run ends on its own controller pin and no two wires touch (GND bus included, top and bottom view), the export carries `matrix_pins.direct` / `split.matrix_pins.right.direct` without `diode_direction`, and over-budget layouts warn and mark the extra keys N/A;
- in the Amoeba layer, every wire joins pads of the same net (no shorts), rows/columns follow the matrix, the LED chain visits every key once DOUT → DIN, boards turn with angled keys, the export switches to ROW2COL, both routing rules hold (no wire over a foreign pad anywhere; 2 px dead zone on AliceZero and test2), there are no needless detours, and the layer switches, hover tracing and size slider behave.

## Getting Started

To test out the visualizer, you can use the provided `keyboard.json` or `splitkb_aurora_lily58_rev1_layout_*.json` files included in the project directory.
## ⌨️ Reference Build: Lily58 Zero (Handwired)

Welcome to the **Lily58 Zero** repository. This is a custom, handwired split keyboard powered by the RP2040 microcontroller. 

## 🛠️ Hardware Specifications

* **Keyboard:** Lily58 (58 keys)
* **Build Type:** Custom Handwired 
* **Microcontroller:** RP2040 (e.g., RP2040-Tiny)
* **Bootloader:** `rp2040`
* **Diode Direction:** `COL2ROW`
* **Communication:** Serial (Half-Duplex)

## 📍 Pinout Matrix (RP2040)

Both the left and right halves are mirrored and use the exact same microcontroller pins.

* **Rows (5):** `GP0`, `GP1`, `GP2`, `GP3`, `GP4`
* **Columns (6):** `GP10`, `GP9`, `GP8`, `GP7`, `GP6`, `GP5`
* **Split Serial Communication:** `GP15`

## 🧠 Keymap Architecture

The firmware utilizes a robust Tri-Layer logic system:
*Layer 0 (Base):** Standard QWERTY layout with ergonomic thumb modifiers.
**Layer 1 (Lower):** F-Keys, Numpad, and navigation cluster. Accessed by holding `MO(1)` (Left inner thumb).
**Layer 2 (Raise):**Symbols, numbers, and secondary navigation. Accessed by holding `MO(2)` (Right inner thumb).
**Layer 3 (System):**RGB/Lighting controls. Accessed by holding both `MO(1)` and `MO(2)` simultaneously.

## 🚀 Flashing Instructions

To compile and flash the firmware using the QMK CLI, follow these exact steps:

1. **Verify Directory:** Ensure your files are placed in:
   `~/qmk_firmware/keyboards/handwired/lily58_zero/`
2. **Clean Build:** Run the compile command with the `-c` flag to prevent cached errors: