// Board data and board switching: every board's pins hang together, and switching the MCU Profile
// dropdown from board to board re-routes the layout with nothing missing, stale or wrong.
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./harness");
const fx = require("./fixtures");

const app = () => h.load().app;
const ids = () => Object.keys(app().BOARD_META);

describe("board data", () => {
    test("every board has a pin profile, reserved-pin list, LED supply and firmware info", () => {
        const { BOARD_META, boardProfiles, ledSupply } = app();
        assert.deepEqual(Object.keys(boardProfiles).sort(), Object.keys(BOARD_META).sort(), "one profile per dropdown board");
        for (const [id, m] of Object.entries(BOARD_META)) {
            const pr = boardProfiles[id];
            assert.ok(fx.RESERVED[id], `${id}: reserved pins listed in fixtures.RESERVED`);
            assert.ok(m.mcu, `${id}: mcu`);
            if (m.link === "trrs") {
                assert.ok(m.boot, `${id}: QMK bootloader`);
                assert.ok(pr.pins.includes(m.splitPin), `${id}: TRRS pin ${m.splitPin} is one of its GPIOs`);
            }
            assert.ok(ledSupply(id).vdd && ledSupply(id).vss, `${id}: LED + and − labels`);
            assert.equal(new Set(pr.pins).size, pr.pins.length, `${id}: no pin listed twice`);
            for (const p of [...pr.rows, ...pr.cols]) assert.ok(pr.pins.includes(p), `${id}: default pin ${p} is in its pins`);
            assert.deepEqual(pr.rows.filter(p => pr.cols.includes(p)), [], `${id}: default rows and cols don't share a pin`);
            assert.deepEqual(pr.pins.filter(p => fx.RESERVED[id].includes(p)), [], `${id}: no reserved pin offered`);
        }
    });

    test("pin counts match the official pinouts", () => {
        const { boardProfiles: b } = app();
        assert.equal(b.raspberry_pi_pico.pins.length, 26, "Pico: GP0-22 + GP26-28");
        assert.deepEqual(b.raspberry_pi_pico.pins, b.waveshare_2040_plus.pins, "RP2040-Plus has the Pico header");
        assert.equal(b.rp2040_zero.pins.length, 20);
        assert.deepEqual(b.rp2040_tiny.pins, b.rp2040_zero.pins, "Tiny: GP0-15 + GP26-29 like the Zero");
        assert.equal(b.pro_micro.pins.length, 18);
        // nice!nano: the 16 edge pins come first; NFC (P0.09/P0.10) and the inner pad P1.02 last
        assert.deepEqual(b.nice_nano.pins.slice(-3), ["P0.09", "P0.10", "P1.02"]);
        assert.ok(![...b.nice_nano.rows, ...b.nice_nano.cols].some(p => ["P0.09", "P0.10", "P1.02"].includes(p)));
    });

    test("the Pico is offered as one controller and as a split, and builds firmware", async () => {
        const ctx = h.importKLE(fx.ortho(4, 6, { gap: 3 }), { split: true, board: "raspberry_pi_pico" });
        assert.equal(ctx.byId("boardSelect").value, "split:raspberry_pi_pico");
        assert.deepEqual(ctx.app.currentJSON.split_link, { type: "trrs", pin: "GP28" });
        const kb = JSON.parse((await h.exportZip(ctx, "via"))["keyboard.json"]);
        assert.equal(kb.processor, "RP2040");
        assert.equal(kb.bootloader, "rp2040");
        const md = (await h.exportZip(ctx, "qmk"))["BUILD.md"];
        assert.match(md, /hold its BOOTSEL button/);
        assert.doesNotMatch(md, /double-tap/, "the Pico has no RESET button");
    });
});

