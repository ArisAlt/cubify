// Split keyboards: two controllers, each half's rows/columns run to ITS OWN controller,
// columns mirrored (QMK lily58/sofle style) or same direction (handwired dactyl style).
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./harness");
const fx = require("./fixtures");

const near = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;

function setup({ board = "rp2040_zero", wiring = "mirrored", layout = fx.lilyLike(), split = true, bottom = false } = {}) {
    const ctx = h.load({ split, board });
    ctx.byId("rightHalfWiring").value = wiring;
    ctx.byId("kleInput").value = JSON.stringify(layout);
    ctx.byId("processKleBtn").click();
    h.setView(ctx, { bottom, wiring: true });
    return ctx;
}

describe("right half column numbering", () => {
    const outerFirst = (keys, half) => {
        // in the TOP view: left half's outer edge = smallest x, right half's = largest x
        const ks = keys.filter(k => (k.matrix[0] >= 5) === (half === "right"));
        const col0 = ks.filter(k => k.matrix[1] === 0), others = ks.filter(k => k.matrix[1] !== 0);
        const avg = a => a.reduce((n, k) => n + k.cx, 0) / a.length;
        return half === "right" ? avg(col0) > avg(others) : avg(col0) < avg(others);
    };
    test("mirrored (default, like QMK lily58/rev1): col 0 is the OUTER column on both halves", () => {
        const keys = h.readKeys(setup());
        assert.ok(outerFirst(keys, "left"), "left col 0 at the outer (left) edge");
        assert.ok(outerFirst(keys, "right"), "right col 0 at the outer (right) edge");
    });
    test("same direction (like QMK handwired/dactyl_manuform): col 0 is the LEFT column on both halves", () => {
        const keys = h.readKeys(setup({ wiring: "same" }));
        assert.ok(outerFirst(keys, "left"));
        assert.ok(!outerFirst(keys, "right"), "right col 0 at its inner (left) edge");
    });
    test("mirrored / same direction: the right controller declares the same pin list, explicitly", async () => {
        for (const wiring of ["mirrored", "same"]) {
            const ctx = setup({ wiring });
            const info = JSON.parse((await h.exportZip(ctx))["info.json"]);
            assert.deepEqual(info.split.matrix_pins.right, info.matrix_pins, `${wiring}: right pins = left pins`);
        }
    });

    // Which pin does the PHYSICAL outer column of each half get?
    const outerPins = ctx => {
        const keys = h.readKeys(ctx), R = ctx.app.currentJSON.matrix_pins.rows.length;
        const outer = (side, pick) => keys.filter(k => (k.matrix[0] >= R ? 1 : 0) === side).reduce((m, k) => pick(k.cx, m.cx) ? k : m);
        return { left: outer(0, (a, b) => a < b).colPin, right: outer(1, (a, b) => a > b).colPin };
    };
    test("mirrored and flipped-in-firmware wire the same pin to both outer columns; same direction doesn't", () => {
        const m = outerPins(setup({ wiring: "mirrored" })), f = outerPins(setup({ wiring: "flipped" })), s = outerPins(setup({ wiring: "same" }));
        assert.equal(m.left, m.right, "mirrored");
        assert.equal(f.left, f.right, "flipped in firmware");
        assert.notEqual(s.left, s.right, "same direction");
    });
    test("flipped in firmware: matrix numbered left→right, right controller gets a reversed column list", async () => {
        const ctx = setup({ wiring: "flipped" });
        const keys = h.readKeys(ctx);
        assert.ok(!outerFirst(keys, "right"), "numbering stays left→right on the right half");
        const { cols } = ctx.app.currentJSON.matrix_pins;
        const right = ctx.app.currentJSON.matrix_pins_right.cols;
        assert.equal(right.length, cols.length, "QMK needs the same pin count on both halves");
        const used = right.filter(p => p !== "NO_PIN");
        assert.deepEqual(used, cols.slice(0, used.length).reverse());
        const files = await h.exportZip(ctx);
        const info = JSON.parse(files["info.json"]);
        assert.deepEqual(info.split.matrix_pins.right.cols, right.map(p => p === "NO_PIN" ? null : p), "NO_PIN is null in JSON");
        assert.match(files["config.h"], new RegExp(`#define MATRIX_COL_PINS_RIGHT \\{ ${right.join(", ")} \\}`));
        assert.match(h.readKeys(ctx).length ? ctx.byId("splitNotice").innerHTML : "", /own column order/);
    });
    test("a QMK file's own right-hand pins (split.matrix_pins.right, like keebio/iris rev8) are used for the right half", () => {
        const f = fx.qmkSplitUpload();
        f.split.matrix_pins = { right: { rows: ["GP22", "GP19", "GP18", "GP17"], cols: ["GP27", "GP28", "GP3", "GP6", "GP29", "GP16"] } };
        const ctx = h.uploadJSON(f);
        h.setView(ctx, { wiring: true });
        for (const k of h.readKeys(ctx)) {
            const right = k.matrix[0] >= 4;
            const pins = right ? f.split.matrix_pins.right : f.matrix_pins;
            assert.equal(k.rowPin, pins.rows[k.matrix[0] % 4], `${right ? "right" : "left"} key row pin`);
            assert.equal(k.colPin, pins.cols[k.matrix[1]], `${right ? "right" : "left"} key col pin`);
        }
        const c = h.readControllers(ctx);
        assert.ok(c.homeruns.filter(r => r.side === 1).every(r => f.split.matrix_pins.right[r.kind === "row" ? "rows" : "cols"].includes(r.pin)),
            "right controller block is labelled with the right-hand pins");
    });
});

