// Direct wiring (macropads): one GPIO per key, shared GND, no diodes, no matrix.
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./harness");
const fx = require("./fixtures");

const svgOf = ctx => ctx.byId("stage").children.find(c => c.tagName === "svg");
const optionsOf = sel => Object.fromEntries(sel.children.filter(c => c.tagName === "option").map(o => [o.value, o]));
const GRID_3x3 = [["GP0", "GP1", "GP2"], ["GP3", "GP4", "GP5"], ["GP6", "GP7", "GP8"]];

function direct(kle, opts = {}) {
    const ctx = h.importKLE(kle, { board: "rp2040_zero", wiring: "direct", ...opts });
    h.setView(ctx, { wiring: true });
    return ctx;
}

describe("direct wiring: pin assignment", () => {
    test("3×3 macropad: one pin per key in reading order, every key on GND", () => {
        const ctx = direct(fx.ortho(3, 3));
        const j = ctx.app.currentJSON;
        assert.deepEqual(j.matrix_pins, { direct: GRID_3x3 });
        assert.equal(j.diode_direction, undefined, "no diodes → no diode_direction");
        const keys = h.readKeys(ctx);
        assert.equal(keys.length, 9);
        keys.forEach(k => {
            assert.equal(k.rowPin, GRID_3x3[k.matrix[0]][k.matrix[1]], `key ${k.i} shows its own pin`);
            assert.equal(k.colPin, "GND");
        });
        assert.equal(new Set(keys.map(k => k.rowPin)).size, 9, "no pin is shared");
        assert.ok(!/Direct wiring needs/.test(ctx.byId("warningBanner").innerHTML));
    });

    test("notes when a diode matrix would use fewer pins (3×3 = 6 vs 9), and not when it wouldn't", () => {
        const pad = direct(fx.ortho(3, 3));
        assert.match(pad.byId("boardInfo").textContent, /Direct wiring: one pin per key \(9 pins\)/);
        assert.match(pad.byId("boardInfo").textContent, /3×3 diode matrix would use fewer pins: 6 vs 9/);
        const strip = direct(fx.ortho(1, 4));
        assert.doesNotMatch(strip.byId("boardInfo").textContent, /would use fewer/);
    });

    test("a hole in the layout is a null (NO_PIN) in the grid; pins stay contiguous", () => {
        const ctx = direct(fx.holeyTopRow());
        const grid = ctx.app.currentJSON.matrix_pins.direct;
        const flat = grid.flat();
        assert.equal(flat.filter(p => p === null).length, flat.length - 7, "one null per missing key");
        assert.deepEqual(flat.filter(Boolean), ["GP0", "GP1", "GP2", "GP3", "GP4", "GP5", "GP6"]);
    });

    test("auto-select picks the smallest board with a free pin for every key", () => {
        assert.equal(direct(fx.ortho(3, 3), { board: "auto" }).byId("boardSelect").value, "pro_micro"); // 18 pins
        assert.equal(direct(fx.ortho(4, 5), { board: "auto" }).byId("boardSelect").value, "rp2040_zero"); // 20 keys
    });

    test("bottom (solder) view keeps every key's pin", () => {
        const ctx = direct(fx.ortho(3, 3));
        const top = h.readKeys(ctx).map(k => k.rowPin);
        h.setView(ctx, { bottom: true, wiring: true });
        assert.deepEqual(h.readKeys(ctx).map(k => k.rowPin), top);
    });
});