describe("switching boards", () => {
    /** What must hold right after a switch to `choice` ("id" or "split:id"). */
    function checkAfterSwitch(ctx, choice, before) {
        const { BOARD_META, boardProfiles } = ctx.app;
        const id = choice.replace(/^split:/, ""), split = choice.startsWith("split:");
        const j = ctx.app.currentJSON, pool = boardProfiles[id].pins, link = BOARD_META[id].link === "trrs" && split ? BOARD_META[id].splitPin : null;
        assert.equal(ctx.byId("boardSelect").value, choice);
        const keys = h.readKeys(ctx);
        assert.deepEqual(keys.map(k => k.matrix), before.matrix, `${choice}: same keys and matrix positions`);
        const used = j.matrix_pins.direct ? j.matrix_pins.direct.flat().filter(Boolean) : [...j.matrix_pins.rows, ...j.matrix_pins.cols];
        assert.equal(new Set(used).size, used.length, `${choice}: no pin used twice`);
        used.forEach(p => assert.ok(pool.includes(p), `${choice}: ${p} is not a ${id} pin (left over from another board?)`));
        if (link) assert.ok(!used.includes(link), `${choice}: TRRS pin ${link} kept out of the matrix`);
        keys.forEach(k => {
            assert.ok(!/N\/A/.test(k.rowPin) && !/N\/A/.test(k.colPin), `${choice}: key ${k.i} has no pin`);
            assert.ok(pool.includes(k.rowPin), `${choice}: key ${k.i} shows ${k.rowPin}`);
        });
        assert.equal(!!j.split, split, `${choice}: split flag`);
        if (split) assert.deepEqual(j.split_link, BOARD_META[id].link === "trrs" ? { type: "trrs", pin: link } : { type: "wireless" });
        else assert.equal(j.split_link, undefined, `${choice}: no link left over from a split`);
        const info = ctx.byId("boardInfo").textContent;
        if (split && link) assert.match(info, new RegExp(`TRRS cable on ${link}`));
        assert.equal(/\bdone\b/.test(ctx.byId("fwStep1").className), true, "step ① stays done");
        return used;
    }

    for (const [name, kle, opts, group] of [
        ["one controller, diode matrix", fx.ortho(4, 4), {}, "mono"],
        ["one controller, direct wiring", fx.ortho(3, 3), { wiring: "direct" }, "mono"],
        ["split, mirrored right half", fx.ortho(4, 6, { gap: 3 }), { split: true }, "split"],
    ]) {
        test(`${name}: every board in turn, then back to the first`, async () => {
            const ctx = h.importKLE(kle, { board: "rp2040_zero", ...opts });
            if (opts.split) { ctx.byId("rightHalfWiring").value = "same"; ctx.byId("rightHalfWiring").dispatch("change"); }
            const before = { matrix: h.readKeys(ctx).map(k => k.matrix) };
            const alerts = ctx.alerts.length;
            const choices = ids().map(id => (group === "split" ? "split:" : "") + id);
            const seen = {};
            for (const choice of [...choices, choices[0]]) {
                const sel = ctx.byId("boardSelect");
                sel.value = choice; sel.dispatch("change");
                const used = checkAfterSwitch(ctx, choice, before);
                if (seen[choice]) assert.deepEqual(used, seen[choice], `${choice}: same pins as the first time`);
                seen[choice] = used;
                if (opts.wiring) assert.equal(ctx.byId("wiringSelect").value, "direct", `${choice}: still direct wiring`);
                if (opts.split) assert.equal(ctx.byId("rightHalfWiring").value, "same", `${choice}: right-half choice kept`);
                const files = await h.exportZip(ctx, "via");
                const id = choice.replace(/^split:/, ""), m = ctx.app.BOARD_META[id];
                if (m.link === "wireless") {
                    assert.deepEqual(Object.keys(files), [], `${choice}: ZMK-only, no firmware`);
                } else {
                    const kb = JSON.parse(files["keyboard.json"]);
                    assert.equal(kb.processor, m.mcu, `${choice}: processor`);
                    assert.equal(kb.bootloader, m.boot, `${choice}: bootloader`);
                    assert.deepEqual(kb.matrix_pins, ctx.app.currentJSON.matrix_pins, `${choice}: firmware pins = pins on screen`);
                }
            }
            // re-routing from the dropdown is quiet; the only alerts are the ZMK refusals
            assert.ok(ctx.alerts.slice(alerts).every(a => /ZMK/.test(a)), ctx.alerts.slice(alerts).join(" | "));
        });
    }
});
