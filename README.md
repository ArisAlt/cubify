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
- **Top and Bottom Views**: Toggle between viewing the keyboard from the top (keycaps) and the bottom (wiring/solder view, which horizontally mirrors the layout).
- **Interactive Tooltips**: Hover over keys to see exact matrix coordinates `[row, col]` and the specific pins to solder for your selected MCU.
- **Hardware Peripherals Panel**: Dynamically displays recommended or JSON-configured pins for OLED displays (I2C SDA/SCL) and Rotary Encoders (Pin A/Pin B).
- **Interactive Encoder Assignment**: Click the "🎯 Assign Encoders" button to convert any key in the visualizer into a Rotary Encoder, visually transforming it and updating its wiring tooltips.
- **Export Capabilities**:
  - **💾 Save JSON**: Instantly inject your encoder and I2C pin assignments into your `keyboard.json` and download the updated layout file.
  - **📄 Copy C Code**: Generates standard QMK `encoder_update_user` boilerplate for your `keymap.c` file based on your assigned encoders.
- **Standalone App**: Entirely contained in a single HTML file—no server or installation required.
- **🧬 Amoeba PCBs layer**: draws every key as an [Amoeba Royale v2.0](https://github.com/mtl/keyboard-pcbs/tree/master/amoeba-royale) single-key PCB on the solder side, with pads in their real positions (rotated with angled keys) and pad-to-pad wiring: rows on the R pads, columns on the C pads, and the per-key LED chain (DOUT → DIN, numbered L0…Ln, one chain per split half) with LED +/− following it. The first LED's data pin is the first free MCU pin. While ticked, the Vial export uses `DIODE_DIRECTION ROW2COL`, because the Amoeba's on-board diode has its anode on the R pad.
  - **Readable by design:** layer switches (Rows · Columns · LED data · LED power · Unused pads; power and unused pads off by default), a 🔍 size slider (100–400%), and hover tracing — point at a key to see only its row, column and LED neighbours.
  - **No wires on top of each other:** long column jumps and LED hops are routed down → across → down, each in its own lane, around everything already drawn.

## Usage

1. Open `cubify.html` in any modern web browser.
2. Click the file input to upload your `keyboard.json` layout file.
3. Select your microcontroller profile from the dropdown.
4. Toggle the view to "Bottom (Wiring/Solder)" when you are ready to solder.
5. Hover over any key to view the matrix positions and target pins.

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
- in the Amoeba layer, every wire joins pads of the same net (no shorts), rows/columns follow the matrix, the LED chain visits every key once DOUT → DIN, boards turn with angled keys, the export switches to ROW2COL, no two wires run on top of each other (AliceZero, test2, Lily58-style), and the layer switches, hover tracing and size slider behave.

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