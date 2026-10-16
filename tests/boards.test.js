// Board dropdowns: monolithic (one controller) vs split (two controllers, TRRS or wireless).
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./harness");
const fx = require("./fixtures");

const groups = select => select.children.filter(c => c.tagName === "optgroup");
const options = el => el.children.filter(c => c.tagName === "option");
const LINK = { waveshare_2040_plus: "GP28", rp2040_zero: "GP29", rp2040_tiny: "GP29", pro_micro: "D2" };

describe("board dropdowns", () => {
    test("both dropdowns group boards into Monolithic (one controller) and Split (two controllers)", () => {
        const ctx = h.load();
        for (const id of ["boardSelect", "kleBoardSelect"]) {
            const g = groups(ctx.byId(id));
            assert.equal(g.length, 2, `${id}: two groups`);
            assert.match(g[0].label, /Monolithic · one controller/);
            assert.match(g[1].label, /Split · two controllers/);
            for (const o of options(g[0])) {
                assert.ok(!o.value.startsWith("split:"), `${o.value} is in the monolithic group`);
                assert.ok(!/split|2×/i.test(o.textContent), `monolithic label "${o.textContent}" mentions split`);
            }
            for (const o of options(g[1]).filter(o => o.value !== "split:auto")) {
                assert.ok(o.value.startsWith("split:"), `${o.value} is in the split group`);
                assert.match(o.textContent, /^2× .* · (TRRS cable|wireless \(ZMK\))$/, o.textContent);
            }
            // every board appears once in each group
            const ids = g.map(gr => options(gr).map(o => o.value.replace(/^split:/, "")).filter(v => v !== "auto").sort());
            assert.deepEqual(ids[0], ids[1]);
        }
        assert.equal(options(ctx.byId("boardSelect"))[0].value, "json_file", "main dropdown keeps 'Read pins from JSON'");
    });
});

describe("monolithic vs split routing", () => {
    test("monolithic choice: one controller, no link pin", () => {
        const ctx = h.importKLE(fx.ortho(4, 12), { board: "rp2040_zero" });
        const j = ctx.app.currentJSON;
        assert.equal(j.split, false);
        assert.equal(j.split_link, undefined);
        assert.equal(ctx.byId("boardSelect").value, "rp2040_zero");
        assert.match(ctx.byId("boardInfo").textContent, /One controller/);
    });

    for (const [board, pin] of Object.entries(LINK)) {
        test(`2× ${board} over TRRS: link pin ${pin} is reserved on each half and exported`, async () => {
            const ctx = h.importKLE(fx.ortho(4, 6, { gap: 3 }), { split: true, board });
            const j = ctx.app.currentJSON;
            assert.equal(j.split, true);
            assert.deepEqual(j.split_link, { type: "trrs", pin });
            assert.ok(![...j.matrix_pins.rows, ...j.matrix_pins.cols].includes(pin), `${pin} must not be a matrix pin`);
            assert.equal(ctx.byId("boardSelect").value, `split:${board}`);
            assert.match(ctx.byId("boardInfo").textContent, new RegExp(`Two controllers.*TRRS cable on ${pin}`));
            const files = await h.exportZip(ctx);
            const info = JSON.parse(files["info.json"]);
            assert.deepEqual(info.split, { enabled: true, serial: { driver: board === "pro_micro" ? "bitbang" : "vendor", pin } });
            assert.match(files["config.h"], new RegExp(`TRRS cable on ${pin}`));
        });
    }

    test("2× nice!nano wireless: no link pin, export refused (ZMK only)", async () => {
        const ctx = h.importKLE(fx.ortho(4, 6, { gap: 3 }), { split: true, board: "nice_nano" });
        assert.deepEqual(ctx.app.currentJSON.split_link, { type: "wireless" });
        assert.match(ctx.byId("boardInfo").textContent, /wirelessly \(ZMK\)/);
        const files = await h.exportZip(ctx);
        assert.deepEqual(Object.keys(files), []);
    });

    test("the link pin counts against the pin budget", () => {
        // 5 rows + 15 cols = 20 pins per half: fits a monolithic RP2040-Zero, not a TRRS split (19 left)
        const mono = h.importKLE(fx.ortho(5, 15), { board: "rp2040_zero" });
        assert.ok(!mono.alerts.some(a => /not have enough pins/.test(a)), "20 pins fit one RP2040-Zero");
        const split = h.importKLE(fx.ortho(5, 15, { gap: 3 }), { split: true, board: "rp2040_zero" });
        assert.ok(split.alerts.some(a => /not have enough pins/.test(a)), "19 free pins per half are too few");
    });

    test("auto-select for a split picks the smallest board that fits after reserving the link pin", () => {
        const ctx = h.importKLE(fx.ortho(4, 6, { gap: 3 }), { split: true, board: "auto" });
        assert.equal(ctx.byId("boardSelect").value, "split:pro_micro");
        assert.deepEqual(ctx.app.currentJSON.split_link, { type: "trrs", pin: "D2" });
    });

    test("changing the main dropdown re-routes the imported layout, without popups", () => {
        const ctx = h.importKLE(fx.ortho(4, 6, { gap: 3 }), { split: true, board: "rp2040_zero" });
        const sel = ctx.byId("boardSelect"), alertsBefore = ctx.alerts.length;
        const rowsOf = () => Math.max(...Object.values(ctx.app.currentJSON.layouts)[0].layout.map(k => k.matrix[0])) + 1;
        assert.equal(rowsOf(), 8, "split: 4 rows per half → 8 matrix rows");

        sel.value = "rp2040_zero"; sel.dispatch("change");
        assert.equal(ctx.app.currentJSON.split, false);
        assert.equal(rowsOf(), 4, "monolithic: the same keys become 4 rows on one controller");
        assert.equal(ctx.app.currentJSON.split_link, undefined);

        sel.value = "split:pro_micro"; sel.dispatch("change");
        assert.equal(ctx.app.currentJSON.split, true);
        assert.deepEqual(ctx.app.currentJSON.split_link, { type: "trrs", pin: "D2" });
        assert.equal(ctx.alerts.length, alertsBefore, "re-routing from the dropdown shows no popups");
    });

    test("an uploaded QMK file keeps its own wiring when the dropdown changes", () => {
        const ctx = h.uploadJSON(fx.qmkSplitUpload());
        const before = JSON.stringify(ctx.app.currentJSON.matrix_pins);
        const sel = ctx.byId("boardSelect");
        sel.value = "rp2040_zero"; sel.dispatch("change");
        assert.equal(JSON.stringify(ctx.app.currentJSON.matrix_pins), before);
    });
});