describe("a controller per half", () => {
    for (const bottom of [false, true]) {
        test(`each half's rows and columns run to its own controller (${bottom ? "solder" : "top"} view)`, () => {
            const ctx = setup({ bottom });
            const keys = h.readKeys(ctx), c = h.readControllers(ctx);
            const { rows, cols } = ctx.app.currentJSON.matrix_pins;
            assert.equal(c.blocks.length, 2, "two controller blocks");
            const sideOf = k => (k.matrix[0] >= rows.length ? 1 : 0);
            for (const side of [0, 1]) {
                const ks = keys.filter(k => sideOf(k) === side);
                const wantRows = new Set(ks.map(k => k.matrix[0] % rows.length)), wantCols = new Set(ks.map(k => k.matrix[1]));
                const mine = c.homeruns.filter(r => r.side === side);
                assert.deepEqual(new Set(mine.filter(r => r.kind === "row").map(r => r.idx)), wantRows, `side ${side}: one home-run per row`);
                assert.deepEqual(new Set(mine.filter(r => r.kind === "col").map(r => r.idx)), wantCols, `side ${side}: one home-run per column`);
                assert.equal(mine.length, wantRows.size + wantCols.size, "no duplicates");
                const block = c.blocks.find(b => b.side === side);
                const xs = ks.map(k => k.cx), lo = Math.min(...xs), hi = Math.max(...xs);
                for (const r of mine) {
                    assert.equal(r.ctrl, side, `${r.kind} ${r.idx} of side ${side} goes to the other controller`);
                    assert.equal(r.pin, r.kind === "row" ? rows[r.idx] : cols[r.idx], `${r.kind} ${r.idx} lands on the wrong pin`);
                    // starts on a key of this half, in this row/column; ends on this half's block
                    const start = r.path[0], end = r.path[r.path.length - 1];
                    const fromKey = ks.find(k => Math.abs(k.cx - start[0]) < 0.01 &&
                        (r.kind === "row" ? k.matrix[0] % rows.length === r.idx : k.matrix[1] === r.idx));
                    assert.ok(fromKey, `${r.kind} ${r.idx} home-run doesn't start on its own half's key`);
                    assert.ok(end[0] >= block.x1 && end[0] <= block.x2 && Math.abs(end[1] - block.y) < 0.01, "ends on its controller");
                }
                // the block sits under its own half (overlaps the half's span), below its keys
                assert.ok(block.x2 > lo && block.x1 < hi + h.UNIT, `side ${side} controller isn't under its half`);
                assert.ok(block.y > Math.max(...ks.map(k => k.cy)), "controller below the keys");
            }
            // titles say which half
            const titleOf = side => c.titles.find(t => t.side === side).text;
            const leftSide = c.blocks.sort((a, b) => a.x1 - b.x1)[0].side; // block drawn on the left of the screen
            assert.match(titleOf(leftSide), bottom ? /^RIGHT controller/ : /^LEFT controller/,
                bottom ? "solder view is mirrored: the right half's controller is on the left" : "left half → LEFT controller");
        });
    }

    test("home-runs never run on top of each other (distinct vertical lanes per half)", () => {
        for (const layout of [fx.lilyLike(), fx.alice(), fx.ortho(4, 6, { gap: 3 })]) {
            const c = h.readControllers(setup({ layout, board: "waveshare_2040_plus" }));
            const xs = c.homeruns.map(r => r.path[r.path.length - 1][0]).sort((a, b) => a - b);
            xs.slice(1).forEach((x, i) => assert.ok(x - xs[i] >= 3, `two home-runs share the lane at x≈${x.toFixed(0)}`));
            const [a, b] = c.blocks.sort((p, q) => p.x1 - q.x1);
            assert.ok(a.x2 <= b.x1, `the two controller blocks overlap (${a.x2.toFixed(0)} > ${b.x1.toFixed(0)})`);
        }
    });

    test("TRRS link drawn between the two controllers with its pin", () => {
        const c = h.readControllers(setup({ board: "waveshare_2040_plus" }));
        assert.equal(c.link.type, "trrs");
        assert.match(c.linkLabel, /TRRS: GP28 ↔ GP28 · 5V · GND/);
    });
    test("wireless split: BLE link, no cable", () => {
        const c = h.readControllers(setup({ board: "nice_nano", layout: fx.ortho(4, 6, { gap: 3 }) }));
        assert.equal(c.link.type, "wireless");
        assert.match(c.linkLabel, /BLE/);
    });
    test("monolithic: one controller, every row and column runs to it, no link", () => {
        const ctx = setup({ split: false, board: "waveshare_2040_plus", layout: fx.alice() });
        const c = h.readControllers(ctx);
        const { rows, cols } = ctx.app.currentJSON.matrix_pins;
        assert.equal(c.blocks.length, 1);
        assert.match(c.titles[0].text, /^Controller · Waveshare RP2040-Plus/);
        assert.equal(c.homeruns.length, rows.length + cols.length);
        assert.equal(c.link, null);
    });
});

