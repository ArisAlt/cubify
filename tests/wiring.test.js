// Row/column → pin → wire consistency tests for Cubify.  Run: node --test tests/
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./harness");
const fx = require("./fixtures");

// Pins that must never be used for the matrix, per board (see skills/keyboard-handwiring).
const RESERVED = {
    rp2040_zero: ["GP16"], rp2040_tiny: ["GP16"], waveshare_2040_plus: ["GP23", "GP24", "GP25", "GP29"],
    pro_micro: ["B0", "B7", "D5", "E2"], nice_nano: ["P0.13", "P0.15"], nrf52840_nicenano_clone: ["P0.13", "P0.15"],
};

const name = k => k.key.label || `#${k.i}@(${k.key.x},${k.key.y})`;

/** All checks for one rendered layout. Returns the context for extra assertions. */
async function checkBoard(ctx, { split = false, expectFit = true } = {}) {
    const json = ctx.app.currentJSON;
    assert.ok(json, `import failed: ${ctx.alerts.join(" | ")}`);
    const rows = json.matrix_pins.rows, cols = json.matrix_pins.cols;
    const board = ctx.byId("boardSelect").value;
    const profile = ctx.app.boardProfiles[board];

    // ── 1. pin lists are sane ─────────────────────────────────────────────
    const all = [...rows, ...cols];
    const dup = all.filter((p, i) => all.indexOf(p) !== i);
    assert.deepEqual(dup, [], `pin used twice (row and col would be shorted): ${dup.join(", ")} rows=${rows} cols=${cols}`);
    if (profile) {
        for (const p of all) {
            assert.ok(profile.pins.includes(p), `pin ${p} is not in ${board}'s usable pins`);
            assert.ok(!(RESERVED[board] || []).includes(p), `pin ${p} is reserved on ${board}`);
        }
    }

    // ── 2. every key: unique coordinate, displayed pins match the pin lists ─
    h.setView(ctx, { bottom: false, wiring: true });
    const keys = h.readKeys(ctx);
    const perHalf = rows.length;
    const seen = new Map();
    for (const k of keys) {
        assert.ok(k.matrix, `key ${name(k)} has no matrix coordinate`);
        const id = k.matrix.join(",");
        if (seen.has(id)) assert.fail(`keys ${name(seen.get(id))} and ${name(k)} share matrix ${id}`);
        seen.set(id, k);
        const [r, c] = k.matrix;
        const nr = split ? r % perHalf : r;
        if (expectFit) {
            assert.equal(k.rowPin, rows[nr], `key ${name(k)} [${r},${c}] shows row pin ${k.rowPin}, expected ${rows[nr]}`);
            assert.equal(k.colPin, cols[c], `key ${name(k)} [${r},${c}] shows col pin ${k.colPin}, expected ${cols[c]}`);
        }
    }

    // ── 3. split: halves are physically consistent ──────────────────────
    let sideOf = () => 0;
    if (split) {
        const xs = keys.map(k => k.cx).sort((a, b) => a - b);
        let gap = 0, mid = 0;
        for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > gap) { gap = xs[i] - xs[i - 1]; mid = (xs[i] + xs[i - 1]) / 2; }
        sideOf = k => (k.cx > mid ? 1 : 0);
        for (const k of keys) {
            const side = k.matrix[0] >= perHalf ? 1 : 0;
            assert.equal(side, sideOf(k), `key ${name(k)} is physically on the ${sideOf(k) ? "right" : "left"} half but matrix row ${k.matrix[0]} puts it on the ${side ? "right" : "left"}`);
        }
        const maxRow = Math.max(...keys.map(k => k.matrix[0]));
        assert.ok(maxRow < 2 * perHalf, `matrix row ${maxRow} has no pin: ${perHalf} row pins per half`);
    }

    // ── 4. wires: each drawn wire = exactly one row / column (per half) ───
    const wires = h.readWires(ctx);
    for (const kind of ["row", "col"]) {
        const { groups, orphanEnds } = h.wireGroups(keys, wires, kind);
        assert.equal(orphanEnds.length, 0, `${kind} wire ends not on any key: ${orphanEnds.length}`);
        const want = {};
        keys.forEach(k => {
            const idx = kind === "row" ? (split ? k.matrix[0] % perHalf : k.matrix[0]) : k.matrix[1];
            const g = `${sideOf(k)}:${idx}`;
            (want[g] = want[g] || []).push(k.i);
        });
        const norm = gs => gs.map(g => [...g].sort((a, b) => a - b).join(" ")).sort();
        const got = norm(groups), exp = norm(Object.values(want));
        const bad = got.filter(g => !exp.includes(g)).map(g => g.split(" ").map(i => `${name(keys[+i])}[${keys[+i].matrix}]`).join(", "));
        assert.deepEqual(got, exp, `${kind} wires don't match the matrix. Wrong wire(s): ${bad.slice(0, 3).join(" || ")}`);
        // a chain of n keys needs exactly n-1 segments (no loops, no extra jumps)
        const segs = wires.lines.filter(l => l.kind === kind).length;
        assert.equal(segs, keys.length - groups.length, `${kind} wires have ${segs} segments, expected ${keys.length - groups.length}`);
    }

    // ── 4b. wire colours follow pin order (ribbon cable: rows first, then cols) ──
    const palette = [...new Set(wires.lines.map(l => l.color))];
    const colourOf = (kind, k) => {
        const anchor = [k.cx, kind === "row" ? k.cy - h.ZONE : k.cy + h.ZONE];
        const d = wires.dots.find(d => Math.abs(d.p[0] - anchor[0]) < 0.01 && Math.abs(d.p[1] - anchor[1]) < 0.01);
        return d && d.color;
    };
    const byWire = {};
    for (const k of keys) {
        const ri = split ? k.matrix[0] % perHalf : k.matrix[0];
        for (const [kind, pinIdx] of [["row", ri], ["col", rows.length + k.matrix[1]]]) {
            const c = colourOf(kind, k);
            assert.ok(c, `no ${kind} anchor drawn for key ${name(k)}`);
            const id = `${kind}${pinIdx}`;
            if (byWire[id] && byWire[id] !== c) {
                assert.fail(`${kind} wire on pin ${kind === "row" ? rows[ri] : cols[k.matrix[1]]} has two colours (${byWire[id]} vs ${c}) — key ${name(k)}`);
            }
            byWire[id] = c;
        }
    }
    const order = [...rows.map((_, i) => `row${i}`), ...cols.map((_, i) => `col${rows.length + i}`)].filter(id => byWire[id]);
    for (let i = 1; i < order.length && palette.length > 1; i++) {
        assert.notEqual(byWire[order[i]], byWire[order[i - 1]], `neighbouring pins ${order[i - 1]} and ${order[i]} have the same wire colour`);
    }

    // ── 5. bottom (solder) view: mirrored positions, identical pins/wires ──
    h.setView(ctx, { bottom: true, wiring: true });
    const bottom = h.readKeys(ctx);
    const width = Math.max(...keys.map(k => k.left + k.w));
    keys.forEach((k, i) => {
        const b = bottom[i];
        assert.ok(Math.abs(b.left - (width - k.left - k.w)) < 0.01, `key ${name(k)} not mirrored in bottom view`);
        assert.equal(b.top, k.top);
        assert.deepEqual([b.matrix, b.rowPin, b.colPin], [k.matrix, k.rowPin, k.colPin], `key ${name(k)} changes pins in bottom view`);
    });
    const bw = h.readWires(ctx);
    for (const kind of ["row", "col"]) {
        assert.equal(h.wireGroups(bottom, bw, kind).groups.length, h.wireGroups(keys, wires, kind).groups.length,
            `bottom view has a different number of ${kind} wires`);
    }
    h.setView(ctx, { bottom: false, wiring: true });

    // ── 6. export: firmware files agree with what's on screen ─────────────
    const files = await h.exportZip(ctx);
    const cfg = h.parseConfigH(files["config.h"]);
    assert.deepEqual(cfg.rowPins, rows, "config.h MATRIX_ROW_PINS differs from displayed row pins");
    assert.deepEqual(cfg.colPins, cols, "config.h MATRIX_COL_PINS differs from displayed col pins");
    assert.equal(cfg.cols, cols.length, "MATRIX_COLS ≠ number of column pins");
    assert.equal(cfg.rows, split ? 2 * rows.length : rows.length,
        split ? "split MATRIX_ROWS must be 2 × row pins per half" : "MATRIX_ROWS ≠ number of row pins");
    const info = JSON.parse(files["info.json"]);
    assert.deepEqual(info.matrix_pins, { rows, cols }, "info.json matrix_pins differ from display");
    const infoLayout = Object.values(info.layouts)[0].layout;
    assert.deepEqual(infoLayout.map(e => e.matrix), keys.map(k => k.matrix), "info.json key order/matrix differs from display");
    const vial = JSON.parse(files["keymaps/vial/vial.json"]);
    assert.equal(vial.matrix.rows, cfg.rows, "vial.json matrix.rows ≠ MATRIX_ROWS");
    assert.equal(vial.matrix.cols, cfg.cols, "vial.json matrix.cols ≠ MATRIX_COLS");
    const labels = vial.layouts.keymap.flat().filter(x => typeof x === "string").sort();
    assert.deepEqual(labels, keys.map(k => k.matrix.join(",")).sort(), "vial.json row,col labels differ from the layout");
    const vcfg = files["keymaps/vial/config.h"];
    const ur = /VIAL_UNLOCK_COMBO_ROWS \{ *(\d+), *(\d+) *\}/.exec(vcfg), uc = /VIAL_UNLOCK_COMBO_COLS \{ *(\d+), *(\d+) *\}/.exec(vcfg);
    for (const i of [1, 2]) {
        assert.ok(seen.has(`${ur[i]},${uc[i]}`), `Vial unlock combo key ${ur[i]},${uc[i]} does not exist — board could never be unlocked`);
    }
    return { keys, rows, cols, files };
}