describe("direct wiring: drawing", () => {
    test("one home-run per key to the controller, a GND bus to every key, no matrix wires", () => {
        const ctx = direct(fx.ortho(3, 3));
        const c = h.readControllers(ctx);
        const keys = h.readKeys(ctx);
        assert.equal(c.blocks.length, 1);
        const runs = c.homeruns.filter(r => r.kind === "key");
        assert.equal(runs.length, 9);
        runs.forEach(r => {
            assert.equal(r.pin, keys[r.idx].rowPin, "wire ends on the key's own pin");
            const [sx, sy] = r.path[0], [, ey] = r.path[r.path.length - 1];
            assert.ok(Math.abs(sx - keys[r.idx].cx) < 0.01 && Math.abs(sy - (keys[r.idx].cy - h.ZONE)) < 0.01, "starts on its key");
            assert.equal(ey, c.blocks[0].y, "ends on the controller");
        });
        // vertical lanes never share an x, so wires never run on top of each other
        const lanes = runs.map(r => r.path[r.path.length - 1][0]);
        for (let i = 0; i < lanes.length; i++) for (let j = i + 1; j < lanes.length; j++)
            assert.ok(Math.abs(lanes[i] - lanes[j]) >= 4, `lanes ${i} and ${j} are ≥4 px apart`);
        const gnd = c.homeruns.filter(r => r.kind === "gnd");
        assert.equal(gnd.length, 1);
        assert.equal(gnd[0].pin, "GND");
        const kids = svgOf(ctx).children;
        const stubs = kids.filter(k => k.attrs["data-gnd-key"] !== undefined).map(k => +k.attrs["data-gnd-key"]).sort((a, b) => a - b);
        assert.deepEqual(stubs, [0, 1, 2, 3, 4, 5, 6, 7, 8], "every key has a GND stub");
        assert.equal(kids.filter(k => k.tagName === "line").length, 0, "no row/column chains");
    });

    for (const [name, kle, opts] of [["3×3", fx.ortho(3, 3), {}], ["6×3 (18 keys)", fx.ortho(6, 3), {}],
        ["split 3×3 per half", fx.ortho(3, 3, { gap: 3 }), { split: true }]]) {
        test(`${name}: no wire crosses or runs along another (GND bus included)`, () => {
            const ctx = direct(kle, opts);
            for (const bottom of [false, true]) {
                h.setView(ctx, { bottom, wiring: true });
                const kids = svgOf(ctx).children.filter(k => k.tagName === "polyline");
                const wires = kids.map(k => ({
                    id: k.attrs["data-homerun"] || "gnd", gnd: k.attrs["data-gnd"] !== undefined || /^gnd/.test(k.attrs["data-homerun"] || ""),
                    segs: (pts => pts.slice(1).map((p, i) => [pts[i], p]))(k.attrs.points.split(" ").map(p => p.split(",").map(Number))),
                }));
                const hits = (a, b) => { // axis-aligned segments touch or overlap?
                    const [[ax1, ay1], [ax2, ay2]] = a, [[bx1, by1], [bx2, by2]] = b;
                    const ov = (p1, p2, q1, q2) => Math.max(Math.min(p1, p2), Math.min(q1, q2)) <= Math.min(Math.max(p1, p2), Math.max(q1, q2)) + 0.01;
                    return ov(ax1, ax2, bx1, bx2) && ov(ay1, ay2, by1, by2);
                };
                for (let i = 0; i < wires.length; i++) for (let j = i + 1; j < wires.length; j++) {
                    if (wires[i].gnd && wires[j].gnd) continue; // the GND bus is one net
                    for (const a of wires[i].segs) for (const b of wires[j].segs)
                        assert.ok(!hits(a, b), `${wires[i].id} touches ${wires[j].id} (${bottom ? "bottom" : "top"} view)`);
                }
            }
        });
    }

    test("split: each half's keys run to their own controller", () => {
        const ctx = direct(fx.ortho(2, 3, { gap: 3 }), { split: true });
        const c = h.readControllers(ctx);
        assert.equal(c.blocks.length, 2);
        for (const side of [0, 1]) {
            assert.equal(c.homeruns.filter(r => r.kind === "key" && r.ctrl === side).length, 6);
            assert.equal(c.homeruns.filter(r => r.kind === "gnd" && r.ctrl === side).length, 1);
        }
        assert.equal(c.link.type, "trrs");
    });
});

