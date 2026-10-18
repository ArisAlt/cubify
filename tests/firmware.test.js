// QMK / VIA firmware export: a KLE (e.g. AliceZero.json from editor.keyboard-tools.xyz) → keyboard
// folder whose pins and matrix are exactly the wiring on screen.
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./harness");
const fx = require("./fixtures");

const fw = (ctx, target = "via") => { ctx.byId("firmwareTarget").value = target; return h.exportZip(ctx, "exportFirmwareBtn"); };
/** Layer n of a generated keymap.c, as a keycode list in LAYOUT order. */
function layer(keymapC, n) {
    const m = new RegExp(`\\[${n}\\] = LAYOUT\\(\\n([\\s\\S]*?)\\n    \\),`).exec(keymapC);
    return m[1].split(",").map(s => s.trim()).filter(Boolean);
}
const kleStrings = kle => kle.filter(Array.isArray).flat().filter(x => typeof x === "string");

/** AliceZero.json uploaded through "Local JSON" (a raw KLE), on the board it's wired to. */
const alice = () => h.uploadJSON(fx.alice(), { boardSelect: "waveshare_2040_plus" });

describe("importing a keyboard-tools.xyz KLE file", () => {
    test("Local JSON accepts a raw KLE array and auto-routes it on the chosen board", () => {
        const ctx = alice();
        const j = ctx.app.currentJSON;
        assert.equal(j._source, "kle");
        assert.equal(j.keyboard_name, "AliceZero", "name from the KLE metadata");
        assert.equal(ctx.byId("boardSelect").value, "waveshare_2040_plus");
        // AliceZero's soldered wiring (regression, see wiring.test.js)
        assert.deepEqual(j.matrix_pins.rows, ["GP0", "GP1", "GP2", "GP3", "GP4"]);
        assert.equal(j.matrix_pins.cols[0], "GP5");
        assert.equal(j.matrix_pins.cols.at(-1), "GP22");
        assert.equal(ctx.byId("exportFirmwareBtn").disabled, false);
    });
});

describe("firmware step bar: ① load → ② VIA/QMK → ③ show wiring → ④ export", () => {
    const done = (ctx, n) => /\bdone\b/.test(ctx.byId("fwStep" + n).className);

    test("before a layout: nothing done, Export disabled, Show wiring asks for a layout", () => {
        const ctx = h.load();
        assert.equal(ctx.byId("exportFirmwareBtn").disabled, true);
        [1, 2, 3, 4].forEach(n => assert.ok(!done(ctx, n), `step ${n} not done`));
        ctx.byId("fwShowWiringBtn").click();
        assert.ok(ctx.alerts.some(a => /Load a layout first/.test(a)));
    });

    test("each step ticks off as it's done; Clear All resets", async () => {
        const ctx = alice();
        assert.ok(done(ctx, 1) && done(ctx, 2), "layout loaded, target chosen");
        assert.ok(!done(ctx, 3) && !done(ctx, 4));
        ctx.byId("fwShowWiringBtn").click();
        assert.equal(ctx.byId("showWiring").checked, true);
        assert.ok(done(ctx, 3), "wiring shown");
        assert.ok(ctx.byId("stage").children.some(c => c.tagName === "svg"), "wiring drawn");
        await fw(ctx);
        assert.ok(done(ctx, 4), "exported");
        assert.equal(ctx.byId("firmwareModal").style.display, "flex", "build instructions shown");
        assert.match(ctx.byId("firmwareModalBody").innerHTML, /build\.sh/);
        ctx.byId("firmwareTarget").value = "qmk"; ctx.byId("firmwareTarget").dispatch("change");
        assert.ok(!done(ctx, 4), "switching VIA/QMK means exporting again");
        ctx.byId("clearAllBtn").click();
        assert.equal(ctx.byId("exportFirmwareBtn").disabled, true);
        [1, 2, 3, 4].forEach(n => assert.ok(!done(ctx, n), `step ${n} reset`));
    });
});

