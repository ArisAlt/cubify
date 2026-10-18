// Layout fixtures. AliceZero.json (repo root) is the real board; the rest are generated
// to hit specific routing cases (splits, uneven halves, hand-labelled matrices, gaps).
"use strict";
const path = require("path");

const alice = () => require(path.join(__dirname, "..", "AliceZero.json"));
const test2 = () => require(path.join(__dirname, "..", "test2_keyboard.json"));

/** Plain ortho grid; `gap` inserts empty units between the halves (split boards). */
function ortho(rows, cols, { gap = 0, rightRows = rows, label = (r, c) => `${r}-${c}` } = {}) {
    const kle = [];
    for (let r = 0; r < Math.max(rows, rightRows); r++) {
        const row = [];
        let x = 0;
        for (let c = 0; c < cols; c++) {
            if (r < rows) { if (x) row.push({ x }); row.push(label(r, c)); x = 0; } else x += 1;
        }
        if (gap) {
            x += gap;
            for (let c = 0; c < cols; c++) {
                if (r < rightRows) { if (x) row.push({ x }); row.push(label(r, c + cols)); x = 0; } else x += 1;
            }
        }
        kle.push(row);
    }
    return kle;
}

/** Lily58-style split: column stagger, inner keys and a rotated-free thumb arc. */
function lilyLike() {
    const stagger = [0.5, 0.375, 0.125, 0, 0.125, 0.25];
    const keys = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) keys.push({ x: c, y: r + stagger[c], l: `L${r}${c}` });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) keys.push({ x: 15 - c, y: r + stagger[c], l: `R${r}${c}` });
    keys.push({ x: 6, y: 2.75, l: "L[" }, { x: 9, y: 2.75, l: "R]" });
    [[2.5, 4.125], [3.5, 4.15], [4.5, 4.25], [6, 4.25]].forEach(([x, y], i) => {
        keys.push({ x, y, l: `LT${i}` }); keys.push({ x: 15 - x, y, l: `RT${i}` });
    });
    // One KLE row per key keeps absolute positions exact.
    let cy = 0;
    return keys.map(k => { const row = [{ x: k.x, y: k.y - cy }, k.l]; cy = k.y + 1; return row; });
}

/** Every key carries a hand-written "row,col" label (kle-ng / VIA style). */
function manualSplit() {
    return ortho(3, 4, { gap: 2, label: (r, c) => (c < 4 ? `${r},${c}` : `${r + 3},${c - 4}`) });
}

/** Row 0 has a hole where column 1 would be (unlock combo 0,1 can't exist). */
function holeyTopRow() {
    return [["A", { x: 1 }, "C", "D"], ["E", "F", "G", "H"]];
}

/** QMK-style split upload: matrix_pins per half, right rows offset by 4. */
function qmkSplitUpload() {
    const layout = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) layout.push({ matrix: [r, c], x: c, y: r });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) layout.push({ matrix: [r + 4, 5 - c], x: 9 + c, y: r });
    return {
        keyboard_name: "split_upload", processor: "RP2040", bootloader: "rp2040", diode_direction: "COL2ROW",
        split: { enabled: true },
        matrix_pins: { rows: ["GP0", "GP2", "GP3", "GP4"], cols: ["GP5", "GP6", "GP7", "GP8", "GP9", "GP10"] },
        layouts: { LAYOUT: { layout } },
    };
}

// Pins that must never be used for the matrix, per board (see skills/keyboard-handwiring, Waveshare and
// Raspberry Pi pinouts). Every board in BOARD_META needs an entry (boards-switch.test.js checks).
const RESERVED = {
    rp2040_zero: ["GP16"], rp2040_tiny: ["GP16", "GP24", "GP25"], waveshare_2040_plus: ["GP23", "GP24", "GP25", "GP29"],
    raspberry_pi_pico: ["GP23", "GP24", "GP25", "GP29"],
    pro_micro: ["B0", "B7", "D5", "E2"], nice_nano: ["P0.13", "P0.15"], nrf52840_nicenano_clone: ["P0.13", "P0.15"],
};

module.exports = { RESERVED, alice, test2, ortho, lilyLike, manualSplit, holeyTopRow, qmkSplitUpload };