describe("direct wiring: export", () => {
    test("info.json has matrix_pins.direct and no diode_direction; config.h explains it", async () => {
        const ctx = direct(fx.ortho(3, 3));
        const files = await h.exportZip(ctx);
        const info = JSON.parse(files["info.json"]);
        assert.deepEqual(info.matrix_pins, { direct: GRID_3x3 });
        assert.ok(!("diode_direction" in info));
        assert.ok(!("split" in info));
        const cfg = files["config.h"];
        assert.doesNotMatch(cfg, /#define (DIODE_DIRECTION|MATRIX_ROW_PINS|MATRIX_COL_PINS)/);
        assert.match(cfg, /\/\/ Direct wiring: every switch has its own GPIO/);
        assert.match(cfg, /\/\/ {3}#define DIRECT_PINS \{ \{ GP0, GP1, GP2 \}, \{ GP3, GP4, GP5 \}, \{ GP6, GP7, GP8 \} \}/);
        const cfgNums = h.parseConfigH(cfg);
        assert.equal(cfgNums.rows, 3);
        assert.equal(cfgNums.cols, 3);
        assert.deepEqual(JSON.parse(files["keymaps/vial/vial.json"]).matrix, { rows: 3, cols: 3 });
    });

    test("gaps export as null in info.json and NO_PIN in the config.h comment", async () => {
        const files = await h.exportZip(direct(fx.holeyTopRow()));
        assert.ok(JSON.parse(files["info.json"]).matrix_pins.direct.flat().includes(null));
        assert.match(files["config.h"], /NO_PIN/);
    });

    test("split: right half in split.matrix_pins.right.direct, link pin kept out, MATRIX_ROWS doubled", async () => {
        const ctx = direct(fx.ortho(2, 3, { gap: 3 }), { split: true });
        const files = await h.exportZip(ctx);
        const info = JSON.parse(files["info.json"]);
        const left = info.matrix_pins.direct, right = info.split.matrix_pins.right.direct;
        assert.deepEqual(left, [["GP0", "GP1", "GP2"], ["GP3", "GP4", "GP5"]]);
        assert.deepEqual(right, left, "mirrored right half: mirror-twin keys share a pin");
        assert.deepEqual(info.split.serial, { driver: "vendor", pin: "GP29" });
        assert.ok(![...left.flat(), ...right.flat()].includes("GP29"));
        assert.equal(h.parseConfigH(files["config.h"]).rows, 4);
        assert.match(files["config.h"], /DIRECT_PINS_RIGHT/);
        // right-half keys show their pins too
        const keys = h.readKeys(ctx);
        keys.filter(k => k.matrix[0] >= 2).forEach(k => assert.equal(k.rowPin, right[k.matrix[0] - 2][k.matrix[1]]));
    });
});

describe("direct wiring: pin budget", () => {
    test("more keys than free pins: warning, keys without a pin are N/A", () => {
        const ctx = direct(fx.ortho(5, 5), { board: "pro_micro" }); // 25 keys, 18 pins
        assert.ok(ctx.alerts.some(a => /direct wiring needs one pin per key: 25 keys.*18 free pins/.test(a)), ctx.alerts.join("\n"));
        assert.match(ctx.byId("warningBanner").innerHTML, /Direct wiring needs one pin per key: 25 keys.*only 18 free GPIO pins \(7 keys left without a pin\).*5×5 = 10 pins/);
        assert.equal(ctx.byId("warningBanner").style.display, "block");
        const keys = h.readKeys(ctx);
        assert.equal(keys.filter(k => /N\/A/.test(k.rowPin)).length, 7);
    });

    test("the TRRS link pin counts against a split's direct pins", () => {
        // 20 keys per half: fits a monolithic RP2040-Zero (20 pins), not a TRRS half (19)
        const ctx = direct(fx.ortho(4, 5, { gap: 3 }), { split: true });
        assert.match(ctx.byId("warningBanner").innerHTML, /20 keys per half.*only 19 free/);
    });

    test("direct wiring is only offered when the keys fit the board's free pins", () => {
        const fits = h.importKLE(fx.ortho(3, 3), { board: "pro_micro" });
        const sel = fits.byId("wiringSelect");
        assert.equal(sel.style.display, "", "shown for KLE imports");
        assert.equal(optionsOf(sel).direct.disabled, false);
        assert.match(optionsOf(sel).direct.textContent, /9 keys, 18 free pins/);
        const tooBig = h.importKLE(fx.ortho(5, 5), { board: "pro_micro" });
        assert.equal(optionsOf(tooBig.byId("wiringSelect")).direct.disabled, true);
        assert.match(optionsOf(tooBig.byId("wiringSelect")).direct.textContent, /25 keys, only 18 free pins/);

        // KLE modal: re-checked as the layout is pasted
        const m = h.load({ board: "pro_micro" });
        m.byId("kleBoardSelect").value = "pro_micro";
        m.byId("kleInput").value = JSON.stringify(fx.ortho(5, 5));
        m.byId("kleInput").dispatch("input");
        assert.equal(optionsOf(m.byId("kleWiringSelect")).direct.disabled, true);
        m.byId("kleInput").value = JSON.stringify(fx.ortho(3, 3));
        m.byId("kleInput").dispatch("input");
        assert.equal(optionsOf(m.byId("kleWiringSelect")).direct.disabled, false);
    });

    test("switching wiring and board from the main bar re-routes the import", () => {
        const ctx = direct(fx.ortho(3, 3));
        const wiring = ctx.byId("wiringSelect");
        assert.equal(wiring.value, "direct");
        wiring.value = "matrix"; wiring.dispatch("change");
        assert.deepEqual(Object.keys(ctx.app.currentJSON.matrix_pins).sort(), ["cols", "rows"]);
        assert.equal(ctx.app.currentJSON.diode_direction, "COL2ROW");
        wiring.value = "direct"; wiring.dispatch("change");
        assert.deepEqual(ctx.app.currentJSON.matrix_pins.direct, GRID_3x3);
        const board = ctx.byId("boardSelect");
        board.value = "pro_micro"; board.dispatch("change");
        assert.deepEqual(ctx.app.currentJSON.matrix_pins.direct[0], ["D4", "C6", "D7"], "still direct, on the new board's pins");
    });
});

describe("direct wiring: QMK upload", () => {
    test("an uploaded keyboard.json with direct pins shows them and exports them unchanged", async () => {
        const layout = [];
        for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) layout.push({ matrix: [r, c], x: c, y: r });
        const grid = [["GP2", "GP3", "GP4"], ["GP5", "GP6", null]];
        layout.pop(); // no key at [1,2]
        const ctx = h.uploadJSON({ keyboard_name: "pad", processor: "RP2040", bootloader: "rp2040",
            matrix_pins: { direct: grid }, layouts: { LAYOUT: { layout } } });
        h.setView(ctx, { wiring: true });
        assert.equal(ctx.byId("boardSelect").value, "rp2040_zero", "board detected from the direct pins");
        assert.deepEqual(h.readKeys(ctx).map(k => k.rowPin), ["GP2", "GP3", "GP4", "GP5", "GP6"]);
        const info = JSON.parse((await h.exportZip(ctx))["info.json"]);
        assert.deepEqual(info.matrix_pins, { direct: grid });
    });
});