describe("VIA firmware", () => {
    test("keyboard.json carries the wiring on screen unchanged; exporting changes nothing", async () => {
        const ctx = alice();
        h.setView(ctx, { wiring: true });
        const before = JSON.stringify(ctx.app.currentJSON), keys = h.readKeys(ctx);
        const files = await fw(ctx);
        assert.equal(JSON.stringify(ctx.app.currentJSON), before, "export must not re-route");
        const kb = JSON.parse(files["keyboard.json"]);
        assert.deepEqual(kb.matrix_pins, ctx.app.currentJSON.matrix_pins);
        assert.deepEqual(kb.layouts.LAYOUT.layout.map(k => k.matrix), keys.map(k => k.matrix), "same matrix, same key order");
        keys.forEach(k => {
            assert.equal(k.rowPin, kb.matrix_pins.rows[k.matrix[0]]);
            assert.equal(k.colPin, kb.matrix_pins.cols[k.matrix[1]]);
        });
        assert.equal(kb.keyboard_name, "alicezero");
        assert.equal(kb.processor, "RP2040");
        assert.equal(kb.bootloader, "rp2040");
        assert.equal(kb.diode_direction, "COL2ROW");
        assert.ok(!("url" in kb));
        assert.match(kb.usb.pid, /^0x[0-9A-F]{4}$/);
        assert.notEqual(kb.usb.pid, "0x0000");
        assert.deepEqual(kb.features, { bootmagic: true, extrakey: true, mousekey: true, nkro: true });
        assert.ok(keys.some(k => k.matrix.join() === kb.bootmagic.matrix.join()), "bootmagic key exists");
        const lay = kb.layouts.LAYOUT.layout;
        assert.equal(Math.min(...lay.map(k => k.x)), 0, "layout starts at x 0 (QMK warns otherwise)");
        assert.equal(Math.min(...lay.map(k => k.y)), 0, "layout starts at y 0");
    });

    test("VIA keymap + rules, and via.json matching the firmware (same IDs, matrix, keys)", async () => {
        const ctx = alice();
        const files = await fw(ctx);
        const kb = JSON.parse(files["keyboard.json"]);
        assert.equal(files["keymaps/via/rules.mk"].trim(), "VIA_ENABLE = yes");
        assert.equal(files["keymaps/via/keymap.c"], files["keymaps/default/keymap.c"]);
        const via = JSON.parse(files["via.json"]);
        assert.equal(via.name, "AliceZero");
        assert.equal(via.vendorId, kb.usb.vid);
        assert.equal(via.productId, kb.usb.pid);
        assert.deepEqual(via.matrix, { rows: 5, cols: 18 });
        const labels = kleStrings(via.layouts.keymap);
        assert.equal(labels.length, 70);
        assert.deepEqual([...labels].sort(), kb.layouts.LAYOUT.layout.map(k => k.matrix.join(",")).sort());
        assert.ok(via.layouts.keymap.every(Array.isArray), "no KLE metadata object");
        assert.ok(via.layouts.keymap.flat().some(x => x && typeof x === "object" && "r" in x), "rotated Alice keys keep their rotation");
        assert.match(files["build.sh"], /qmk compile -kb handwired\/alicezero -km via/);
        assert.match(files["BUILD.md"], /Design → Load/);
    });

    test("layer 0 comes from the KLE legends; unknown legends are KC_NO and listed", async () => {
        const ctx = alice();
        const files = await fw(ctx);
        const kb = JSON.parse(files["keyboard.json"]);
        const l0 = layer(files["keymaps/via/keymap.c"], 0);
        assert.equal(l0.length, 70);
        assert.equal(layer(files["keymaps/via/keymap.c"], 3).length, 70, "4 layers for VIA");
        const layout = ctx.app.currentJSON.layouts.LAYOUT.layout;
        const at = legend => l0[layout.findIndex(k => k.legends.join("\n").startsWith(legend))];
        assert.equal(at("Esc"), "KC_ESC");
        assert.equal(at("!\n1"), "KC_1");
        assert.equal(at("_\n-"), "KC_MINS");
        assert.equal(at("\"\n'"), "KC_QUOT");
        assert.equal(at("Q"), "KC_Q");
        assert.equal(at("PGDW"), "KC_PGDN");
        assert.equal(at("Fn"), "MO(1)");
        assert.equal(at("Backspace"), "KC_BSPC");
        const shifts = layout.map((k, i) => k.label === "Shift" ? l0[i] : null).filter(Boolean);
        assert.deepEqual(shifts.sort(), ["KC_LSFT", "KC_RSFT"]);
        const space = layout.findIndex(k => !k.label && (k.w || 1) >= 2);
        assert.equal(l0[space], "KC_SPC");
        assert.equal(l0.filter(kc => kc === "KC_NO").length, 2, "the two MOD keys");
        assert.match(files["BUILD.md"], /MOD/);
        assert.equal(kb.layouts.LAYOUT.layout.length, l0.length);
    });

    test("a loaded keymap.c is used instead of the legends", async () => {
        const ctx = h.importKLE(fx.ortho(2, 2), { board: "rp2040_zero" });
        ctx.byId("keymapUpload").dispatch("change", { target: { files: [{ text:
            "const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {\n [0] = LAYOUT(KC_A, KC_B, KC_C, KC_D),\n [1] = LAYOUT(KC_1, KC_2, KC_3, KC_4)\n};" }] } });
        const files = await fw(ctx);
        assert.deepEqual(layer(files["keymaps/via/keymap.c"], 0), ["KC_A", "KC_B", "KC_C", "KC_D"]);
        assert.deepEqual(layer(files["keymaps/via/keymap.c"], 1), ["KC_1", "KC_2", "KC_3", "KC_4"]);
        assert.equal(layer(files["keymaps/via/keymap.c"], 3).length, 4);
    });
});