describe("AliceZero (real board, KLE import)", () => {
    for (const board of ["waveshare_2040_plus", "auto"]) {
        test(`monolithic on ${board}`, async () => {
            const ctx = h.importKLE(fx.alice(), { board });
            const { rows, cols } = await checkBoard(ctx);
            assert.equal(rows.length + cols.length, 23, "Alice should route to 5 rows × 18 cols");
        });
    }
    test("RP2040-Plus pin plan stays the wired one: rows GP0-GP4, cols GP5-GP22 in order", () => {
        const { rows, cols } = h.importKLE(fx.alice(), { board: "waveshare_2040_plus" }).app.currentJSON.matrix_pins;
        assert.deepEqual(rows, ["GP0", "GP1", "GP2", "GP3", "GP4"]);
        assert.deepEqual(cols, Array.from({ length: 18 }, (_, i) => `GP${i + 5}`));
    });
    test("columns are numbered left→right and rows top→bottom", () => {
        const ctx = h.importKLE(fx.alice(), { board: "waveshare_2040_plus" });
        h.setView(ctx, { wiring: false });
        const keys = h.readKeys(ctx);
        const avg = (sel, f) => { const v = keys.filter(sel).map(f); return v.reduce((a, b) => a + b, 0) / v.length; };
        for (let c = 1; c < 18; c++) {
            assert.ok(avg(k => k.matrix[1] === c, k => k.cx) > avg(k => k.matrix[1] === c - 1, k => k.cx), `col ${c} is not right of col ${c - 1}`);
        }
        for (let r = 1; r < 5; r++) {
            assert.ok(avg(k => k.matrix[0] === r, k => k.cy) > avg(k => k.matrix[0] === r - 1, k => k.cy), `row ${r} is not below row ${r - 1}`);
        }
    });
    test("RP2040-Zero (20 pins) cannot fit 23 pins: must warn, never show a wrong pin", () => {
        const ctx = h.importKLE(fx.alice(), { board: "rp2040_zero" });
        assert.ok(ctx.alerts.some(a => /not have enough pins/i.test(a)), "no pin-shortage warning");
        h.setView(ctx, { wiring: false });
        const keys = h.readKeys(ctx);
        const { rows, cols } = ctx.app.currentJSON.matrix_pins;
        const all = [...rows, ...cols];
        assert.equal(new Set(all).size, all.length, "pins reused while out of pins");
        for (const k of keys) {
            if (!k.rowPin.includes("N/A")) assert.equal(k.rowPin, rows[k.matrix[0]]);
            if (!k.colPin.includes("N/A")) assert.equal(k.colPin, cols[k.matrix[1]]);
        }
        assert.ok(keys.some(k => k.colPin.includes("N/A")), "keys beyond the pin budget must show N/A");
    });
});