describe("split notice (shown when switching to a split)", () => {
    const notice = ctx => ctx.byId("splitNotice");
    const text = ctx => notice(ctx).innerHTML.replace(/<[^>]+>/g, "");

    test("monolithic: no split notice", () => {
        const ctx = setup({ split: false, board: "waveshare_2040_plus", layout: fx.alice() });
        assert.equal(notice(ctx).style.display, "none");
    });

    test("switching monolithic → split from the dropdown shows the notice", () => {
        const ctx = setup({ split: false, board: "rp2040_zero", layout: fx.ortho(4, 6, { gap: 3 }) });
        assert.equal(notice(ctx).style.display, "none");
        const sel = ctx.byId("boardSelect");
        sel.value = "split:rp2040_zero"; sel.dispatch("change");
        assert.equal(notice(ctx).style.display, "block");
        assert.match(text(ctx), /Split keyboard, two controllers\. Left half 24 keys \(4 rows × 6 columns\), right half 24 keys \(4 × 6\)/);
        assert.equal(notice(ctx).attrs["data-overlap"], "", "clean gap: no overlap warning");
        assert.ok(!/unconnected/.test(text(ctx)), "equal halves: no unused pins");
    });

    test("uneven halves are allowed: explains why, names the unused pins", () => {
        // 4×5 on the left, 4×7 on the right
        const kle = [];
        for (let r = 0; r < 4; r++) {
            const row = [];
            for (let c = 0; c < 5; c++) row.push(`L${r}${c}`);
            row.push({ x: 3 });
            for (let c = 0; c < 7; c++) row.push(`R${r}${c}`);
            kle.push(row);
        }
        const ctx = setup({ layout: kle });
        const t = text(ctx);
        assert.match(t, /Left half 20 keys .* right half 28 keys/);
        assert.match(t, /Most splits are symmetric .* but uneven halves also work: QMK splits such as Keebio Quefrency \(30 \+ 37 keys\) and Sinc \(38 \+ 44\)/);
        const { cols } = ctx.app.currentJSON.matrix_pins;
        assert.equal(cols.length, 7, "one column pin list sized for the bigger half");
        assert.match(t, new RegExp(`On the left controller, column pins ${cols.slice(5).join(", ")} have no keys on that half`));
        assert.ok(!/On the right controller/.test(t));
    });

    test("halves that touch or overlap (a layout not drawn as a split, e.g. AliceZero) get a warning", () => {
        const ctx = setup({ layout: fx.alice(), board: "waveshare_2040_plus" });
        assert.equal(notice(ctx).attrs["data-overlap"], "1");
        assert.match(text(ctx), /⚠️ The halves are only 0\.\d+u apart .* the split line is a guess/);
    });
});

test("a QMK file's halves come from its matrix: no 'split line is a guess' warning even if they touch", () => {
    const f = fx.qmkSplitUpload();
    // move the right half right up against the left half
    Object.values(f.layouts)[0].layout.forEach(e => { if (e.matrix[0] >= 4) e.x -= 3; });
    const ctx = h.uploadJSON(f);
    assert.equal(ctx.byId("splitNotice").style.display, "block");
    assert.equal(ctx.byId("splitNotice").attrs["data-overlap"], "");
});