describe("QMK firmware", () => {
    test("plain QMK: default keymap only, no VIA files", async () => {
        const files = await fw(alice(), "qmk");
        assert.ok(files["keymaps/default/keymap.c"]);
        assert.ok(!files["via.json"] && !files["keymaps/via/keymap.c"]);
        assert.match(files["build.sh"], /-km default/);
        assert.ok(!files["config.h"], "a monolithic matrix needs no config.h");
    });

    test("split (2× Pro Micro): split config in keyboard.json, handedness in config.h, LTO for VIA", async () => {
        const ctx = h.importKLE(fx.ortho(4, 6, { gap: 3 }), { split: true, board: "pro_micro" });
        const files = await fw(ctx);
        const kb = JSON.parse(files["keyboard.json"]);
        assert.equal(kb.processor, "atmega32u4");
        assert.equal(kb.split.enabled, true);
        assert.deepEqual(kb.split.serial, { driver: "bitbang", pin: "D2" });
        assert.deepEqual(kb.split.usb_detect, { enabled: true });
        assert.deepEqual(kb.split.matrix_pins.right.rows, kb.matrix_pins.rows);
        assert.match(files["config.h"], /#define MASTER_LEFT/);
        assert.doesNotMatch(files["config.h"], /SPLIT_USB_DETECT|MATRIX_ROW_PINS/);
        assert.match(files["keymaps/via/rules.mk"], /LTO_ENABLE = yes/);
        assert.deepEqual(JSON.parse(files["via.json"]).matrix, { rows: 8, cols: 6 });
    });

    test("direct wiring: matrix_pins.direct, no diode_direction", async () => {
        const ctx = h.importKLE(fx.ortho(3, 3), { board: "rp2040_zero", wiring: "direct" });
        const kb = JSON.parse((await fw(ctx))["keyboard.json"]);
        assert.deepEqual(kb.matrix_pins, ctx.app.currentJSON.matrix_pins);
        assert.ok(!("diode_direction" in kb));
    });

    test("ZMK-only boards are refused", async () => {
        const ctx = h.importKLE(fx.ortho(4, 6, { gap: 3 }), { split: true, board: "nice_nano" });
        assert.deepEqual(Object.keys(await fw(ctx)), []);
        assert.ok(ctx.alerts.some(a => /ZMK, not QMK, VIA or Vial/.test(a)));
    });
});