describe("monolithic layouts", () => {
    const boards = ["waveshare_2040_plus", "rp2040_zero", "rp2040_tiny", "pro_micro", "nice_nano"];
    for (const board of boards) {
        test(`5×8 ortho on ${board}`, async () => checkBoard(h.importKLE(fx.ortho(5, 8), { board })));
    }
    test("5×10 ortho on rp2040_tiny (default row/col lists overlap)", async () =>
        checkBoard(h.importKLE(fx.ortho(5, 10), { board: "rp2040_tiny" })));
    test("6×12 ortho on pro_micro (exactly 18 pins)", async () =>
        checkBoard(h.importKLE(fx.ortho(6, 12), { board: "pro_micro" })));
    test("top row with a hole: unlock combo must use keys that exist", async () =>
        checkBoard(h.importKLE(fx.holeyTopRow(), { board: "rp2040_zero" })));
});

describe("split layouts", () => {
    for (const board of ["rp2040_zero", "pro_micro", "waveshare_2040_plus"]) {
        test(`2 × (4×6) ortho on ${board}`, async () =>
            checkBoard(h.importKLE(fx.ortho(4, 6, { gap: 3 }), { split: true, board }), { split: true }));
    }
    test("Lily58-style stagger + inner keys + thumbs", async () =>
        checkBoard(h.importKLE(fx.lilyLike(), { split: true, board: "rp2040_zero" }), { split: true }));
    test("right half has more rows than left", async () =>
        checkBoard(h.importKLE(fx.ortho(4, 6, { gap: 3, rightRows: 5 }), { split: true, board: "rp2040_zero" }), { split: true }));
    test("left half has more rows than right", async () =>
        checkBoard(h.importKLE(fx.ortho(5, 6, { gap: 3, rightRows: 4 }), { split: true, board: "rp2040_zero" }), { split: true }));
    test("hand-labelled row,col on every key", async () =>
        checkBoard(h.importKLE(fx.manualSplit(), { split: true, board: "rp2040_zero" }), { split: true }));
});

describe("uploaded QMK files (already wired)", () => {
    test("test2_keyboard.json keeps its own pins", async () => {
        const ctx = h.uploadJSON(fx.test2());
        const { rows, cols } = await checkBoard(ctx);
        assert.deepEqual(rows, fx.test2().matrix_pins.rows);
        assert.deepEqual(cols, fx.test2().matrix_pins.cols);
    });
    test("split upload: right half uses the same pins as the left", async () =>
        checkBoard(h.uploadJSON(fx.qmkSplitUpload()), { split: true }));
});
